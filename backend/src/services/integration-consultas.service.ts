// ============================================================================
// integration-consultas.service — Consultas médicas creadas por integraciones
// externas (hoy: Maluwa360) vía POST /api/integration/consultas.
//
// Flujo (el payload ya viene validado por helpers/integracion-maluwa.helper):
//   1) Idempotencia: si (source, externalId) ya existe → 200 con la misma consulta.
//   2) El código de médico debe existir en el tenant (si no, la consulta nunca
//      aparecería en ningún panel: es la misma regla del login del panel).
//   3) En UNA transacción: se crea la HistoriaClinica PENDIENTE y luego se reclama
//      el externalId en `integration_consultas` (en ese orden por la FK
//      historia_id → HistoriaClinica._id). Si otra petición con el mismo
//      externalId ganó la carrera (el INSERT espera su commit en el índice único
//      y no inserta), ROLLBACK —se descarta también nuestra historia— y se
//      devuelve la suya (200).
//   4) Best-effort, fuera de la transacción (nunca tumban la respuesta 201):
//      pre-crear la sala de video y, si notificar=true, enviar el WhatsApp con la
//      misma plantilla de "consulta suelta" que usa /api/video/whatsapp/send-suelta.
// ============================================================================

import { randomBytes, randomUUID } from 'crypto';
import postgresService from './postgres.service';
import historiaClinicaPostgresService from './historia-clinica-postgres.service';
import twilioService from './twilio.service';
import whatsappService from './whatsapp.service';
import {
  ConsultaIntegracionInput,
  MALUWA360_SOURCE,
  TIPO_EXAMEN_POR_TIPO,
  construirMotivoConsulta,
  construirUrlsConsulta,
  nombreVisiblePaciente,
} from '../helpers/integracion-maluwa.helper';

export interface ConsultaIntegracionCreada {
  roomName: string;
  historiaId: string;
  patientUrl: string;
  doctorUrl: string;
}

export type ResultadoCrearConsulta =
  | { ok: true; status: 200 | 201; consulta: ConsultaIntegracionCreada }
  | { ok: false; status: 422 | 500 | 503; code: string; error: string };

/** Tenant con el que se crean las historias (debe coincidir con el del panel del médico). */
export function getIntegrationTenantId(): string {
  return (process.env.MALUWA360_TENANT_ID || '').trim() || 'bsl';
}

/** Base de patientUrl/doctorUrl: la misma APP_URL que usan WhatsApp y las alertas. */
export function getAppBaseUrl(): string {
  return ((process.env.APP_URL || '').trim() || 'https://medico-bsl.com').replace(/\/+$/, '');
}

/**
 * Mismo formato que el panel (`consulta-<ts36>-<rand>`), pero con aleatoriedad
 * criptográfica: el nombre de sala viaja en el link del paciente.
 */
export function generarRoomName(): string {
  return `consulta-${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`;
}

const ERROR_BD: ResultadoCrearConsulta = {
  ok: false,
  status: 503,
  code: 'DB_UNAVAILABLE',
  error: 'Base de datos no disponible. Reintente con el mismo externalId.',
};

function filaAConsulta(row: any): ConsultaIntegracionCreada {
  return {
    roomName: String(row.room_name),
    historiaId: String(row.historia_id),
    patientUrl: String(row.patient_url),
    doctorUrl: String(row.doctor_url),
  };
}

class IntegrationConsultasService {
  /** undefined = error de BD; null = no existe. */
  async buscarPorExternalId(
    source: string,
    externalId: string
  ): Promise<ConsultaIntegracionCreada | null | undefined> {
    const rows = await postgresService.query(
      `SELECT room_name, historia_id, patient_url, doctor_url
         FROM integration_consultas
        WHERE source = $1 AND external_id = $2
        LIMIT 1`,
      [source, externalId]
    );
    if (rows === null) return undefined;
    return rows.length > 0 ? filaAConsulta(rows[0]) : null;
  }

  async crearConsulta(input: ConsultaIntegracionInput): Promise<ResultadoCrearConsulta> {
    const source = MALUWA360_SOURCE;
    const tenantId = getIntegrationTenantId();

    // 1) Idempotencia
    const existente = await this.buscarPorExternalId(source, input.externalId);
    if (existente === undefined) return ERROR_BD;
    if (existente) {
      console.log(`↩️  [integration] externalId ${input.externalId} ya existía → historia ${existente.historiaId}`);
      return { ok: true, status: 200, consulta: existente };
    }

    // 2) El médico debe existir en el tenant
    const medicoRows = await postgresService.query(
      `SELECT 1 FROM "HistoriaClinica" WHERE "medico" = $1 AND tenant_id = $2 LIMIT 1`,
      [input.medico, tenantId]
    );
    if (medicoRows === null) return ERROR_BD;
    if (medicoRows.length === 0) {
      return {
        ok: false,
        status: 422,
        code: 'MEDICO_NO_REGISTRADO',
        error: `El código de médico "${input.medico}" no está registrado en el tenant "${tenantId}".`,
      };
    }

    // 3) Identificadores y links
    const historiaId = randomUUID();
    const roomName = generarRoomName();
    const nombrePaciente = nombreVisiblePaciente(input);
    const { patientUrl, doctorUrl, roomNameWithParams } = construirUrlsConsulta({
      baseUrl: getAppBaseUrl(),
      roomName,
      historiaId,
      medico: input.medico,
      nombrePaciente,
      empresa: source,
      celular: input.celularContacto,
    });

    // 4) Crear historia + reclamar externalId, atómico
    const client = await postgresService.getClient();
    if (!client) return ERROR_BD;

    let creada = false;
    try {
      await client.query('BEGIN');

      // Primero la historia: integration_consultas.historia_id tiene FK a HistoriaClinica._id.
      const insertada = await historiaClinicaPostgresService.crearPendiente(
        {
          _id: historiaId,
          numeroId: input.paciente.documento,
          primerNombre: input.paciente.primerNombre,
          segundoNombre: input.paciente.segundoNombre,
          primerApellido: input.paciente.primerApellido,
          segundoApellido: input.paciente.segundoApellido,
          celular: input.celularContacto, // el del acudiente si es menor (validado)
          fechaNacimiento: input.paciente.fechaNacimiento,
          codEmpresa: source,
          empresa: input.institucion?.nombre || source,
          tipoExamen: TIPO_EXAMEN_POR_TIPO[input.tipo],
          medico: input.medico,
          motivoConsulta: construirMotivoConsulta(input),
          tenantId,
        },
        client
      );
      if (!insertada) throw new Error(`No se insertó la historia clínica ${historiaId}`);

      const claim = await client.query(
        `INSERT INTO integration_consultas (
           source, external_id, historia_id, room_name, tenant_id, patient_url, doctor_url,
           tipo, medico, institucion, acudiente, consentimiento
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb)
         ON CONFLICT (source, external_id) DO NOTHING
         RETURNING id`,
        [
          source,
          input.externalId,
          historiaId,
          roomName,
          tenantId,
          patientUrl,
          doctorUrl,
          input.tipo,
          input.medico,
          input.institucion ? JSON.stringify(input.institucion) : null,
          input.acudiente ? JSON.stringify(input.acudiente) : null,
          JSON.stringify(input.consentimiento),
        ]
      );

      if (claim.rows.length === 0) {
        // Otra petición con el mismo externalId se nos adelantó: descartamos también la historia.
        await client.query('ROLLBACK');
      } else {
        await client.query('COMMIT');
        creada = true;
      }
    } catch (error: any) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* conexión rota: el pool la descarta */
      }
      console.error(
        `❌ [integration] Error creando consulta externalId=${input.externalId}:`,
        error?.message || error
      );
      return {
        ok: false,
        status: 500,
        code: 'CREATE_FAILED',
        error: 'No se pudo crear la consulta. Reintente con el mismo externalId.',
      };
    } finally {
      client.release();
    }

    if (!creada) {
      const ganadora = await this.buscarPorExternalId(source, input.externalId);
      if (ganadora) return { ok: true, status: 200, consulta: ganadora };
      return {
        ok: false,
        status: 500,
        code: 'CREATE_FAILED',
        error: 'No se pudo crear la consulta. Reintente con el mismo externalId.',
      };
    }

    console.log(
      `✅ [integration] Consulta ${source} creada: externalId=${input.externalId} historia=${historiaId} sala=${roomName}`
    );

    // 5) Best-effort
    await this.preCrearSala(roomName);
    if (input.notificar) {
      await this.notificarWhatsApp({
        celular: input.celularContacto,
        nombre: nombrePaciente,
        empresa: source,
        roomNameWithParams,
        patientUrl,
        tenantId,
      });
    }

    return { ok: true, status: 201, consulta: { roomName, historiaId, patientUrl, doctorUrl } };
  }

  /**
   * Pre-crea la sala en el proveedor de video. No es fatal: POST /api/video/token
   * crea la sala al vuelo si no existe cuando entra el primer participante.
   */
  private async preCrearSala(roomName: string): Promise<void> {
    try {
      await twilioService.createRoom(roomName);
    } catch (error: any) {
      if (error?.code !== 53113) {
        // 53113 = la sala ya existe
        console.warn(
          `⚠️  [integration] No se pudo pre-crear la sala ${roomName} (se creará al conectarse): ${error?.message || error}`
        );
      }
    }
  }

  /** Misma plantilla y registro en chat que /api/video/whatsapp/send-suelta. */
  private async notificarWhatsApp(p: {
    celular: string;
    nombre: string;
    empresa: string;
    roomNameWithParams: string;
    patientUrl: string;
    tenantId: string;
  }): Promise<void> {
    try {
      const templateSid = process.env.TWILIO_TEMPLATE_VIDEOCONSULTA_SUELTA;
      if (!templateSid) {
        console.warn('⚠️  [integration] notificar=true pero TWILIO_TEMPLATE_VIDEOCONSULTA_SUELTA no está configurada');
        return;
      }
      // {{1}}=nombre, {{2}}=empresa, {{3}}=roomNameWithParams (botón → /patient/{{3}})
      const result = await whatsappService.sendContentTemplate(
        p.celular,
        templateSid,
        { '1': p.nombre, '2': p.empresa, '3': p.roomNameWithParams },
        p.tenantId
      );
      if (!result.success) {
        console.error(`⚠️  [integration] WhatsApp no enviado: ${result.error}`);
        return;
      }
      const messageBody = `Hola ${p.nombre}, vas a realizar la consulta médica de ${p.empresa}.\n\nPara conectarte haz clic en el botón.\n\n${p.patientUrl}`;
      await postgresService.registrarMensajeSaliente(`+${p.celular}`, messageBody, result.messageSid || '', p.nombre);
    } catch (error: any) {
      console.error('⚠️  [integration] Error enviando WhatsApp de la consulta:', error?.message || error);
    }
  }
}

export default new IntegrationConsultasService();

// ============================================================================
// Consulta de medicina general (órdenes con tipoExamen = 'Medicina general').
//
// Hoy son las teleconsultas de Grupo MOK / ORIONT que agenda BSL-PLATAFORMA2. La
// historia NO va en las columnas md* de "HistoriaClinica" (esas son de salud
// ocupacional) sino en `consultas_medicina_general` (migración 0018 de
// BSL-PLATAFORMA2). Reglas que no se pueden romper:
//
//   - Toda consulta a `consultas_medicina_general` filtra tenant_id.
//   - La descripción de cada diagnóstico se copia de `cie10`, nunca del cliente.
//   - Una consulta cerrada no se modifica: lo cuida un trigger de la base; acá
//     además se responde 409 antes de intentarlo.
//   - Al cerrar NO se disparan los ganchos de salud ocupacional (certificado,
//     avisos a la empresa / SST, webhook de Maluwa).
// ============================================================================

import type { PoolClient } from 'pg';
import postgresService from './postgres.service';
import {
  ConsultaValidada,
  Diagnostico,
  ErrorValidacion,
  esMedicinaGeneral,
  prepararBusquedaCie10,
  validarCierre,
  validarConsulta,
} from './medicina-general/validacion';

/** Error con código HTTP (400/404/409). El controlador lo traduce a la respuesta. */
export class ErrorHttp extends Error {
  constructor(public readonly status: 400 | 404 | 409 | 422 | 500, mensaje: string, public readonly campo?: string) {
    super(mensaje);
    this.name = 'ErrorHttp';
  }
}

export type ObtenerCliente = () => Promise<PoolClient | null>;

export interface OrdenMedicinaGeneral {
  _id: string;
  numeroId: string | null;
  tipoDocumento: string | null;
  primerNombre: string | null;
  segundoNombre: string | null;
  primerApellido: string | null;
  segundoApellido: string | null;
  fecha_nacimiento: string | null;
  genero_biologico: string | null;
  celular: string | null;
  email: string | null;
  codEmpresa: string | null;
  empresa: string | null;
  tipoExamen: string | null;
  medico: string | null;
  motivoConsulta: string | null;
  fechaAtencion: Date | null;
}

export interface MetaCierre {
  /** Para audit_log: la ruta que cerró la consulta. */
  endpoint?: string;
  metodo?: string;
  /** Para audit_log: desde dónde se cerró (estas rutas no tienen sesión). */
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Valores de "medico" que no son una persona que pueda firmar: la cita cancelada por el aliado
 * (BSL-PLATAFORMA2, teleconsulta-aliados) y las colas internas de la plataforma.
 */
const MEDICOS_QUE_NO_FIRMAN = new Set([
  'CANCELADA POR ALIADO', 'RESERVA', 'PENDIENTE DE PRUEBAS', 'PENDIENTE DE REAGENDAR', 'ADMINISTRADOR', 'PRESENCIAL',
]);

const COLUMNAS_ORDEN = `
  "_id", "numeroId", "tipoDocumento", "primerNombre", "segundoNombre", "primerApellido",
  "segundoApellido", to_char(fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
  genero_biologico, celular, email, "codEmpresa", empresa, "tipoExamen", medico,
  "motivoConsulta", "fechaAtencion"`;

// NUMERIC llega como texto desde pg: se castea para que el frontend reciba números.
const COLUMNAS_CONSULTA = `
  tenant_id, orden_id, medico, motivo_consulta, enfermedad_actual, antecedentes,
  revision_sistemas, ta_sistolica, ta_diastolica, frecuencia_cardiaca,
  frecuencia_respiratoria, temperatura::float8 AS temperatura, saturacion,
  peso_kg::float8 AS peso_kg, talla_cm::float8 AS talla_cm, examen_fisico, diagnosticos,
  analisis, plan_manejo, recomendaciones, formula, ordenes, incapacidad, cerrada_at,
  creado_at, actualizado_at`;

// Orden de los parámetros $3..$23 del upsert (después de tenant_id y orden_id).
const COLUMNAS_UPSERT = [
  'medico',
  'motivo_consulta',
  'enfermedad_actual',
  'antecedentes',
  'revision_sistemas',
  'ta_sistolica',
  'ta_diastolica',
  'frecuencia_cardiaca',
  'frecuencia_respiratoria',
  'temperatura',
  'saturacion',
  'peso_kg',
  'talla_cm',
  'examen_fisico',
  'diagnosticos',
  'analisis',
  'plan_manejo',
  'recomendaciones',
  'formula',
  'ordenes',
  'incapacidad',
] as const;
const COLUMNAS_JSON = new Set(['diagnosticos', 'formula', 'ordenes', 'incapacidad']);

/** El trigger de la migración lanza esto si la consulta ya estaba cerrada (carrera entre dos guardados). */
function esErrorConsultaCerrada(error: any): boolean {
  return error?.code === 'P0001' && /ya está cerrada|no se borra/.test(String(error?.message));
}

export class MedicinaGeneralService {
  constructor(private readonly obtenerCliente: ObtenerCliente) {}

  private async conCliente<T>(fn: (cliente: PoolClient) => Promise<T>): Promise<T> {
    const cliente = await this.obtenerCliente();
    if (!cliente) throw new ErrorHttp(500, 'No hay conexión con la base de datos');
    try {
      return await fn(cliente);
    } finally {
      cliente.release();
    }
  }

  private async enTransaccion<T>(fn: (cliente: PoolClient) => Promise<T>): Promise<T> {
    return this.conCliente(async (cliente) => {
      await cliente.query('BEGIN');
      try {
        const r = await fn(cliente);
        await cliente.query('COMMIT');
        return r;
      } catch (error) {
        await cliente.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    });
  }

  /** Typeahead CIE-10: prefijo de código o todas las palabras en la descripción, sin tildes. */
  async buscarCie10(q: unknown): Promise<Array<{ codigo: string; descripcion: string }>> {
    const busqueda = prepararBusquedaCie10(q);
    if (!busqueda) return [];
    // tenant-revisado: cie10 es el catálogo oficial del Ministerio, no es de ninguna IPS.
    return this.conCliente(async (cliente) => {
      const r = await cliente.query(
        `SELECT codigo, descripcion
           FROM cie10
          WHERE ($1::text IS NOT NULL AND codigo LIKE $1)
             OR (cardinality($2::text[]) > 0
                 AND translate(lower(descripcion), 'áéíóúüñ', 'aeiouun') LIKE ALL ($2::text[]))
          ORDER BY ($1::text IS NOT NULL AND codigo LIKE $1) DESC, codigo
          LIMIT 20`,
        [busqueda.prefijoCodigo, busqueda.palabras]
      );
      return r.rows;
    });
  }

  private async leerOrden(cliente: PoolClient, historiaId: string, tenantId: string): Promise<OrdenMedicinaGeneral | null> {
    const r = await cliente.query(
      `SELECT ${COLUMNAS_ORDEN}
         FROM "HistoriaClinica"
        WHERE "_id" = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [historiaId, tenantId]
    );
    return r.rows[0] ?? null;
  }

  private async leerConsulta(cliente: PoolClient, historiaId: string, tenantId: string, bloquear = false) {
    const r = await cliente.query(
      `SELECT ${COLUMNAS_CONSULTA}
         FROM consultas_medicina_general
        WHERE tenant_id = $1 AND orden_id = $2
        ${bloquear ? 'FOR UPDATE' : ''}`,
      [tenantId, historiaId]
    );
    return r.rows[0] ?? null;
  }

  /** GET /:historiaId → la orden y la consulta (o null si aún no se ha guardado nada). */
  async obtener(historiaId: string, tenantId: string) {
    return this.conCliente(async (cliente) => {
      const orden = await this.leerOrden(cliente, historiaId, tenantId);
      if (!orden) throw new ErrorHttp(404, 'No se encontró la orden');
      const consulta = await this.leerConsulta(cliente, historiaId, tenantId);
      return { orden, consulta };
    });
  }

  /** Copia la descripción oficial de cada diagnóstico desde cie10. 400 si un código no existe. */
  private async completarDiagnosticos(cliente: PoolClient, consulta: ConsultaValidada): Promise<Diagnostico[]> {
    if (consulta.diagnosticos.length === 0) return [];
    const codigos = consulta.diagnosticos.map((d) => d.codigo);
    // tenant-revisado: cie10 es el catálogo oficial, sin tenant.
    const r = await cliente.query('SELECT codigo, descripcion FROM cie10 WHERE codigo = ANY($1::text[])', [codigos]);
    const descripciones = new Map<string, string>(r.rows.map((f: any) => [f.codigo, f.descripcion]));
    return consulta.diagnosticos.map((d, i) => {
      const descripcion = descripciones.get(d.codigo);
      if (descripcion === undefined) {
        throw new ErrorHttp(400, `El código ${d.codigo} no existe en el catálogo CIE-10`, `diagnosticos[${i}].codigo`);
      }
      return { codigo: d.codigo, descripcion, tipo: d.tipo, clase: d.clase };
    });
  }

  /**
   * Pasos comunes de guardar y cerrar, dentro de una transacción ya abierta:
   * verifica la orden y que la consulta no esté cerrada, y hace el upsert.
   */
  private async guardarEnTransaccion(
    cliente: PoolClient,
    historiaId: string,
    tenantId: string,
    consulta: ConsultaValidada,
    cerrar: boolean
  ) {
    // FOR UPDATE: dos cierres simultáneos de la misma orden quedan en fila.
    const ordenR = await cliente.query(
      `SELECT "tipoExamen", medico FROM "HistoriaClinica"
        WHERE "_id" = $1 AND tenant_id = $2 AND deleted_at IS NULL
        FOR UPDATE`,
      [historiaId, tenantId]
    );
    const orden = ordenR.rows[0];
    if (!orden) throw new ErrorHttp(404, 'No se encontró la orden');
    if (!esMedicinaGeneral(orden.tipoExamen)) {
      throw new ErrorHttp(409, 'Esta orden no es de medicina general');
    }

    const existente = await this.leerConsulta(cliente, historiaId, tenantId, true);
    if (existente?.cerrada_at) throw new ErrorHttp(409, 'La consulta ya está cerrada y no se puede modificar');

    // El médico es SIEMPRE el asignado a la orden, leído aquí bajo el FOR UPDATE: nunca el que
    // manda el navegador (estas rutas no tienen sesión y la consulta cerrada no se corrige).
    const medico = orden.medico ? String(orden.medico).trim() : '';
    if (!medico || MEDICOS_QUE_NO_FIRMAN.has(medico.toUpperCase())) {
      // 422, no 409: el panel recarga ante un 409 ("ya está cerrada"), y aquí no hay nada que
      // recargar; lo escrito se queda en pantalla.
      throw new ErrorHttp(422, 'La orden no tiene un médico asignado que pueda firmar (o fue cancelada)');
    }

    const diagnosticos = await this.completarDiagnosticos(cliente, consulta);
    const valores: Record<string, unknown> = { ...consulta, medico, diagnosticos };
    const params = COLUMNAS_UPSERT.map((c) => {
      const v = valores[c] ?? null;
      return COLUMNAS_JSON.has(c) && v !== null ? JSON.stringify(v) : v;
    });

    const lista = COLUMNAS_UPSERT.join(', ');
    const marcadores = COLUMNAS_UPSERT.map((_, i) => `$${i + 3}`).join(', ');
    const actualizar = COLUMNAS_UPSERT.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
    const cerradaSql = cerrar ? 'NOW()' : 'NULL';

    try {
      const r = await cliente.query(
        `INSERT INTO consultas_medicina_general (tenant_id, orden_id, ${lista}, cerrada_at)
         VALUES ($1, $2, ${marcadores}, ${cerradaSql})
         ON CONFLICT (tenant_id, orden_id) DO UPDATE SET
           ${actualizar},
           cerrada_at = ${cerradaSql},
           actualizado_at = NOW()
         RETURNING orden_id`,
        [tenantId, historiaId, ...params]
      );
      if (r.rowCount !== 1) throw new ErrorHttp(500, 'No se pudo guardar la consulta');
    } catch (error) {
      if (esErrorConsultaCerrada(error)) {
        throw new ErrorHttp(409, 'La consulta ya está cerrada y no se puede modificar');
      }
      throw error;
    }
    return { diagnosticos, medico };
  }

  /** PUT /:historiaId → guarda el borrador (upsert). */
  async guardarBorrador(historiaId: string, tenantId: string, cuerpo: unknown) {
    const consulta = this.validar(cuerpo, false);
    return this.enTransaccion(async (cliente) => {
      await this.guardarEnTransaccion(cliente, historiaId, tenantId, consulta, false);
      return this.leerConsulta(cliente, historiaId, tenantId);
    });
  }

  /**
   * POST /:historiaId/cerrar → guarda, firma (cerrada_at) y marca la orden como ATENDIDO,
   * todo en una transacción junto con el registro en audit_log.
   *
   * Sin ganchos después del cierre, a propósito: los del cierre ocupacional (alerta OMEGA,
   * certificado) no aplican, y el encolado del RDA (rda-cola.service) todavía no está en la
   * rama de producción de esta app; cuando llegue, se llama aquí después del COMMIT, sin
   * hacer fallar la respuesta.
   */
  async cerrar(historiaId: string, tenantId: string, cuerpo: unknown, meta: MetaCierre = {}) {
    const consulta = this.validar(cuerpo, true);
    return this.enTransaccion(async (cliente) => {
      const { diagnosticos, medico } = await this.guardarEnTransaccion(cliente, historiaId, tenantId, consulta, true);

      const principal = diagnosticos.find((d) => d.tipo === 'principal');
      const relacionado = diagnosticos.find((d) => d.tipo === 'relacionado');
      const orden = await cliente.query(
        `UPDATE "HistoriaClinica"
            SET atendido = 'ATENDIDO',
                "fechaConsulta" = COALESCE("fechaConsulta", NOW()),
                "mdDx1" = $3,
                "mdDx2" = $4,
                "motivoConsulta" = COALESCE(NULLIF(TRIM("motivoConsulta"), ''), $5),
                "_updatedDate" = NOW()
          WHERE "_id" = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [historiaId, tenantId, principal?.descripcion ?? null, relacionado?.descripcion ?? null, consulta.motivo_consulta]
      );
      if (orden.rowCount !== 1) throw new ErrorHttp(404, 'No se encontró la orden');

      // Auditoría normativa: solo hechos, nada de texto clínico libre.
      await cliente.query(
        `INSERT INTO audit_log (tenant_id, usuario_email, accion, tabla, registro_id, datos_nuevos, endpoint, metodo, ip_address, user_agent)
         VALUES ($1, $2, 'UPDATE', 'consultas_medicina_general', $3, $4::jsonb, $5, $6, $7, $8)`,
        [
          tenantId,
          medico.slice(0, 200),
          historiaId,
          JSON.stringify({ cerrada: true, diagnosticos: diagnosticos.map((d) => d.codigo) }),
          meta.endpoint ? meta.endpoint.slice(0, 300) : null,
          meta.metodo ? meta.metodo.slice(0, 10) : null,
          meta.ip && /^[0-9a-fA-F.:]{3,45}$/.test(String(meta.ip)) ? String(meta.ip) : null,
          meta.userAgent ? String(meta.userAgent).slice(0, 500) : null,
        ]
      );

      return this.leerConsulta(cliente, historiaId, tenantId);
    });
  }

  private validar(cuerpo: unknown, cerrar: boolean): ConsultaValidada {
    try {
      const consulta = validarConsulta(cuerpo);
      if (cerrar) validarCierre(consulta);
      return consulta;
    } catch (error) {
      if (error instanceof ErrorValidacion) throw new ErrorHttp(400, error.message, error.campo);
      throw error;
    }
  }
}

export default new MedicinaGeneralService(() => postgresService.getClient());

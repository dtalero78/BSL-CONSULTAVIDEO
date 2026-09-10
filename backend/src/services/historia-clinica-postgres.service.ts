import { PoolClient } from 'pg';
import postgresService from './postgres.service';

/** Datos para crear una historia clínica PENDIENTE (orden agendada, aún sin atender). */
export interface HistoriaPendienteData {
  _id: string;
  numeroId: string;
  primerNombre: string;
  segundoNombre?: string | null;
  primerApellido: string;
  segundoApellido?: string | null;
  celular: string;
  fechaNacimiento: string; // AAAA-MM-DD → columna "fecha_nacimiento" (date)
  codEmpresa: string;
  empresa?: string | null;
  tipoExamen: string;
  medico: string;
  motivoConsulta?: string | null;
  tenantId: string;
}

interface HistoriaClinicaData {
  _id: string;
  numeroId: string;
  primerNombre: string;
  segundoNombre?: string;
  primerApellido: string;
  segundoApellido?: string;
  celular: string;
  email?: string;
  codEmpresa?: string;
  empresa?: string;
  cargo?: string;
  tipoExamen?: string;
  mdAntecedentes?: string;
  mdObsParaMiDocYa?: string;
  mdObservacionesCertificado?: string;
  mdRecomendacionesMedicasAdicionales?: string;
  mdConceptoFinal?: string;
  mdDx1?: string;
  mdDx2?: string;
  talla?: string;
  peso?: string;
  motivoConsulta?: string;
  diagnostico?: string;
  tratamiento?: string;
  fechaAtencion?: Date;
  fechaConsulta?: Date;
  atendido?: string;
  pvEstado?: string;
  medico?: string;
  ciudad?: string;
  examenes?: string;
  horaAtencion?: string;
}

/**
 * Servicio para manejar operaciones de HistoriaClinica en PostgreSQL
 */
class HistoriaClinicaPostgresService {
  /**
   * Inserta o actualiza (UPSERT) una historia clínica
   * Si el _id ya existe, actualiza; si no, inserta
   */
  async upsert(data: HistoriaClinicaData): Promise<boolean> {
    try {
      // Guard: no sobrescribir registros borrados (soft delete).
      // Si la orden fue eliminada y recreada con otro _id, el link viejo no debe
      // resucitar al registro borrado: el médico tiene que atender contra el _id vivo.
      const existing = await postgresService.query(
        'SELECT deleted_at FROM "HistoriaClinica" WHERE "_id" = $1',
        [data._id]
      );
      if (existing && existing.length > 0 && existing[0].deleted_at !== null) {
        console.warn(`⛔ [PostgreSQL] Bloqueado upsert sobre registro borrado: ${data._id} (deleted_at=${existing[0].deleted_at})`);
        return false;
      }

      const query = `
        INSERT INTO "HistoriaClinica" (
          "_id", "numeroId", "primerNombre", "segundoNombre", "primerApellido", "segundoApellido",
          "celular", "email", "codEmpresa", "empresa", "cargo", "tipoExamen",
          "mdAntecedentes", "mdObsParaMiDocYa", "mdObservacionesCertificado",
          "mdRecomendacionesMedicasAdicionales", "mdConceptoFinal", "mdDx1", "mdDx2",
          "talla", "peso", "motivoConsulta", "diagnostico", "tratamiento",
          "fechaAtencion", "fechaConsulta", "atendido", "pvEstado", "medico",
          "ciudad", "examenes", "horaAtencion"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24,
          $25, COALESCE($26::timestamptz, NOW()), $27, $28, $29,
          $30, $31, $32
        )
        ON CONFLICT ("_id") DO UPDATE SET
          "numeroId" = COALESCE(EXCLUDED."numeroId", "HistoriaClinica"."numeroId"),
          "primerNombre" = COALESCE(EXCLUDED."primerNombre", "HistoriaClinica"."primerNombre"),
          "segundoNombre" = COALESCE(EXCLUDED."segundoNombre", "HistoriaClinica"."segundoNombre"),
          "primerApellido" = COALESCE(EXCLUDED."primerApellido", "HistoriaClinica"."primerApellido"),
          "segundoApellido" = COALESCE(EXCLUDED."segundoApellido", "HistoriaClinica"."segundoApellido"),
          "celular" = COALESCE(EXCLUDED."celular", "HistoriaClinica"."celular"),
          "email" = COALESCE(EXCLUDED."email", "HistoriaClinica"."email"),
          "codEmpresa" = COALESCE(EXCLUDED."codEmpresa", "HistoriaClinica"."codEmpresa"),
          "empresa" = COALESCE(EXCLUDED."empresa", "HistoriaClinica"."empresa"),
          "cargo" = COALESCE(EXCLUDED."cargo", "HistoriaClinica"."cargo"),
          "tipoExamen" = COALESCE(EXCLUDED."tipoExamen", "HistoriaClinica"."tipoExamen"),
          "mdAntecedentes" = EXCLUDED."mdAntecedentes",
          "mdObsParaMiDocYa" = EXCLUDED."mdObsParaMiDocYa",
          "mdObservacionesCertificado" = EXCLUDED."mdObservacionesCertificado",
          "mdRecomendacionesMedicasAdicionales" = EXCLUDED."mdRecomendacionesMedicasAdicionales",
          "mdConceptoFinal" = EXCLUDED."mdConceptoFinal",
          "mdDx1" = EXCLUDED."mdDx1",
          "mdDx2" = EXCLUDED."mdDx2",
          "talla" = EXCLUDED."talla",
          "peso" = EXCLUDED."peso",
          "motivoConsulta" = COALESCE(EXCLUDED."motivoConsulta", "HistoriaClinica"."motivoConsulta"),
          "diagnostico" = COALESCE(EXCLUDED."diagnostico", "HistoriaClinica"."diagnostico"),
          "tratamiento" = COALESCE(EXCLUDED."tratamiento", "HistoriaClinica"."tratamiento"),
          "fechaAtencion" = COALESCE(EXCLUDED."fechaAtencion", "HistoriaClinica"."fechaAtencion"),
          "fechaConsulta" = COALESCE(EXCLUDED."fechaConsulta", "HistoriaClinica"."fechaConsulta", NOW()),
          "atendido" = EXCLUDED."atendido",
          "pvEstado" = COALESCE(EXCLUDED."pvEstado", "HistoriaClinica"."pvEstado"),
          "medico" = COALESCE(EXCLUDED."medico", "HistoriaClinica"."medico"),
          "ciudad" = COALESCE(EXCLUDED."ciudad", "HistoriaClinica"."ciudad"),
          "examenes" = COALESCE(EXCLUDED."examenes", "HistoriaClinica"."examenes"),
          "horaAtencion" = COALESCE(EXCLUDED."horaAtencion", "HistoriaClinica"."horaAtencion"),
          "_updatedDate" = NOW()
        RETURNING "_id";
      `;

      const params = [
        data._id,
        data.numeroId,
        data.primerNombre,
        data.segundoNombre || null,
        data.primerApellido,
        data.segundoApellido || null,
        data.celular,
        data.email || null,
        data.codEmpresa || null,
        data.empresa || null,
        data.cargo || null,
        data.tipoExamen || null,
        data.mdAntecedentes || null,
        data.mdObsParaMiDocYa || null,
        data.mdObservacionesCertificado || null,
        data.mdRecomendacionesMedicasAdicionales || null,
        data.mdConceptoFinal || null,
        data.mdDx1 || null,
        data.mdDx2 || null,
        data.talla || null,
        data.peso || null,
        data.motivoConsulta || null,
        data.diagnostico || null,
        data.tratamiento || null,
        data.fechaAtencion || null,
        data.fechaConsulta || null,
        data.atendido || null,
        data.pvEstado || null,
        data.medico || null,
        data.ciudad || null,
        data.examenes || null,
        data.horaAtencion || null,
      ];

      const result = await postgresService.query(query, params);

      if (result && result.length > 0) {
        console.log(`✅ [PostgreSQL] Historia clínica guardada: ${data._id}`);
        return true;
      }

      console.warn(`⚠️  [PostgreSQL] No se pudo guardar historia clínica: ${data._id}`);
      return false;
    } catch (error) {
      console.error(`❌ [PostgreSQL] Error guardando historia clínica ${data._id}:`, error);
      return false;
    }
  }

  /**
   * Crea una historia clínica PENDIENTE para que aparezca en el panel del médico
   * asignado (getPendingPatients: medico + fechaAtencion de hoy + fechaConsulta NULL + tenant_id).
   *
   * Diferencias con upsert() (que es el guardado de la consulta atendida):
   *   - fechaConsulta queda NULL: upsert() la fuerza a NOW() al insertar, lo que la
   *     contaría como atendida y la ocultaría de la lista de pendientes.
   *   - Escribe tenant_id y fecha_nacimiento (upsert() no los escribe).
   *   - Nunca sobrescribe (ON CONFLICT DO NOTHING).
   *   - Acepta un PoolClient para correr dentro de una transacción; en ese caso los
   *     errores se propagan (el caller hace ROLLBACK).
   *
   * Columnas validadas contra el esquema REAL de producción (lo define BSL-PLATAFORMA2;
   * migrations/001 está desactualizada): la fecha de nacimiento es `fecha_nacimiento`
   * (date) y no existe "fechaNacimiento" ni "edad". Test: historia-clinica-postgres.schema.test.ts
   *
   * Devuelve true si insertó la fila. Lanza si falta un campo NOT NULL.
   */
  async crearPendiente(data: HistoriaPendienteData, client?: PoolClient): Promise<boolean> {
    // NOT NULL sin default en producción: fallar antes de ir a la BD con un mensaje claro.
    const obligatorios: Record<string, string | undefined> = {
      _id: data._id,
      numeroId: data.numeroId,
      primerNombre: data.primerNombre,
      primerApellido: data.primerApellido,
      celular: data.celular,
    };
    const faltantes = Object.entries(obligatorios)
      .filter(([, v]) => !v || !String(v).trim())
      .map(([k]) => k);
    if (faltantes.length > 0) {
      throw new Error(`crearPendiente: faltan columnas NOT NULL de HistoriaClinica: ${faltantes.join(', ')}`);
    }

    const query = `
      INSERT INTO "HistoriaClinica" (
        "_id", "numeroId", "primerNombre", "segundoNombre", "primerApellido", "segundoApellido",
        "celular", "fecha_nacimiento", "codEmpresa", "empresa", "tipoExamen", "medico",
        "motivoConsulta", "atendido", "fechaAtencion", "fechaConsulta", "tenant_id"
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, 'PENDIENTE', NOW(), NULL, $14
      )
      ON CONFLICT ("_id") DO NOTHING
      RETURNING "_id";
    `;
    const params = [
      data._id,
      data.numeroId,
      data.primerNombre,
      data.segundoNombre || null,
      data.primerApellido,
      data.segundoApellido || null,
      data.celular,
      data.fechaNacimiento,
      data.codEmpresa,
      data.empresa || null,
      data.tipoExamen,
      data.medico,
      data.motivoConsulta || null,
      data.tenantId,
    ];

    if (client) {
      const result = await client.query(query, params);
      return result.rows.length > 0;
    }

    const rows = await postgresService.query(query, params);
    return !!rows && rows.length > 0;
  }

  /**
   * Obtiene una historia clínica por _id
   */
  async getById(id: string): Promise<HistoriaClinicaData | null> {
    try {
      const query = 'SELECT * FROM "HistoriaClinica" WHERE "_id" = $1 AND deleted_at IS NULL';
      const result = await postgresService.query(query, [id]);

      if (result && result.length > 0) {
        return result[0] as HistoriaClinicaData;
      }

      return null;
    } catch (error) {
      console.error(`❌ [PostgreSQL] Error obteniendo historia clínica ${id}:`, error);
      return null;
    }
  }

  /**
   * Busca historias clínicas por documento
   */
  async getByNumeroId(numeroId: string): Promise<HistoriaClinicaData[]> {
    try {
      const query = 'SELECT * FROM "HistoriaClinica" WHERE "numeroId" = $1 AND deleted_at IS NULL ORDER BY "_createdDate" DESC';
      const result = await postgresService.query(query, [numeroId]);

      return (result || []) as HistoriaClinicaData[];
    } catch (error) {
      console.error(`❌ [PostgreSQL] Error buscando por numeroId ${numeroId}:`, error);
      return [];
    }
  }

  /**
   * Actualiza el campo aprobacion de una historia clínica
   */
  async updateAprobacion(historiaId: string, aprobacion: string): Promise<boolean> {
    try {
      const query = `
        UPDATE "HistoriaClinica"
        SET "aprobacion" = $2
        WHERE "_id" = $1
        RETURNING "_id"
      `;
      const result = await postgresService.query(query, [historiaId, aprobacion]);

      if (result && result.length > 0) {
        console.log(`✅ [PostgreSQL] Aprobación actualizada para ${historiaId}: ${aprobacion}`);
        return true;
      }

      console.warn(`⚠️  [PostgreSQL] No se encontró historia clínica ${historiaId} para actualizar aprobación`);
      return false;
    } catch (error) {
      console.error(`❌ [PostgreSQL] Error actualizando aprobación ${historiaId}:`, error);
      return false;
    }
  }
}

export default new HistoriaClinicaPostgresService();

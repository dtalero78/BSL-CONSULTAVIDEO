import postgresService from './postgres.service';

/**
 * Resumen de la historia post-incapacidad que el paciente subió desde el link de WhatsApp
 * (Daniel, 27-nov-2026). Lo arma y lo guarda BSL-PLATAFORMA2 al terminar el Análisis
 * Postincapacidad (columna analisis_postincapacidad.resumen_medico, migración 0023 de ese repo).
 * Aquí solo se lee: la misma información que ve el médico presencial en Órdenes.
 */
export interface ResumenPostincapacidadRespuesta {
  disponible: boolean;          // false si la base todavía no tiene la columna (o falló la consulta)
  resumen: any | null;          // forma en BSL-PLATAFORMA2 src/helpers/postincapacidad-resumen.js
  origen: string | null;
  completadoAt: string | null;
  enCurso: boolean;
  hayDocumentos: boolean;
}

class PostincapacidadResumenService {
  async getResumen(historiaId: string, tenantId: string): Promise<ResumenPostincapacidadRespuesta> {
    const rows = await postgresService.query(
      `SELECT a.id, a.estado, a.origen, a.completado_at, a.resumen_medico,
              (SELECT COUNT(*) FROM analisis_postincapacidad_documentos d
               WHERE d.analisis_id = a.id AND d.duplicado_de IS NULL)::int AS documentos
       FROM analisis_postincapacidad a
       WHERE a.tenant_id = $1 AND a.orden_id = $2
       ORDER BY a.id DESC LIMIT 5`,
      [tenantId, historiaId]
    );
    if (rows === null) {
      return { disponible: false, resumen: null, origen: null, completadoAt: null, enCurso: false, hayDocumentos: false };
    }
    // El más reciente que terminó con resumen; si hay uno más nuevo corriendo, se avisa.
    const listo = rows.find((r: any) => r.estado === 'completado' && r.resumen_medico);
    const enCurso = rows.some((r: any) => r.estado === 'procesando' && (!listo || r.id > listo.id));
    return {
      disponible: true,
      resumen: listo ? listo.resumen_medico : null,
      origen: listo ? listo.origen : null,
      completadoAt: listo ? listo.completado_at : null,
      enCurso,
      hayDocumentos: rows.some((r: any) => r.documentos > 0),
    };
  }
}

export default new PostincapacidadResumenService();

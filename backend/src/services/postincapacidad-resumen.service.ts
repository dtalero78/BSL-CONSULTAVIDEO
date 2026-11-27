import postgresService from './postgres.service';

/**
 * Resumen de la historia post-incapacidad que el paciente subió desde el link de WhatsApp
 * (Daniel, 27-nov-2026). Lo arma y lo guarda BSL-PLATAFORMA2 al terminar el Análisis
 * Postincapacidad (columna analisis_postincapacidad.resumen_medico, migración 0023 de ese repo).
 * Aquí solo se lee: la misma información que ve el médico presencial en Órdenes.
 *
 * Las reglas de estado son copia de BSL-PLATAFORMA2 src/helpers/postincapacidad-estado.js
 * (estadoParaMedico): si cambian allá, cambian aquí.
 */
export interface ResumenPostincapacidadRespuesta {
  disponible: boolean;          // false si la base todavía no tiene la columna (o falló la consulta)
  resumen: any | null;          // forma en BSL-PLATAFORMA2 src/helpers/postincapacidad-resumen.js
  origen: string | null;
  completadoAt: string | null;
  enCurso: boolean;             // analizando o en cola (no huérfano)
  fallo: boolean;               // el último análisis falló o se cortó
  documentosSinEnviar: number;  // subió documentos que no se han analizado
  hayDocumentos: boolean;
  // Hay un análisis terminado de antes de que existiera el resumen: abrirlo una vez en
  // Órdenes de PLATAFORMA2 lo arma y lo guarda.
  analisisSinResumen: boolean;
}

const MINUTOS_PROCESANDO = 8;
const MINUTOS_EN_COLA = 60;

const corriendo = (r: any): boolean => {
  if (!r) return false;
  const min = Number(r.minutos);
  if (r.estado === 'procesando') return min < MINUTOS_PROCESANDO;
  if (r.estado === 'en_cola') return min < MINUTOS_EN_COLA;
  return false;
};

const VACIO: ResumenPostincapacidadRespuesta = {
  disponible: false, resumen: null, origen: null, completadoAt: null, enCurso: false,
  fallo: false, documentosSinEnviar: 0, hayDocumentos: false, analisisSinResumen: false,
};

class PostincapacidadResumenService {
  async getResumen(historiaId: string, tenantId: string): Promise<ResumenPostincapacidadRespuesta> {
    const rows = await postgresService.query(
      `SELECT a.id, a.estado, a.origen, a.completado_at, a.resumen_medico,
              EXTRACT(EPOCH FROM (NOW() - a.updated_at)) / 60 AS minutos,
              (SELECT COUNT(*) FROM analisis_postincapacidad_documentos d
               WHERE d.analisis_id = a.id AND d.duplicado_de IS NULL)::int AS documentos,
              (SELECT COUNT(*) FROM analisis_postincapacidad_documentos d
               WHERE d.analisis_id = a.id AND d.duplicado_de IS NULL AND d.extraccion IS NULL
                 AND d.estado <> 'error')::int AS sin_leer
       FROM analisis_postincapacidad a
       WHERE a.tenant_id = $1 AND a.orden_id = $2
       ORDER BY a.id DESC LIMIT 5`,
      [tenantId, historiaId]
    );
    if (rows === null) return VACIO;

    const listo = rows.find((r: any) => r.estado === 'completado' || r.resumen_medico) || null;
    const ultimo = rows[0] || null;
    const enCurso = rows.some(corriendo);
    const fallo = !!ultimo && !enCurso && !corriendo(ultimo)
      && ['error', 'interrumpido', 'procesando', 'en_cola'].includes(ultimo.estado);
    return {
      disponible: true,
      resumen: listo ? listo.resumen_medico || null : null,
      origen: listo ? listo.origen : null,
      completadoAt: listo ? listo.completado_at : null,
      enCurso,
      fallo,
      documentosSinEnviar: ultimo && !corriendo(ultimo) ? Number(ultimo.sin_leer) || 0 : 0,
      hayDocumentos: rows.some((r: any) => Number(r.documentos) > 0),
      analisisSinResumen: !!listo && !listo.resumen_medico,
    };
  }
}

export default new PostincapacidadResumenService();

import postgresService from './postgres.service';

/**
 * Cola de envío de RDA al Ministerio (Res. 1888/2025).
 *
 * **Esta app solo ENCOLA; el que envía es PLATAFORMA2.** Las dos comparten la base, así que
 * acá basta con insertar en `rda_envios` y el cron de PLATAFORMA2 (cada 5 min) arma el
 * documento FHIR y lo manda. Todo lo pesado —builder, credenciales del Ministerio, proxy
 * colombiano, reintentos— vive allá y no hay que duplicarlo.
 *
 * Existe porque el médico cierra la historia clínica **acá**, en la videoconsulta, no en el
 * panel de PLATAFORMA2: el enganche que esa app tiene en `PUT /api/historia-clinica/:id`
 * nunca se dispara para una consulta atendida por video.
 *
 * Dos documentos por consulta: el RDA de consulta externa y el RDA de Paciente. El
 * Ministerio exige los dos.
 *
 * ⚠️ **Solo se encola si el tenant tiene `config.rda_activo = true`.** Sin ese candado, cada
 * consulta de BSL dejaría dos filas que nunca se van a poder enviar (BSL no está integrada
 * con el Ministerio), y la cola se llenaría de basura. Hoy el único con la bandera es
 * Medstar.
 */

const TIPOS = ['consulta', 'paciente'];

/**
 * Encola los dos RDA de una historia. Idempotente por el UNIQUE de la tabla: volver a
 * guardar la misma consulta no agrega filas ni reenvía nada.
 *
 * No lanza nunca: cerrar la historia clínica no se puede caer por esto.
 */
export async function encolarRda(historiaId: string, tenantId: string): Promise<void> {
  try {
    // `postgresService.query` devuelve las filas directamente (o null si falla), no un
    // Result de pg: un `.rows` acá sería undefined.
    const activo = await postgresService.query(
      `SELECT 1 FROM tenants
        WHERE id = $1 AND activo = TRUE
          AND COALESCE((config->>'rda_activo')::boolean, FALSE) = TRUE`,
      [tenantId]
    );
    if (!activo || !activo.length) return;

    await postgresService.query(
      `INSERT INTO rda_envios (tenant_id, historia_id, tipo)
       SELECT $1, $2, t FROM unnest($3::text[]) AS t
       ON CONFLICT ON CONSTRAINT rda_envios_historia_tipo_tenant_key DO NOTHING`,
      [tenantId, historiaId, TIPOS]
    );
    console.log(`📤 [RDA] Encolado ${tenantId}/${historiaId} (consulta + paciente)`);
  } catch (error: any) {
    console.error('⚠️  [RDA] No se pudo encolar:', error?.message || error);
  }
}

export default { encolarRda };

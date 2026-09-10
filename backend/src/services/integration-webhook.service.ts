// ============================================================================
// integration-webhook.service — Webhook de resultado BSL → Maluwa360.
//
// Outbox embebido en `integration_consultas` (columnas webhook_*), mismo patrón
// que trepsi-webhook.service de BODYTECH-CONSULTA.
//
// Dos caminos para encolar, porque la historia la puede guardar CUALQUIER
// backend que comparta la BD (hoy el médico entra por aws.medico-bsl.com, que
// corre otra rama; este backend de DigitalOcean no ve ese guardado):
//   a) Hook: medical-history.service.updateMedicalHistory() de ESTE backend
//      llama enqueueResultado(historiaId) tras guardar (fire-and-forget).
//   b) Detector: el worker (cada 30s) busca consultas recientes (ventana de
//      VENTANA_DETECCION_DIAS) cuya HistoriaClinica cambió de estado relevante
//      (atendido='ATENDIDO' + mdConceptoFinal) respecto de la última huella
//      encolada, y las encola.
// Ambos calculan la huella con la MISMA expresión SQL (HUELLA_SQL) y encolan
// con un UPDATE condicional (webhook_huella IS DISTINCT FROM ...): el mismo
// estado nunca se encola dos veces, aunque compitan el hook, el detector o
// varias instancias.
//
// Envío: dispatchPending() hace el claim con lease (FOR UPDATE SKIP LOCKED),
// POST firmado y marca sent / pending con backoff / dead tras MAX_INTENTOS.
// webhook_seq evita que un envío viejo en vuelo pise un pending más nuevo.
//
// Firma: X-Signature = hex(HMAC-SHA256(MALUWA360_WEBHOOK_SECRET, rawBody)).
// Env: MALUWA360_WEBHOOK_URL, MALUWA360_WEBHOOK_SECRET. Sin ambas el worker no
// arranca y lo encolado queda 'pending' hasta que se configuren.
// ============================================================================

import { createHmac } from 'crypto';
import postgresService from './postgres.service';
import { mapearConceptoMaluwa } from '../helpers/integracion-maluwa.helper';
import { buildCertificadoUrl } from '../helpers/certificado.helper';

const TIMEOUT_MS = 10_000;
const LEASE_SECONDS = 120;
const BATCH_SIZE = 25;
const DETECCION_LIMITE = 100;
export const WORKER_INTERVAL_MS = 30_000;
/** El detector solo revisa consultas creadas en esta ventana (índice por created_at). */
export const VENTANA_DETECCION_DIAS = 30;
/** Espera tras el intento N fallido (1-indexado): 1m, 5m, 15m, 1h, 3h, 6h, 12h. */
export const BACKOFF_SECONDS = [60, 5 * 60, 15 * 60, 60 * 60, 3 * 60 * 60, 6 * 60 * 60, 12 * 60 * 60];
/** Tras este intento fallido la fila pasa a 'dead' (~22h de reintentos en total). */
export const MAX_INTENTOS = BACKOFF_SECONDS.length + 1;

export const SIGNATURE_HEADER = 'X-Signature';

/**
 * Huella del estado relevante de la historia (columnas reales de producción:
 * "atendido" varchar, "mdConceptoFinal" text). Misma expresión en hook y detector.
 */
export const HUELLA_SQL = `md5(COALESCE(h.atendido, '') || '|' || COALESCE(h."mdConceptoFinal", ''))`;

/** Consultas de integración cuya historia está atendida y viva, con su huella actual. */
const SELECT_CANDIDATAS = `
  SELECT ic.id, ic.external_id, ic.historia_id, ic.webhook_huella,
         h."mdConceptoFinal" AS concepto_final,
         ${HUELLA_SQL} AS huella
    FROM integration_consultas ic
    JOIN "HistoriaClinica" h ON h."_id" = ic.historia_id
   WHERE h.atendido = 'ATENDIDO'
     AND h.deleted_at IS NULL`;

export interface ResultadoWebhookPayload {
  externalId: string;
  historiaId: string;
  estado: 'ATENDIDO' | 'NO_ASISTIO';
  concepto: string | null;
  certificadoUrl: string | null;
}

export type ResultadoEncolado = { enqueued: boolean; reason?: 'NO_HISTORIA_ID' | 'DB_ERROR' | 'NO_APLICA' | 'SIN_CAMBIOS' };

/** hex(HMAC-SHA256(secret, body)) — lo que Maluwa360 debe recalcular sobre el body crudo. */
export function firmarBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

function getConfig(): { url: string; secret: string } | null {
  const url = (process.env.MALUWA360_WEBHOOK_URL || '').trim();
  const secret = (process.env.MALUWA360_WEBHOOK_SECRET || '').trim();
  if (!url || !secret) return null;
  return { url, secret };
}

interface SendResult {
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
}

async function sendWebhook(url: string, secret: string, body: string): Promise<SendResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [SIGNATURE_HEADER]: firmarBody(body, secret),
        'User-Agent': 'BSL-ConsultaVideo-Webhook/1.0',
      },
      body,
      signal: controller.signal,
    });
    const text = await res.text().catch(() => '');
    if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status, body: text };
    return { ok: false, status: res.status, body: text, error: `HTTP ${res.status}` };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

class IntegrationWebhookService {
  private running = false;
  private detectando = false;
  private timer: NodeJS.Timeout | null = null;

  /**
   * Hook del guardado en este backend. Lee el estado GUARDADO de la BD (no el del
   * request) y encola solo si su huella difiere de la última encolada.
   */
  async enqueueResultado(historiaId: string): Promise<ResultadoEncolado> {
    if (!historiaId) return { enqueued: false, reason: 'NO_HISTORIA_ID' };

    const rows = await postgresService.query(`${SELECT_CANDIDATAS} AND ic.historia_id = $1 LIMIT 1`, [historiaId]);
    if (rows === null) return { enqueued: false, reason: 'DB_ERROR' };
    // No es de una integración, no está atendida o está borrada.
    if (rows.length === 0) return { enqueued: false, reason: 'NO_APLICA' };

    const r = await this.encolarSiCambio(rows[0]);
    if (r.enqueued) {
      // Envío inmediato en background (el worker reintenta si falla).
      this.dispatchPending().catch((e) => {
        console.error('[maluwa360-webhook] dispatchPending falló (no bloqueante):', e);
      });
    }
    return r;
  }

  /**
   * Detector (worker): encola las consultas recientes cuya historia cambió de
   * estado relevante desde el último encolado, sin importar qué backend la guardó.
   */
  async detectarCambios(): Promise<{ detectadas: number; encoladas: number }> {
    if (this.detectando) return { detectadas: 0, encoladas: 0 };
    this.detectando = true;
    try {
      const rows = await postgresService.query(
        `${SELECT_CANDIDATAS}
           AND ic.created_at >= NOW() - ($1 || ' days')::interval
           AND ic.webhook_huella IS DISTINCT FROM ${HUELLA_SQL}
         ORDER BY ic.created_at
         LIMIT ${DETECCION_LIMITE}`,
        [String(VENTANA_DETECCION_DIAS)]
      );
      if (!rows || rows.length === 0) return { detectadas: 0, encoladas: 0 };

      let encoladas = 0;
      for (const row of rows) {
        const r = await this.encolarSiCambio(row);
        if (r.enqueued) encoladas++;
      }
      if (encoladas > 0) {
        console.log(`[maluwa360-webhook] Detector: ${encoladas} resultado(s) encolado(s) por cambio de estado`);
      }
      return { detectadas: rows.length, encoladas };
    } finally {
      this.detectando = false;
    }
  }

  /**
   * Encola el payload del estado actual si su huella no es la última encolada.
   * El UPDATE condicional es la deduplicación atómica entre hook, detector e instancias.
   */
  private async encolarSiCambio(row: any): Promise<ResultadoEncolado> {
    const huella = String(row.huella);
    if (row.webhook_huella === huella) return { enqueued: false, reason: 'SIN_CAMBIOS' };

    const historiaId = String(row.historia_id);
    const payload: ResultadoWebhookPayload = {
      externalId: String(row.external_id),
      historiaId,
      estado: 'ATENDIDO',
      concepto: mapearConceptoMaluwa(row.concepto_final),
      certificadoUrl: buildCertificadoUrl(historiaId),
    };

    const updated = await postgresService.query(
      `UPDATE integration_consultas
          SET webhook_payload = $1::jsonb,
              webhook_huella = $2,
              webhook_status = 'pending',
              webhook_seq = webhook_seq + 1,
              attempts = 0,
              next_attempt_at = NOW(),
              last_error = NULL,
              last_status_code = NULL,
              updated_at = NOW()
        WHERE id = $3
          AND webhook_huella IS DISTINCT FROM $2
        RETURNING id`,
      [JSON.stringify(payload), huella, row.id]
    );
    if (updated === null) return { enqueued: false, reason: 'DB_ERROR' };
    if (updated.length === 0) return { enqueued: false, reason: 'SIN_CAMBIOS' }; // otro lo encoló primero
    return { enqueued: true };
  }

  /**
   * Envía las filas pending cuyo next_attempt_at ya pasó. Se llama tras encolar
   * desde el hook y en cada tick del worker.
   */
  async dispatchPending(): Promise<{ procesados: number; ok: number; fail: number }> {
    const vacio = { procesados: 0, ok: 0, fail: 0 };
    const config = getConfig();
    if (!config) return vacio;
    if (this.running) return vacio; // evita solapar corridas en esta instancia
    this.running = true;

    try {
      // Claim con lease: la fila queda "reservada" LEASE_SECONDS para esta instancia.
      const rows = await postgresService.query(
        `UPDATE integration_consultas
            SET next_attempt_at = NOW() + ($1 || ' seconds')::interval,
                updated_at = NOW()
          WHERE id IN (
                SELECT id FROM integration_consultas
                 WHERE webhook_status = 'pending' AND next_attempt_at <= NOW()
                 ORDER BY next_attempt_at
                 LIMIT ${BATCH_SIZE}
                 FOR UPDATE SKIP LOCKED)
          RETURNING id, external_id, webhook_payload, webhook_seq, attempts`,
        [String(LEASE_SECONDS)]
      );
      if (!rows || rows.length === 0) return vacio;

      let okCount = 0;
      let failCount = 0;
      for (const row of rows) {
        const id = Number(row.id);
        const seq = Number(row.webhook_seq);
        const intento = Number(row.attempts) + 1;
        const payload = typeof row.webhook_payload === 'string' ? JSON.parse(row.webhook_payload) : row.webhook_payload;
        const body = JSON.stringify(payload);

        const result = await sendWebhook(config.url, config.secret, body);

        if (result.ok) {
          await postgresService.query(
            `UPDATE integration_consultas
                SET webhook_status = 'sent',
                    attempts = $1,
                    last_status_code = $2,
                    last_error = NULL,
                    webhook_sent_at = NOW(),
                    updated_at = NOW()
              WHERE id = $3 AND webhook_seq = $4`,
            [intento, result.status ?? null, id, seq]
          );
          console.log(`[maluwa360-webhook] ✅ externalId ${row.external_id} enviado (status=${result.status}, intento=${intento})`);
          okCount++;
        } else {
          const dead = intento >= MAX_INTENTOS;
          const espera = BACKOFF_SECONDS[Math.min(intento - 1, BACKOFF_SECONDS.length - 1)];
          await postgresService.query(
            `UPDATE integration_consultas
                SET webhook_status = $1,
                    attempts = $2,
                    last_status_code = $3,
                    last_error = $4,
                    next_attempt_at = NOW() + ($5 || ' seconds')::interval,
                    updated_at = NOW()
              WHERE id = $6 AND webhook_seq = $7`,
            [
              dead ? 'dead' : 'pending',
              intento,
              result.status ?? null,
              (result.error || '').slice(0, 500),
              String(espera),
              id,
              seq,
            ]
          );
          console.warn(
            `[maluwa360-webhook] ⚠️ externalId ${row.external_id} intento ${intento} falló ` +
              `(status=${result.status}, err=${result.error}).` +
              (dead ? ' [DEAD]' : ` Próximo intento en ${espera}s.`)
          );
          failCount++;
        }
      }
      return { procesados: rows.length, ok: okCount, fail: failCount };
    } finally {
      this.running = false;
    }
  }

  /** Un ciclo del worker: detectar cambios y luego enviar lo pendiente. Nunca lanza. */
  async tick(): Promise<void> {
    try {
      await this.detectarCambios();
    } catch (e) {
      console.error('[maluwa360-webhook] Error en detector:', e);
    }
    try {
      await this.dispatchPending();
    } catch (e) {
      console.error('[maluwa360-webhook] Error en dispatch:', e);
    }
  }

  /** Arranca el worker (detector + reintentos). No-op si el webhook no está configurado. */
  startWorker(intervalMs: number = WORKER_INTERVAL_MS): void {
    if (this.timer) return;
    if (!getConfig()) {
      console.log('ℹ️  [maluwa360-webhook] MALUWA360_WEBHOOK_URL/SECRET no configuradas: worker inactivo');
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.timer.unref?.();
    console.log(`✅ [maluwa360-webhook] Worker activo (detector + reintentos cada ${intervalMs / 1000}s)`);
  }

  stopWorker(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export default new IntegrationWebhookService();

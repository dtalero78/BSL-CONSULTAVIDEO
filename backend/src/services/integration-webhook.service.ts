// ============================================================================
// integration-webhook.service — Webhook de resultado BSL → Maluwa360.
//
// Outbox embebido en `integration_consultas` (columnas webhook_*), mismo patrón
// que trepsi-webhook.service de BODYTECH-CONSULTA:
//   1) medical-history.service.updateMedicalHistory() llama enqueueResultado()
//      (fire-and-forget) tras guardar una historia con codEmpresa MALUWA360.
//   2) enqueueResultado() guarda el payload con webhook_status='pending' y
//      next_attempt_at=NOW(), incrementa webhook_seq, y dispara dispatchPending().
//   3) El worker (setInterval 30s, arrancado en index.ts) reintenta los pending
//      con backoff; tras MAX_INTENTOS pasa a 'dead'.
//
// Seguridad:
//   - Firma: X-Signature = hex(HMAC-SHA256(MALUWA360_WEBHOOK_SECRET, rawBody)).
//     Se firma exactamente el string que se envía.
//   - Claim con lease (FOR UPDATE SKIP LOCKED): varias instancias no envían la
//     misma fila a la vez.
//   - webhook_seq: si el médico vuelve a guardar mientras un envío está en
//     vuelo, el resultado de ese envío viejo no pisa el nuevo pending.
//
// Env: MALUWA360_WEBHOOK_URL, MALUWA360_WEBHOOK_SECRET. Sin ambas, el envío
// queda en pausa (las filas siguen 'pending' y salen cuando se configuren).
// ============================================================================

import { createHmac } from 'crypto';
import postgresService from './postgres.service';
import { mapearConceptoMaluwa } from '../helpers/integracion-maluwa.helper';
import { buildCertificadoUrl } from '../helpers/certificado.helper';

const TIMEOUT_MS = 10_000;
const LEASE_SECONDS = 120;
const BATCH_SIZE = 25;
export const WORKER_INTERVAL_MS = 30_000;
/** Espera tras el intento N fallido (1-indexado): 1m, 5m, 15m, 1h, 3h, 6h, 12h. */
export const BACKOFF_SECONDS = [60, 5 * 60, 15 * 60, 60 * 60, 3 * 60 * 60, 6 * 60 * 60, 12 * 60 * 60];
/** Tras este intento fallido la fila pasa a 'dead' (~22h de reintentos en total). */
export const MAX_INTENTOS = BACKOFF_SECONDS.length + 1;

export const SIGNATURE_HEADER = 'X-Signature';

export interface ResultadoWebhookPayload {
  externalId: string;
  historiaId: string;
  estado: 'ATENDIDO' | 'NO_ASISTIO';
  concepto: string | null;
  certificadoUrl: string | null;
}

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
  private timer: NodeJS.Timeout | null = null;

  /**
   * Encola el resultado de la consulta si la historia pertenece a una integración.
   * Si ya había un envío (pending/sent/dead), lo reemplaza por la versión más
   * reciente: Maluwa360 debe hacer upsert por externalId.
   */
  async enqueueResultado(
    historiaId: string,
    mdConceptoFinal?: string | null
  ): Promise<{ enqueued: boolean; reason?: string }> {
    if (!historiaId) return { enqueued: false, reason: 'NO_HISTORIA_ID' };

    const rows = await postgresService.query(
      'SELECT id, external_id FROM integration_consultas WHERE historia_id = $1 LIMIT 1',
      [historiaId]
    );
    if (rows === null) return { enqueued: false, reason: 'DB_ERROR' };
    if (rows.length === 0) return { enqueued: false, reason: 'NOT_INTEGRATION' };

    const row = rows[0];
    const payload: ResultadoWebhookPayload = {
      externalId: String(row.external_id),
      historiaId,
      estado: 'ATENDIDO',
      concepto: mapearConceptoMaluwa(mdConceptoFinal),
      certificadoUrl: buildCertificadoUrl(historiaId),
    };

    const updated = await postgresService.query(
      `UPDATE integration_consultas
          SET webhook_payload = $1::jsonb,
              webhook_status = 'pending',
              webhook_seq = webhook_seq + 1,
              attempts = 0,
              next_attempt_at = NOW(),
              last_error = NULL,
              last_status_code = NULL,
              updated_at = NOW()
        WHERE id = $2
        RETURNING id`,
      [JSON.stringify(payload), row.id]
    );
    if (!updated || updated.length === 0) return { enqueued: false, reason: 'DB_ERROR' };

    // Envío inmediato en background (el worker reintenta si falla).
    this.dispatchPending().catch((e) => {
      console.error('[maluwa360-webhook] dispatchPending falló (no bloqueante):', e);
    });

    return { enqueued: true };
  }

  /**
   * Envía las filas pending cuyo next_attempt_at ya pasó. Se llama tras encolar
   * y cada WORKER_INTERVAL_MS desde el worker.
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

  /** Arranca el worker de reintentos (no-op si el webhook no está configurado). */
  startWorker(intervalMs: number = WORKER_INTERVAL_MS): void {
    if (this.timer) return;
    if (!getConfig()) {
      console.log('ℹ️  [maluwa360-webhook] MALUWA360_WEBHOOK_URL/SECRET no configuradas: worker de reintentos inactivo');
      return;
    }
    this.timer = setInterval(() => {
      this.dispatchPending().catch((e) => console.error('[maluwa360-webhook] Error en worker:', e));
    }, intervalMs);
    this.timer.unref?.();
    console.log(`✅ [maluwa360-webhook] Worker de reintentos activo (cada ${intervalMs / 1000}s)`);
  }

  stopWorker(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export default new IntegrationWebhookService();

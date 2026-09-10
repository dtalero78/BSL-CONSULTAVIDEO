// ============================================================================
// Detector de cambios del webhook (worker) + deduplicación por huella.
//
// La historia la puede guardar otro backend (AWS) que comparte la BD: el
// detector debe encolar cuando cambia el estado relevante, una sola vez, y el
// hook del guardado en este backend no debe duplicar el envío.
//
// BD en memoria que reproduce la semántica de las consultas del servicio
// (JOIN con HistoriaClinica, huella md5(atendido|mdConceptoFinal), UPDATE
// condicional, claim del outbox y marcado sent/pending).
// ============================================================================

const mockQuery = jest.fn();
jest.mock('../postgres.service', () => ({
  __esModule: true,
  default: { query: (...args: unknown[]) => mockQuery(...args) },
}));

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import integrationWebhookService, { HUELLA_SQL, VENTANA_DETECCION_DIAS } from '../integration-webhook.service';

interface FilaIC {
  id: number;
  external_id: string;
  historia_id: string;
  created_at: Date;
  webhook_huella: string | null;
  webhook_status: 'none' | 'pending' | 'sent' | 'dead';
  webhook_payload: any;
  webhook_seq: number;
  attempts: number;
  next_attempt_at: Date | null;
}
interface FilaHC {
  atendido: string | null;
  mdConceptoFinal: string | null;
  deleted_at: Date | null;
}

const md5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex');
/** Espejo de HUELLA_SQL: md5(COALESCE(atendido,'') || '|' || COALESCE(mdConceptoFinal,'')) */
const huellaDe = (h: FilaHC) => md5(`${h.atendido ?? ''}|${h.mdConceptoFinal ?? ''}`);

let ic: FilaIC[] = [];
let hc: Map<string, FilaHC>;
const sqlEjecutado: string[] = [];

function instalarBd() {
  mockQuery.mockImplementation(async (sql: string, params: any[] = []) => {
    sqlEjecutado.push(sql);
    const candidatas = () =>
      ic
        .map((r) => ({ r, h: hc.get(r.historia_id) }))
        .filter(({ h }) => !!h && h.atendido === 'ATENDIDO' && h.deleted_at === null)
        .map(({ r, h }) => ({
          id: r.id,
          external_id: r.external_id,
          historia_id: r.historia_id,
          webhook_huella: r.webhook_huella,
          concepto_final: (h as FilaHC).mdConceptoFinal,
          huella: huellaDe(h as FilaHC),
          created_at: r.created_at,
        }));

    if (sql.includes('JOIN "HistoriaClinica" h')) {
      if (sql.includes('ic.historia_id = $1')) return candidatas().filter((c) => c.historia_id === params[0]).slice(0, 1);
      if (sql.includes('ic.created_at >=')) {
        const desde = Date.now() - Number(params[0]) * 24 * 60 * 60 * 1000;
        return candidatas().filter((c) => c.created_at.getTime() >= desde && c.webhook_huella !== c.huella);
      }
    }
    if (sql.includes('SET webhook_payload')) {
      const fila = ic.find((r) => r.id === params[2]);
      if (!fila || fila.webhook_huella === params[1]) return [];
      Object.assign(fila, {
        webhook_payload: JSON.parse(params[0]),
        webhook_huella: params[1],
        webhook_status: 'pending',
        webhook_seq: fila.webhook_seq + 1,
        attempts: 0,
        next_attempt_at: new Date(0),
      });
      return [{ id: fila.id }];
    }
    if (sql.includes('FOR UPDATE SKIP LOCKED')) {
      const ahora = Date.now();
      const listas = ic.filter((r) => r.webhook_status === 'pending' && r.next_attempt_at && r.next_attempt_at.getTime() <= ahora);
      listas.forEach((r) => (r.next_attempt_at = new Date(ahora + 120_000)));
      return listas.map((r) => ({
        id: r.id,
        external_id: r.external_id,
        webhook_payload: r.webhook_payload,
        webhook_seq: r.webhook_seq,
        attempts: r.attempts,
      }));
    }
    if (sql.includes("SET webhook_status = 'sent'")) {
      const [intento, , id, seq] = params;
      const fila = ic.find((r) => r.id === id && r.webhook_seq === seq);
      if (fila) Object.assign(fila, { webhook_status: 'sent', attempts: intento });
      return [];
    }
    if (sql.includes('SET webhook_status = $1')) {
      const [estado, intento, , , , id, seq] = params;
      const fila = ic.find((r) => r.id === id && r.webhook_seq === seq);
      if (fila) Object.assign(fila, { webhook_status: estado, attempts: intento });
      return [];
    }
    return [];
  });
}

function crearConsulta(overrides: Partial<FilaIC> = {}, estado: Partial<FilaHC> = {}) {
  const fila: FilaIC = {
    id: ic.length + 1,
    external_id: `ext-${ic.length + 1}`,
    historia_id: `hc-${ic.length + 1}`,
    created_at: new Date(),
    webhook_huella: null,
    webhook_status: 'none',
    webhook_payload: null,
    webhook_seq: 0,
    attempts: 0,
    next_attempt_at: null,
    ...overrides,
  };
  ic.push(fila);
  hc.set(fila.historia_id, { atendido: 'PENDIENTE', mdConceptoFinal: null, deleted_at: null, ...estado });
  return fila;
}

/** Simula el guardado del médico en CUALQUIER backend (misma BD). */
function guardarHistoria(historiaId: string, concepto: string) {
  Object.assign(hc.get(historiaId) as FilaHC, { atendido: 'ATENDIDO', mdConceptoFinal: concepto });
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

const mockFetch = jest.fn();
const originalFetch = global.fetch;

beforeAll(() => {
  (global as any).fetch = mockFetch;
});
afterAll(() => {
  (global as any).fetch = originalFetch;
});

beforeEach(() => {
  ic = [];
  hc = new Map();
  sqlEjecutado.length = 0;
  instalarBd();
  mockFetch.mockResolvedValue({ status: 200, text: async () => 'ok' });
  process.env.MALUWA360_WEBHOOK_URL = 'https://360.maluwa.app/api/integraciones/bsl/resultado';
  process.env.MALUWA360_WEBHOOK_SECRET = 'secreto';
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('detector de cambios (worker)', () => {
  it('cambio de estado (guardado en otro backend) → encola UNA vez', async () => {
    const c = crearConsulta();
    expect(await integrationWebhookService.detectarCambios()).toEqual({ detectadas: 0, encoladas: 0 });

    guardarHistoria(c.historia_id, 'APTO PARA EL CARGO CON RECOMENDACIONES MÉDICO-LABORALES.');
    expect(await integrationWebhookService.detectarCambios()).toEqual({ detectadas: 1, encoladas: 1 });
    expect(c.webhook_status).toBe('pending');
    expect(c.webhook_payload).toEqual({
      externalId: c.external_id,
      historiaId: c.historia_id,
      estado: 'ATENDIDO',
      concepto: 'APTO_CON_RECOMENDACIONES',
      certificadoUrl: `https://bsl-utilidades-yp78a.ondigitalocean.app/generar-certificado-desde-wix/${c.historia_id}`,
    });

    // Siguiente ciclo sin cambios: nada nuevo
    expect(await integrationWebhookService.detectarCambios()).toEqual({ detectadas: 0, encoladas: 0 });
    expect(c.webhook_seq).toBe(1);
  });

  it('sin cambio relevante (sigue PENDIENTE) → no encola', async () => {
    const c = crearConsulta();
    expect(await integrationWebhookService.detectarCambios()).toEqual({ detectadas: 0, encoladas: 0 });
    expect(c.webhook_status).toBe('none');
  });

  it('fuera de la ventana de días o historia borrada → no encola', async () => {
    const vieja = crearConsulta({ created_at: new Date(Date.now() - (VENTANA_DETECCION_DIAS + 1) * 864e5) });
    const borrada = crearConsulta();
    guardarHistoria(vieja.historia_id, 'APTO');
    guardarHistoria(borrada.historia_id, 'APTO');
    (hc.get(borrada.historia_id) as FilaHC).deleted_at = new Date();
    expect(await integrationWebhookService.detectarCambios()).toEqual({ detectadas: 0, encoladas: 0 });
  });

  it('cambio de concepto después de enviado → re-encola una vez con el concepto nuevo', async () => {
    const c = crearConsulta();
    guardarHistoria(c.historia_id, 'APTO');
    await integrationWebhookService.tick();
    expect(c.webhook_status).toBe('sent');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    guardarHistoria(c.historia_id, 'CONCEPTO PENDIENTE POR VALORACIÓN MÉDICA COMPLEMENTARIA.');
    await integrationWebhookService.tick();
    await integrationWebhookService.tick();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mockFetch.mock.calls[1][1].body).concepto).toBe('REMISION');
  });
});

describe('hook del guardado + detector: un solo envío', () => {
  it('guardado en este backend (hook) y luego el detector → se envía una sola vez', async () => {
    const c = crearConsulta();
    guardarHistoria(c.historia_id, 'APTO');

    expect(await integrationWebhookService.enqueueResultado(c.historia_id)).toEqual({ enqueued: true });
    await flush(); // dispatch inmediato del hook

    expect(await integrationWebhookService.detectarCambios()).toEqual({ detectadas: 0, encoladas: 0 });
    await integrationWebhookService.tick();
    await flush();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(c.webhook_status).toBe('sent');
  });

  it('el detector primero y luego el hook (re-guardado sin cambios) → una sola vez', async () => {
    const c = crearConsulta();
    guardarHistoria(c.historia_id, 'APTO');
    await integrationWebhookService.tick();

    expect(await integrationWebhookService.enqueueResultado(c.historia_id)).toEqual({
      enqueued: false,
      reason: 'SIN_CAMBIOS',
    });
    await flush();
    await integrationWebhookService.tick();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('hook y detector (o dos instancias) compitiendo → el UPDATE condicional deja un solo encolado', async () => {
    const c = crearConsulta();
    guardarHistoria(c.historia_id, 'APTO');
    delete process.env.MALUWA360_WEBHOOK_URL; // aislar el encolado del envío

    const [a, b] = await Promise.all([
      integrationWebhookService.enqueueResultado(c.historia_id),
      integrationWebhookService.enqueueResultado(c.historia_id),
    ]);
    expect([a.enqueued, b.enqueued].sort()).toEqual([false, true]);
    expect(c.webhook_seq).toBe(1);
  });
});

describe('SQL del detector', () => {
  it('filtra por estado, borrado, ventana y huella; solo usa columnas reales de producción', async () => {
    await integrationWebhookService.detectarCambios();
    const detectorSql = sqlEjecutado.find((s) => s.includes('ic.created_at >='));
    expect(detectorSql).toBeDefined();
    const sql = String(detectorSql);
    expect(sql).toContain("h.atendido = 'ATENDIDO'");
    expect(sql).toContain('h.deleted_at IS NULL');
    expect(sql).toContain(`ic.webhook_huella IS DISTINCT FROM ${HUELLA_SQL}`);
    expect(HUELLA_SQL).toBe(`md5(COALESCE(h.atendido, '') || '|' || COALESCE(h."mdConceptoFinal", ''))`);
    expect(mockQuery.mock.calls[0][1]).toEqual([String(VENTANA_DETECCION_DIAS)]);

    const esquemaProd = new Set(
      fs
        .readFileSync(path.join(__dirname, 'fixtures', 'historia-clinica.columnas-prod.tsv'), 'utf8')
        .split('\n')
        .filter((l) => l && !l.startsWith('#') && !l.startsWith('column_name\t'))
        .map((l) => l.split('\t')[0])
    );
    const columnasHc = [...sql.matchAll(/\bh\.("?)([A-Za-z_]+)\1/g)].map((m) => m[2]);
    expect(columnasHc.length).toBeGreaterThan(0);
    expect(columnasHc.filter((c) => !esquemaProd.has(c))).toEqual([]);
  });
});

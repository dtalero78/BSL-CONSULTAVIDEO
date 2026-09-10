const mockQuery = jest.fn();
jest.mock('../postgres.service', () => ({
  __esModule: true,
  default: { query: (...args: unknown[]) => mockQuery(...args) },
}));

import { createHmac } from 'crypto';
import integrationWebhookService, {
  BACKOFF_SECONDS,
  MAX_INTENTOS,
  SIGNATURE_HEADER,
  firmarBody,
} from '../integration-webhook.service';

const WEBHOOK_URL = 'https://360.maluwa.app/api/integraciones/bsl/resultado';
const SECRET = 'secreto-compartido-de-prueba';

const mockFetch = jest.fn();
const originalFetch = global.fetch;

const PAYLOAD = {
  externalId: 'ext-1',
  historiaId: 'hc-1',
  estado: 'ATENDIDO',
  concepto: 'APTO_CON_RECOMENDACIONES',
  certificadoUrl: 'https://bsl-utilidades-yp78a.ondigitalocean.app/generar-certificado-desde-wix/hc-1',
};

function filaPendiente(attempts = 0) {
  return { id: 7, external_id: 'ext-1', webhook_payload: PAYLOAD, webhook_seq: 3, attempts };
}

/** Primer query = claim del outbox; el resto (UPDATE de estado) → ok. */
function instalarOutbox(fila: ReturnType<typeof filaPendiente>) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('FOR UPDATE SKIP LOCKED')) return [fila];
    return [{ id: fila.id }];
  });
}

function updateFinal(): [string, unknown[]] {
  const calls = mockQuery.mock.calls.filter(([sql]) => !String(sql).includes('FOR UPDATE SKIP LOCKED'));
  return calls[calls.length - 1] as [string, unknown[]];
}

beforeAll(() => {
  (global as any).fetch = mockFetch;
});

afterAll(() => {
  (global as any).fetch = originalFetch;
});

beforeEach(() => {
  process.env.MALUWA360_WEBHOOK_URL = WEBHOOK_URL;
  process.env.MALUWA360_WEBHOOK_SECRET = SECRET;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('firma del webhook', () => {
  it('firmarBody = hex(HMAC-SHA256(secreto, body))', () => {
    const body = JSON.stringify(PAYLOAD);
    expect(firmarBody(body, SECRET)).toBe(createHmac('sha256', SECRET).update(body, 'utf8').digest('hex'));
    expect(firmarBody(body, 'otro-secreto')).not.toBe(firmarBody(body, SECRET));
    expect(firmarBody(`${body} `, SECRET)).not.toBe(firmarBody(body, SECRET));
  });

  it('dispatch envía X-Signature calculada sobre el body EXACTO enviado', async () => {
    instalarOutbox(filaPendiente());
    mockFetch.mockResolvedValue({ status: 200, text: async () => 'ok' });

    const r = await integrationWebhookService.dispatchPending();

    expect(r).toEqual({ procesados: 1, ok: 1, fail: 0 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(WEBHOOK_URL);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(PAYLOAD);
    const esperada = createHmac('sha256', SECRET).update(init.body, 'utf8').digest('hex');
    expect(init.headers[SIGNATURE_HEADER]).toBe(esperada);

    const [sql, params] = updateFinal();
    expect(sql).toContain("webhook_status = 'sent'");
    expect(sql).toContain('webhook_seq = $4'); // no pisa un re-encolado más nuevo
    expect(params).toEqual([1, 200, 7, 3]);
  });
});

describe('outbox con reintentos', () => {
  it('HTTP 500 → sigue pending, attempts+1 y backoff', async () => {
    instalarOutbox(filaPendiente(0));
    mockFetch.mockResolvedValue({ status: 500, text: async () => 'error' });

    const r = await integrationWebhookService.dispatchPending();

    expect(r.fail).toBe(1);
    const [, params] = updateFinal();
    expect(params).toEqual(['pending', 1, 500, 'HTTP 500', String(BACKOFF_SECONDS[0]), 7, 3]);
  });

  it('error de red en el último intento → dead', async () => {
    instalarOutbox(filaPendiente(MAX_INTENTOS - 1));
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    await integrationWebhookService.dispatchPending();

    const [, params] = updateFinal();
    expect(params[0]).toBe('dead');
    expect(params[1]).toBe(MAX_INTENTOS);
    expect(params[3]).toBe('ECONNREFUSED');
  });

  it('sin MALUWA360_WEBHOOK_URL/SECRET → no consulta la BD ni envía', async () => {
    delete process.env.MALUWA360_WEBHOOK_SECRET;
    const r = await integrationWebhookService.dispatchPending();
    expect(r.procesados).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('enqueueResultado (hook del guardado en este backend)', () => {
  const candidata = {
    id: 7,
    external_id: 'ext-1',
    historia_id: 'hc-1',
    webhook_huella: null as string | null,
    concepto_final: 'APTO PARA EL CARGO CON RECOMENDACIONES MÉDICO-LABORALES.',
    huella: '0123456789abcdef0123456789abcdef',
  };

  beforeEach(() => {
    // Sin config, el dispatch inmediato es no-op: aislamos el encolado.
    delete process.env.MALUWA360_WEBHOOK_URL;
  });

  it('historia que no aplica (no es integración / no atendida / borrada) → no encola', async () => {
    mockQuery.mockResolvedValue([]);
    const r = await integrationWebhookService.enqueueResultado('hc-normal');
    expect(r).toEqual({ enqueued: false, reason: 'NO_APLICA' });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('lee el estado guardado de la BD y encola con UPDATE condicional por huella', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('JOIN "HistoriaClinica" h')) return [candidata];
      return [{ id: 7 }];
    });

    const r = await integrationWebhookService.enqueueResultado('hc-1');

    expect(r).toEqual({ enqueued: true });
    const [selectSql, selectParams] = mockQuery.mock.calls[0];
    expect(selectSql).toContain('ic.historia_id = $1');
    expect(selectParams).toEqual(['hc-1']);
    const [sql, params] = mockQuery.mock.calls[1];
    expect(sql).toContain("webhook_status = 'pending'");
    expect(sql).toContain('webhook_huella IS DISTINCT FROM $2');
    expect(JSON.parse(params[0] as string)).toEqual(PAYLOAD);
    expect(params[1]).toBe(candidata.huella);
    expect(params[2]).toBe(7);
  });

  it('misma huella que la última encolada → SIN_CAMBIOS, sin UPDATE', async () => {
    mockQuery.mockResolvedValue([{ ...candidata, webhook_huella: candidata.huella }]);
    const r = await integrationWebhookService.enqueueResultado('hc-1');
    expect(r).toEqual({ enqueued: false, reason: 'SIN_CAMBIOS' });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('error de BD → no encola (y no lanza)', async () => {
    mockQuery.mockResolvedValue(null);
    await expect(integrationWebhookService.enqueueResultado('hc-1')).resolves.toEqual({
      enqueued: false,
      reason: 'DB_ERROR',
    });
  });
});

// ============================================================================
// Tests de integración del router /api/integration (POST /consultas).
//
// Mini-app Express sin index.ts. Se mockea la capa IO (postgres, Twilio Video,
// WhatsApp); middleware, validación, servicio y upsert de historia son código real.
// ============================================================================

const mockQuery = jest.fn();
const mockGetClient = jest.fn();
const mockRegistrarMensaje = jest.fn();
jest.mock('../../services/postgres.service', () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => mockQuery(...args),
    getClient: (...args: unknown[]) => mockGetClient(...args),
    registrarMensajeSaliente: (...args: unknown[]) => mockRegistrarMensaje(...args),
  },
}));

const mockCreateRoom = jest.fn();
jest.mock('../../services/twilio.service', () => ({
  __esModule: true,
  default: { createRoom: (...args: unknown[]) => mockCreateRoom(...args) },
}));

const mockSendContentTemplate = jest.fn();
jest.mock('../../services/whatsapp.service', () => ({
  __esModule: true,
  default: { sendContentTemplate: (...args: unknown[]) => mockSendContentTemplate(...args) },
}));

import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import integrationRoutes from '../integration.routes';

const API_KEY = 'maluwa-test-key-0123456789abcdef0123456789abcdef';

let server: http.Server;
let port: number;

function post(body: unknown, headers: Record<string, string> = { 'X-Integration-Key': API_KEY }) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/api/integration/consultas',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => resolve({ status: res.statusCode || 0, body: raw ? JSON.parse(raw) : null }));
      }
    );
    req.on('error', reject);
    req.end(data);
  });
}

function payload(overrides: Record<string, unknown> = {}): Record<string, any> {
  return {
    externalId: 'b3f1a2c4-0000-4000-8000-000000000042',
    tipo: 'VALORACION_GENERAL',
    medico: 'MEDICO1',
    empresa: 'MALUWA360',
    institucion: { nombre: 'IE Rural El Carmen', dane: '205001000123' },
    paciente: {
      tipoDocumento: 'TI',
      documento: '1020304050',
      primerNombre: 'Ana',
      primerApellido: 'Pérez',
      fechaNacimiento: '2017-03-01',
      celular: null,
    },
    acudiente: { nombre: 'María Pérez', documento: '43123456', celular: '3001234567', parentesco: 'madre' },
    consentimiento: { version: 'salud-v1', otorgadoEn: '2026-09-01T10:00:00-05:00', medio: 'digital' },
    notificar: false,
    ...overrides,
  };
}

/**
 * BD en memoria: integration_consultas se guarda en `store`; el médico existe
 * salvo que se indique lo contrario. Devuelve el cliente transaccional falso.
 */
const store = new Map<string, Record<string, unknown>>();
function instalarBdFalsa(opts: { medicoExiste?: boolean; errorEnHistoria?: Error } = {}) {
  mockQuery.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes('FROM integration_consultas')) {
      const row = store.get(`${params[0]}|${params[1]}`);
      return row ? [row] : [];
    }
    if (sql.includes('FROM "HistoriaClinica"')) return opts.medicoExiste === false ? [] : [{ '?column?': 1 }];
    return [];
  });
  const client = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      if (sql.includes('INSERT INTO integration_consultas')) {
        const key = `${params[0]}|${params[1]}`;
        if (store.has(key)) return { rows: [] };
        store.set(key, { room_name: params[3], historia_id: params[2], patient_url: params[5], doctor_url: params[6] });
        return { rows: [{ id: store.size }] };
      }
      if (sql.includes('INSERT INTO "HistoriaClinica"')) {
        if (opts.errorEnHistoria) throw opts.errorEnHistoria;
        return { rows: [{ _id: params[0] }] };
      }
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  mockGetClient.mockResolvedValue(client);
  return client;
}

function llamadasSql(client: { query: jest.Mock }, fragmento: string) {
  return client.query.mock.calls.filter(([sql]) => String(sql).includes(fragmento));
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/integration', integrationRoutes);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  store.clear();
  process.env.MALUWA360_API_KEY = API_KEY;
  process.env.APP_URL = 'https://medico-bsl.com';
  process.env.TWILIO_TEMPLATE_VIDEOCONSULTA_SUELTA = 'HXsuelta';
  delete process.env.MALUWA360_TENANT_ID;
  mockCreateRoom.mockResolvedValue({ sid: 'RM1' });
  mockSendContentTemplate.mockResolvedValue({ success: true, messageSid: 'SM1' });
  mockRegistrarMensaje.mockResolvedValue(true);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('POST /api/integration/consultas', () => {
  it('sin X-Integration-Key → 401 y no toca la BD', async () => {
    const res = await post(payload(), {});
    expect(res.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('menor sin acudiente → 400 con mensaje claro, sin tocar la BD', async () => {
    const res = await post(payload({ acudiente: undefined }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.error).toMatch(/menor de edad.*acudiente es obligatorio/);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('sin consentimiento → 400', async () => {
    const res = await post(payload({ consentimiento: undefined }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/consentimiento es obligatorio/);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('crea historia PENDIENTE + sala y responde 201 { roomName, historiaId, patientUrl, doctorUrl }', async () => {
    const client = instalarBdFalsa();
    const res = await post(payload());

    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(['doctorUrl', 'historiaId', 'patientUrl', 'roomName']);
    const { roomName, historiaId, patientUrl, doctorUrl } = res.body;
    expect(roomName).toMatch(/^consulta-[a-z0-9]+-[0-9a-f]{12}$/);

    const pUrl = new URL(patientUrl);
    expect(pUrl.origin + pUrl.pathname).toBe(`https://medico-bsl.com/patient/${roomName}`);
    expect(pUrl.searchParams.get('documento')).toBe(historiaId);
    expect(pUrl.searchParams.get('doctor')).toBe('MEDICO1');
    const dUrl = new URL(doctorUrl);
    expect(dUrl.pathname).toBe(`/doctor/${roomName}`);
    expect(dUrl.searchParams.get('documento')).toBe(historiaId);
    expect(dUrl.searchParams.get('celular')).toBe('+573001234567');

    // Historia creada en la misma transacción, con los datos reales
    const [hcSql, hc] = llamadasSql(client, 'INSERT INTO "HistoriaClinica"')[0];
    expect(hcSql).toMatch(/'PENDIENTE', NOW\(\), NULL/); // atendido, fechaAtencion, fechaConsulta
    expect(hc[0]).toBe(historiaId);
    expect(hc[1]).toBe('1020304050'); // numeroId = documento real
    expect(hc[2]).toBe('Ana');
    expect(hc[4]).toBe('Pérez');
    expect(hc[6]).toBe('573001234567'); // celular del acudiente (menor)
    expect(hc[7]).toBe('2017-03-01'); // fechaNacimiento
    expect(hc[8]).toBe('MALUWA360'); // codEmpresa
    expect(hc[10]).toBe('Valoración General'); // tipoExamen
    expect(hc[11]).toBe('MEDICO1'); // medico
    expect(hc[13]).toBe('bsl'); // tenant_id por defecto
    expect(llamadasSql(client, 'BEGIN')).toHaveLength(1);
    expect(llamadasSql(client, 'COMMIT')).toHaveLength(1);
    expect(client.release).toHaveBeenCalled();

    expect(mockCreateRoom).toHaveBeenCalledWith(roomName);
    expect(mockSendContentTemplate).not.toHaveBeenCalled(); // notificar=false por defecto
  });

  it('respeta MALUWA360_TENANT_ID', async () => {
    process.env.MALUWA360_TENANT_ID = 'maluwa';
    const client = instalarBdFalsa();
    const res = await post(payload());
    expect(res.status).toBe(201);
    expect(llamadasSql(client, 'INSERT INTO "HistoriaClinica"')[0][1][13]).toBe('maluwa');
  });

  it('idempotencia: repetir el externalId → 200 con el mismo payload, sin crear nada nuevo', async () => {
    const client = instalarBdFalsa();
    const primera = await post(payload({ notificar: true }));
    expect(primera.status).toBe(201);

    const segunda = await post(payload({ notificar: true }));
    expect(segunda.status).toBe(200);
    expect(segunda.body).toEqual(primera.body);

    expect(llamadasSql(client, 'INSERT INTO "HistoriaClinica"')).toHaveLength(1);
    expect(mockGetClient).toHaveBeenCalledTimes(1);
    expect(mockCreateRoom).toHaveBeenCalledTimes(1);
    expect(mockSendContentTemplate).toHaveBeenCalledTimes(1);
  });

  it('idempotencia con carrera: si otra petición reclamó el externalId → ROLLBACK y 200 con la suya', async () => {
    const ganadora = {
      room_name: 'consulta-ganadora',
      historia_id: 'hc-ganadora',
      patient_url: 'https://medico-bsl.com/patient/consulta-ganadora?documento=hc-ganadora',
      doctor_url: 'https://medico-bsl.com/doctor/consulta-ganadora?documento=hc-ganadora',
    };
    let lookups = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM integration_consultas')) return ++lookups === 1 ? [] : [ganadora];
      return [{ '?column?': 1 }];
    });
    const client = { query: jest.fn(async () => ({ rows: [] })), release: jest.fn() };
    mockGetClient.mockResolvedValue(client);

    const res = await post(payload());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      roomName: 'consulta-ganadora',
      historiaId: 'hc-ganadora',
      patientUrl: ganadora.patient_url,
      doctorUrl: ganadora.doctor_url,
    });
    expect(llamadasSql(client, 'ROLLBACK')).toHaveLength(1);
    expect(llamadasSql(client, 'INSERT INTO "HistoriaClinica"')).toHaveLength(0);
    expect(mockCreateRoom).not.toHaveBeenCalled();
  });

  it('notificar=true → WhatsApp con la plantilla de consulta suelta al celular del acudiente', async () => {
    instalarBdFalsa();
    const res = await post(payload({ notificar: true }));
    expect(res.status).toBe(201);
    expect(mockSendContentTemplate).toHaveBeenCalledWith(
      '573001234567',
      'HXsuelta',
      { '1': 'Ana Pérez', '2': 'MALUWA360', '3': expect.stringMatching(new RegExp(`^${res.body.roomName}\\?`)) },
      'bsl'
    );
    expect(mockRegistrarMensaje).toHaveBeenCalledWith('+573001234567', expect.any(String), 'SM1', 'Ana Pérez');
  });

  it('si falla el WhatsApp o la pre-creación de la sala, la consulta igual queda creada (201)', async () => {
    instalarBdFalsa();
    mockCreateRoom.mockRejectedValue(new Error('Twilio caído'));
    mockSendContentTemplate.mockResolvedValue({ success: false, error: 'boom' });
    const res = await post(payload({ notificar: true }));
    expect(res.status).toBe(201);
  });

  it('error creando la historia → ROLLBACK y 500 (nada queda reclamado)', async () => {
    const client = instalarBdFalsa({ errorEnHistoria: new Error('column does not exist') });
    const res = await post(payload());
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('CREATE_FAILED');
    expect(llamadasSql(client, 'ROLLBACK')).toHaveLength(1);
    expect(llamadasSql(client, 'COMMIT')).toHaveLength(0);
    expect(client.release).toHaveBeenCalled();
    expect(mockCreateRoom).not.toHaveBeenCalled();
  });

  it('médico no registrado en el tenant → 422', async () => {
    instalarBdFalsa({ medicoExiste: false });
    const res = await post(payload());
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('MEDICO_NO_REGISTRADO');
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('BD no disponible → 503', async () => {
    mockQuery.mockResolvedValue(null);
    const res = await post(payload());
    expect(res.status).toBe(503);
  });
});

// ============================================================================
// El webhook de integración NUNCA debe romper ni frenar el guardado de la
// historia clínica (POST /api/video/medical-history → updateMedicalHistory).
// ============================================================================

const mockQuery = jest.fn();
jest.mock('../postgres.service', () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => mockQuery(...args),
    getClient: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../whatsapp.service', () => ({
  __esModule: true,
  default: {
    sendContentTemplate: jest.fn().mockResolvedValue({ success: true }),
    sendTextMessage: jest.fn().mockResolvedValue({ success: true }),
  },
}));

jest.mock('../whapi.service', () => ({
  __esModule: true,
  default: { sendTextMessage: jest.fn().mockResolvedValue({ success: true }) },
}));

const mockEnqueue = jest.fn();
jest.mock('../integration-webhook.service', () => ({
  __esModule: true,
  default: { enqueueResultado: (...args: unknown[]) => mockEnqueue(...args) },
}));

import medicalHistoryService from '../medical-history.service';

const HISTORIA_ID = 'hc-maluwa-1';
const CONCEPTO = 'APTO PARA EL CARGO CON RECOMENDACIONES MÉDICO-LABORALES.';

function instalarHistoria(codEmpresa: string, opts: { upsertFalla?: boolean } = {}) {
  const hc = {
    _id: HISTORIA_ID,
    numeroId: '1020304050',
    primerNombre: 'Ana',
    primerApellido: 'Pérez',
    celular: '573001234567',
    codEmpresa,
    tipoExamen: 'Valoración General',
    medico: 'MEDICO1',
    tenant_id: 'bsl',
    deleted_at: null,
    fechaAtencion: new Date(),
  };
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT "numeroId", tenant_id, deleted_at')) return [{ numeroId: hc.numeroId, tenant_id: 'bsl', deleted_at: null }];
    if (sql.includes('FROM "HistoriaClinica" h')) return [hc];
    if (sql.includes('voximetrias_virtual')) return [];
    if (sql.includes('SELECT deleted_at FROM "HistoriaClinica"')) return [{ deleted_at: null }];
    if (sql.includes('INSERT INTO "HistoriaClinica"')) return opts.upsertFalla ? null : [{ _id: HISTORIA_ID }];
    return [];
  });
}

function guardar() {
  return medicalHistoryService.updateMedicalHistory({ historiaId: HISTORIA_ID, mdConceptoFinal: CONCEPTO });
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('updateMedicalHistory + webhook de integración', () => {
  it('historia MALUWA360 → pide encolar (el servicio lee el estado guardado y deduplica)', async () => {
    instalarHistoria('MALUWA360');
    mockEnqueue.mockResolvedValue({ enqueued: true });
    await expect(guardar()).resolves.toEqual({ success: true });
    expect(mockEnqueue).toHaveBeenCalledWith(HISTORIA_ID);
  });

  it('si encolar RECHAZA la promesa, el guardado igual responde success', async () => {
    instalarHistoria('MALUWA360');
    mockEnqueue.mockRejectedValue(new Error('relation "integration_consultas" does not exist'));
    await expect(guardar()).resolves.toEqual({ success: true });
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it('si encolar LANZA de forma síncrona, el guardado igual responde success', async () => {
    instalarHistoria('MALUWA360');
    mockEnqueue.mockImplementation(() => {
      throw new Error('boom síncrono');
    });
    await expect(guardar()).resolves.toEqual({ success: true });
  });

  it('si encolar nunca termina, el guardado no se queda esperando', async () => {
    instalarHistoria('MALUWA360');
    mockEnqueue.mockReturnValue(new Promise(() => undefined));
    await expect(guardar()).resolves.toEqual({ success: true });
  });

  it('historias de otras empresas no tocan la integración', async () => {
    instalarHistoria('ACME');
    await expect(guardar()).resolves.toEqual({ success: true });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('si el guardado en PostgreSQL falla, no se encola nada', async () => {
    instalarHistoria('MALUWA360', { upsertFalla: true });
    const r = await guardar();
    expect(r.success).toBe(false);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

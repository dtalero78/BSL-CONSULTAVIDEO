import { Request } from 'express';
import { requireIntegrationKey, INTEGRATION_KEY_HEADER } from '../integration-key.middleware';

const KEY = 'k'.repeat(64);

function mockReq(headers: Record<string, string> = {}): Request {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    header: (name: string) => lower[name.toLowerCase()],
    headers: lower,
    method: 'POST',
    originalUrl: '/api/integration/consultas',
  } as unknown as Request;
}

function mockRes() {
  const res: { status: jest.Mock; json: jest.Mock } = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

function run(headers: Record<string, string> = {}) {
  const req = mockReq(headers);
  const res = mockRes();
  const next = jest.fn();
  requireIntegrationKey(req, res as any, next);
  return { res, next };
}

describe('requireIntegrationKey (X-Integration-Key)', () => {
  const original = process.env.MALUWA360_API_KEY;

  beforeEach(() => {
    process.env.MALUWA360_API_KEY = KEY;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (original === undefined) delete process.env.MALUWA360_API_KEY;
    else process.env.MALUWA360_API_KEY = original;
    jest.restoreAllMocks();
  });

  it('sin clave → 401 MISSING_INTEGRATION_KEY y no continúa', () => {
    const { res, next } = run();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'MISSING_INTEGRATION_KEY' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('clave inválida (misma longitud) → 401 INVALID_INTEGRATION_KEY', () => {
    const { res, next } = run({ [INTEGRATION_KEY_HEADER]: 'x'.repeat(64) });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_INTEGRATION_KEY' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('clave inválida (distinta longitud / prefijo de la real) → 401', () => {
    const { res, next } = run({ [INTEGRATION_KEY_HEADER]: KEY.slice(0, 10) });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('la clave va en X-Integration-Key, no en Authorization', () => {
    const { res, next } = run({ Authorization: `Bearer ${KEY}` });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('clave válida → next() sin responder', () => {
    const { res, next } = run({ [INTEGRATION_KEY_HEADER]: KEY });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('variable ausente → 503 aunque se envíe una clave (falla cerrado)', () => {
    delete process.env.MALUWA360_API_KEY;
    const { res, next } = run({ [INTEGRATION_KEY_HEADER]: KEY });
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INTEGRATION_NOT_CONFIGURED' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('variable vacía → 503 incluso si el header también llega vacío', () => {
    process.env.MALUWA360_API_KEY = '   ';
    const { res, next } = run({ [INTEGRATION_KEY_HEADER]: '' });
    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  it('variable demasiado corta para ser una clave real → 503', () => {
    process.env.MALUWA360_API_KEY = 'corta';
    const { res, next } = run({ [INTEGRATION_KEY_HEADER]: 'corta' });
    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });
});

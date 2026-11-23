import {
  MAX_INTENTOS,
  estaBloqueado,
  extraerBearer,
  generarToken,
  hashToken,
  ipValida,
  normalizarAlias,
  registrarFallo,
} from '../sesion';

describe('token de sesión', () => {
  it('32 bytes en base64url y distinto cada vez', () => {
    const a = generarToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generarToken()).not.toBe(a);
  });
  it('hashToken es sha256 hex (64 caracteres) y determinista', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashToken(generarToken())).toMatch(/^[0-9a-f]{64}$/);
  });
  it('extraerBearer', () => {
    const t = generarToken();
    expect(extraerBearer(`Bearer ${t}`)).toBe(t);
    expect(extraerBearer(`bearer ${t}`)).toBeNull();
    expect(extraerBearer('Bearer corto')).toBeNull();
    expect(extraerBearer('Bearer abc def ghi jkl mno pqr')).toBeNull();
    expect(extraerBearer(undefined)).toBeNull();
  });
});

describe('bloqueo por intentos fallidos', () => {
  it('suma intentos y bloquea al quinto, con el contador en cero', () => {
    let intentos = 0;
    for (let i = 1; i < MAX_INTENTOS; i++) {
      const r = registrarFallo(intentos);
      expect(r).toEqual({ intentos: i, bloquear: false });
      intentos = r.intentos;
    }
    expect(registrarFallo(intentos)).toEqual({ intentos: 0, bloquear: true });
  });
  it('estaBloqueado compara con la hora dada', () => {
    const ahora = new Date('2026-11-23T12:00:00Z');
    expect(estaBloqueado(null, ahora)).toBe(false);
    expect(estaBloqueado('2026-11-23T12:14:59Z', ahora)).toBe(true);
    expect(estaBloqueado(new Date('2026-11-23T11:59:59Z'), ahora)).toBe(false);
    expect(estaBloqueado('basura', ahora)).toBe(false);
  });
});

describe('utilidades', () => {
  it('normalizarAlias', () => {
    expect(normalizarAlias(' sixta ')).toBe('SIXTA');
    expect(normalizarAlias(null)).toBe('');
  });
  it('ipValida', () => {
    expect(ipValida(' 190.24.1.5 ')).toBe('190.24.1.5');
    expect(ipValida('2800:e2:1::5')).toBe('2800:e2:1::5');
    expect(ipValida('<script>')).toBeNull();
    expect(ipValida('1'.repeat(46))).toBeNull();
    expect(ipValida(undefined)).toBeNull();
  });
});

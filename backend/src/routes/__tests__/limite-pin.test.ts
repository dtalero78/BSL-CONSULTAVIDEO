// Tope de intentos de PIN por conexión (rutas de medicina general).
import { limitarIntentosDePin } from '../medicina-general.routes';

function pedido(ip: string) {
  return { headers: { 'x-forwarded-for': `1.2.3.4, ${ip}` }, socket: {} } as any;
}

function respuesta() {
  const r: any = { codigo: 0 };
  r.status = (c: number) => { r.codigo = c; return r; };
  r.json = () => r;
  return r;
}

describe('limitarIntentosDePin', () => {
  it('deja pasar 20 intentos por conexión y frena el 21', () => {
    let pasaron = 0;
    let frenado = 0;
    for (let i = 0; i < 21; i++) {
      const res = respuesta();
      limitarIntentosDePin(pedido('203.0.113.7'), res, () => { pasaron++; });
      if (res.codigo === 429) frenado++;
    }
    expect([pasaron, frenado]).toEqual([20, 1]);
  });

  it('una IP inventada al principio de x-forwarded-for no salta el tope', () => {
    let frenado = 0;
    for (let i = 0; i < 25; i++) {
      const res = respuesta();
      const req = { headers: { 'x-forwarded-for': `10.0.0.${i}, 198.51.100.9`, 'cf-connecting-ip': `9.9.9.${i}` }, socket: {} } as any;
      limitarIntentosDePin(req, res, () => {});
      if (res.codigo === 429) frenado++;
    }
    expect(frenado).toBe(5);
  });

  it('cada conexión lleva su propia cuenta', () => {
    let pasaron = 0;
    limitarIntentosDePin(pedido('203.0.113.8'), respuesta(), () => { pasaron++; });
    expect(pasaron).toBe(1);
  });
});

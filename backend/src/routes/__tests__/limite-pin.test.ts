// Tope de intentos de PIN por conexión (rutas de medicina general).
import { limitarIntentosDePin } from '../medicina-general.routes';

function pedido(ip: string) {
  return { headers: { 'cf-connecting-ip': ip }, socket: {} } as any;
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

  it('cada conexión lleva su propia cuenta', () => {
    let pasaron = 0;
    limitarIntentosDePin(pedido('203.0.113.8'), respuesta(), () => { pasaron++; });
    expect(pasaron).toBe(1);
  });
});

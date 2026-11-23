// Rutas de la consulta de medicina general (montadas en /api/video/medicina-general).
// Detalle de cada endpoint en controllers/medicina-general.controller.ts.
import { Router, Request, Response, NextFunction } from 'express';
import medicinaGeneralController, { crearControladorMedicinaGeneral } from '../controllers/medicina-general.controller';

type Controlador = ReturnType<typeof crearControladorMedicinaGeneral>;

/**
 * Tope de intentos de PIN por conexión: 20 cada 15 minutos. El bloqueo por médico (5 fallos → 15
 * min) frena adivinar el PIN de UNO; esto frena probar contra todos a la vez y gastar CPU (bcrypt)
 * y conexiones de la base compartida. En memoria: la app corre en una sola tarea de ECS.
 */
const VENTANA_MS = 15 * 60 * 1000;
const MAX_INTENTOS_POR_IP = 20;
const intentosPorIp = new Map<string, { desde: number; n: number }>();

/** La IP del cliente: la que pone Cloudflare, o la última que agregó el balanceador. */
function ipDelCliente(req: Request): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf) return cf.trim();
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((v) => v.trim()).filter(Boolean);
  return xff[xff.length - 1] || req.socket?.remoteAddress || 'desconocida';
}

export function limitarIntentosDePin(req: Request, res: Response, next: NextFunction): void {
  const ahora = Date.now();
  if (intentosPorIp.size > 5000) {
    for (const [ip, v] of intentosPorIp) if (ahora - v.desde > VENTANA_MS) intentosPorIp.delete(ip);
  }
  const ip = ipDelCliente(req);
  const actual = intentosPorIp.get(ip);
  const registro = !actual || ahora - actual.desde > VENTANA_MS ? { desde: ahora, n: 0 } : actual;
  registro.n += 1;
  intentosPorIp.set(ip, registro);
  if (registro.n > MAX_INTENTOS_POR_IP) {
    res.status(429).json({ error: 'Demasiados intentos desde esta conexión. Espere 15 minutos.', codigo: 'DEMASIADOS_INTENTOS' });
    return;
  }
  next();
}

export function crearRutasMedicinaGeneral(controlador: Controlador = medicinaGeneralController): Router {
  const router = Router();
  // '/cie10' y '/sesion' van ANTES de '/:historiaId' para que no se tome como un id de orden.
  // '/sesion' es el ingreso con PIN; el catálogo CIE-10 queda abierto (no es de ninguna IPS).
  router.get('/cie10', controlador.buscarCie10);
  router.post('/sesion', limitarIntentosDePin, controlador.iniciarSesion);
  // La consulta, solo con la sesión del médico asignado a la orden.
  router.get('/:historiaId', controlador.requerirSesion, controlador.obtener);
  router.put('/:historiaId', controlador.requerirSesion, controlador.guardarBorrador);
  router.post('/:historiaId/cerrar', controlador.requerirSesion, controlador.cerrar);
  return router;
}

export default crearRutasMedicinaGeneral();

// Rutas de la consulta de medicina general (montadas en /api/video/medicina-general).
// Detalle de cada endpoint en controllers/medicina-general.controller.ts.
import { Router } from 'express';
import medicinaGeneralController, { crearControladorMedicinaGeneral } from '../controllers/medicina-general.controller';

type Controlador = ReturnType<typeof crearControladorMedicinaGeneral>;

export function crearRutasMedicinaGeneral(controlador: Controlador = medicinaGeneralController): Router {
  const router = Router();
  // '/cie10' y '/sesion' van ANTES de '/:historiaId' para que no se tome como un id de orden.
  // '/sesion' es el ingreso con PIN; el catálogo CIE-10 queda abierto (no es de ninguna IPS).
  router.get('/cie10', controlador.buscarCie10);
  router.post('/sesion', controlador.iniciarSesion);
  // La consulta, solo con la sesión del médico asignado a la orden.
  router.get('/:historiaId', controlador.requerirSesion, controlador.obtener);
  router.put('/:historiaId', controlador.requerirSesion, controlador.guardarBorrador);
  router.post('/:historiaId/cerrar', controlador.requerirSesion, controlador.cerrar);
  return router;
}

export default crearRutasMedicinaGeneral();

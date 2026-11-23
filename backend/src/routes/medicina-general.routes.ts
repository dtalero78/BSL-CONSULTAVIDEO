// Rutas de la consulta de medicina general (montadas en /api/video/medicina-general).
// Detalle de cada endpoint en controllers/medicina-general.controller.ts.
import { Router } from 'express';
import medicinaGeneralController, { crearControladorMedicinaGeneral } from '../controllers/medicina-general.controller';

type Controlador = ReturnType<typeof crearControladorMedicinaGeneral>;

export function crearRutasMedicinaGeneral(controlador: Controlador = medicinaGeneralController): Router {
  const router = Router();
  // '/cie10' va ANTES de '/:historiaId' para que no se tome como un id de orden.
  router.get('/cie10', controlador.buscarCie10);
  router.get('/:historiaId', controlador.obtener);
  router.put('/:historiaId', controlador.guardarBorrador);
  router.post('/:historiaId/cerrar', controlador.cerrar);
  return router;
}

export default crearRutasMedicinaGeneral();

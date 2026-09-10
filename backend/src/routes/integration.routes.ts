// ============================================================================
// integration.routes — API de integraciones B2B.
//
// Base path: /api/integration
//   POST /consultas → crear consulta médica virtual (Maluwa360)
//
// TODAS las rutas exigen `X-Integration-Key: <MALUWA360_API_KEY>`
// (falla cerrado: sin la variable configurada responde 503).
// ============================================================================

import { Router } from 'express';
import integrationController from '../controllers/integration.controller';
import { requireIntegrationKey } from '../middleware/integration-key.middleware';

const router = Router();

router.use(requireIntegrationKey);

router.post('/consultas', integrationController.crearConsulta);

export default router;

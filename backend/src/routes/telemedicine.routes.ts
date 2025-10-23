import { Router } from 'express';
import * as telemedicineController from '../controllers/telemedicine.controller';

const router = Router();

/**
 * GET /api/telemedicine/sessions/:roomName
 * Obtener información de una sesión específica
 */
router.get('/sessions/:roomName', telemedicineController.getSession);

/**
 * GET /api/telemedicine/sessions/:roomName/validate
 * Validar si una sesión existe y está activa
 */
router.get('/sessions/:roomName/validate', telemedicineController.validateSession);

/**
 * GET /api/telemedicine/sessions
 * Obtener todas las sesiones activas
 */
router.get('/sessions', telemedicineController.getActiveSessions);

export default router;

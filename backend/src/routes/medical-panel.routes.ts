import { Router, Request, Response } from 'express';
import medicalPanelController from '../controllers/medical-panel.controller';

const router = Router();

// Estadísticas del día para un médico
router.get('/stats/:medicoCode', medicalPanelController.getDailyStats);

// Lista paginada de pacientes pendientes
router.get('/patients/pending/:medicoCode', medicalPanelController.getPendingPatients);

// Búsqueda de paciente por documento
router.get('/patients/search/:documento', medicalPanelController.searchPatientByDocument);

// Detalles completos de un paciente
router.get('/patients/details/:documento', medicalPanelController.getPatientDetails);

// Marcar paciente como "No Contesta"
router.patch('/patients/:patientId/no-answer', medicalPanelController.markAsNoAnswer);

// Actualizar aprobación desde link de WhatsApp
router.get('/approve/:historiaId/:decision', (req, res) => medicalPanelController.updateAprobacion(req, res));

export default router;

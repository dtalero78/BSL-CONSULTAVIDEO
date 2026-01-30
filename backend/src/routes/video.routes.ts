import { Router } from 'express';
import videoController from '../controllers/video.controller';

const router = Router();

// Generar token de acceso
router.post('/token', videoController.generateToken);

// Gestión de salas
router.post('/rooms', videoController.createRoom);
router.get('/rooms/:roomName', videoController.getRoom);
router.post('/rooms/:roomName/end', videoController.endRoom);

// Gestión de participantes
router.get('/rooms/:roomName/participants', videoController.listParticipants);
router.post(
  '/rooms/:roomName/participants/:participantSid/disconnect',
  videoController.disconnectParticipant
);

// Tracking de sesiones para reportes
router.post('/events/participant-connected', videoController.trackParticipantConnected);
router.post('/events/participant-disconnected', videoController.trackParticipantDisconnected);
router.get('/events/connected-patients', videoController.getConnectedPatients);

// WhatsApp
router.post('/whatsapp/send', videoController.sendWhatsApp);

// Medical History
// IMPORTANTE: La ruta específica '/patient/:numeroId' debe ir ANTES de '/:historiaId' para evitar conflictos
router.get('/medical-history/patient/:numeroId', videoController.getPatientHistory);
router.get('/medical-history/:historiaId', videoController.getMedicalHistory);
router.post('/medical-history', videoController.updateMedicalHistory);

// AI Suggestions
router.post('/ai-suggestions', videoController.generateAISuggestions);

export default router;

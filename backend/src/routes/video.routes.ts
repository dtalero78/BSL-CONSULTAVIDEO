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

// WhatsApp
router.post('/whatsapp/send', videoController.sendWhatsApp);

export default router;

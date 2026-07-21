import express, { Router, Request, Response, NextFunction } from 'express';
import videoController from '../controllers/video.controller';

const router = Router();

/**
 * Autenticación servicio-a-servicio para endpoints que exponen datos sensibles.
 *
 * La grabación de una consulta es historia clínica: sin esto, cualquiera que
 * adivine o vea un nombre de sala (viajan por WhatsApp y en la URL) obtenía un
 * link firmado al MP4. Lo consume bsl-plataforma (módulo de Calidad), no el
 * navegador del paciente, así que un token compartido es suficiente.
 *
 * Falla CERRADO: si no hay token configurado, se rechaza. Preferimos que el
 * módulo de calidad no cargue el video a que las consultas queden expuestas.
 */
function requireInternalToken(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.INTERNAL_API_TOKEN;
  if (!expected) {
    console.error('[Auth] INTERNAL_API_TOKEN no configurado: se rechaza el acceso a la grabación');
    res.status(503).json({ error: 'Internal token not configured' });
    return;
  }
  const got = req.header('X-Internal-Token');
  if (got !== expected) {
    console.warn(`[Auth] Token interno inválido para ${req.method} ${req.originalUrl}`);
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

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

// Grabación: link (presigned URL) del MP4 de una sala (Chime → S3).
// Protegido: es historia clínica y lo consume bsl-plataforma, no el navegador.
router.get('/recordings/:roomName', requireInternalToken, videoController.getRecording);

// WhatsApp
router.post('/whatsapp/send', videoController.sendWhatsApp);
router.post('/whatsapp/send-suelta', videoController.sendWhatsAppSuelta);

// Medical History
// IMPORTANTE: La ruta específica '/patient/:numeroId' debe ir ANTES de '/:historiaId' para evitar conflictos
router.get('/medical-history/patient/:numeroId', videoController.getPatientHistory);
router.get('/medical-history/:historiaId', videoController.getMedicalHistory);
router.post('/medical-history', videoController.updateMedicalHistory);

// AI Suggestions
router.post('/ai-suggestions', videoController.generateAISuggestions);

// Transcripción de consulta (audio grabado en el navegador del médico).
// express.raw captura el cuerpo binario sin importar el Content-Type del audio.
router.post(
  '/transcribe-consulta/:historiaId',
  express.raw({ type: () => true, limit: '60mb' }),
  videoController.transcribeConsulta
);

export default router;

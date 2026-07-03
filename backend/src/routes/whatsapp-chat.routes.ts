// Rutas del chat de WhatsApp del panel médico (proxy a bsl-plataforma).
// Sin webhook inbound: Twilio apunta a bsl-plataforma.com (tenant 'bsl').
import { Router } from 'express';
import whatsappChatController from '../controllers/whatsapp-chat.controller';

const router = Router();

// Lectura del hilo + responder desde el panel.
router.get('/mensajes', whatsappChatController.getMensajes);
router.post('/mensajes', whatsappChatController.sendReply);

export default router;

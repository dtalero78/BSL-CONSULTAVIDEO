// ============================================================================
// whatsapp-chat.controller — chat de WhatsApp del panel médico.
//
//   GET  /api/whatsapp-chat/mensajes?celular=...  → hilo del paciente
//   POST /api/whatsapp-chat/mensajes { celular, texto } → responder
//   GET  /api/whatsapp-chat/media?url=...     → adjunto (imagen/PDF) del paciente
//
// El inbound de WhatsApp del +573153369631 lo recibe bsl-plataforma (tenant
// 'bsl'). Estos endpoints son un PROXY a su API `/api/irischat/*` — ver
// bsl-plataforma-chat.service. Sin auth de ruta: coherente con el resto del
// panel de esta app (no existe middleware de auth aquí).
// ============================================================================

import { Request, Response } from 'express';
import bslPlataformaChatService, { esMediaDeTwilio } from '../services/bsl-plataforma-chat.service';

class WhatsappChatController {
  /** GET /mensajes?celular=... → hilo de la conversación. */
  getMensajes = async (req: Request, res: Response): Promise<void> => {
    try {
      const celular = typeof req.query.celular === 'string' ? req.query.celular : '';
      if (!celular) {
        res.status(400).json({ success: false, error: 'celular requerido' });
        return;
      }
      const data = await bslPlataformaChatService.getMensajes(celular);
      res.status(200).json({ success: true, celular: data.celular, mensajes: data.mensajes });
    } catch (error: any) {
      console.error('[WA-Chat] getMensajes error:', error?.message ?? error);
      res
        .status(502)
        .json({ success: false, error: 'No se pudo cargar la conversación desde la plataforma.' });
    }
  };

  /** POST /mensajes { celular, texto } → responde al paciente vía la plataforma. */
  sendReply = async (req: Request, res: Response): Promise<void> => {
    try {
      const { celular, texto } = (req.body ?? {}) as { celular?: string; texto?: string };
      if (!celular || !texto || !texto.trim()) {
        res.status(400).json({ success: false, error: 'celular y texto requeridos' });
        return;
      }
      const mensaje = await bslPlataformaChatService.sendReply(celular, texto.trim());
      if (!mensaje) {
        res.status(422).json({
          success: false,
          error: 'No hay una conversación abierta con este paciente.',
          hint: 'Solo se puede responder dentro de las 24h desde el último mensaje del paciente.',
        });
        return;
      }
      res.status(200).json({ success: true, mensaje });
    } catch (error: any) {
      console.error('[WA-Chat] sendReply error:', error?.message ?? error);
      res
        .status(502)
        .json({ success: false, error: 'No se pudo enviar el mensaje por la plataforma.' });
    }
  };

  /**
   * GET /media?url=... → adjunto que el paciente mandó por WhatsApp. Las URLs de
   * Twilio exigen credenciales, así que se piden al proxy de la plataforma y se
   * re-emiten en streaming (el JWT de la plataforma nunca llega al navegador).
   */
  getMedia = async (req: Request, res: Response): Promise<void> => {
    const url = typeof req.query.url === 'string' ? req.query.url : '';
    if (!esMediaDeTwilio(url)) {
      res.status(400).json({ success: false, error: 'URL de adjunto no válida' });
      return;
    }
    try {
      const media = await bslPlataformaChatService.getMedia(url);
      for (const [k, v] of Object.entries(media.headers)) res.setHeader(k, v);
      // Datos clínicos: solo caché del navegador del médico, nunca compartida.
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.status(media.status);
      media.body.on('error', () => res.destroy());
      media.body.pipe(res);
    } catch (error: any) {
      console.error('[WA-Chat] getMedia error:', error?.message ?? error);
      if (!res.headersSent) {
        res.status(502).json({ success: false, error: 'No se pudo cargar el adjunto.' });
      }
    }
  };
}

export default new WhatsappChatController();

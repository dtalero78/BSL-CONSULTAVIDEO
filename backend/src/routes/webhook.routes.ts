import { Router, Request, Response } from 'express';
import twilio from 'twilio';
import twilioService from '../services/twilio.service';
import postgresService from '../services/postgres.service';

const router = Router();

/**
 * POST /api/webhook/twilio/room-ended
 *
 * Twilio llama este endpoint cuando un VideoRoom cierra (RoomStatus=completed).
 * Cubre el caso donde el médico cierra la pestaña directamente sin usar el botón
 * "Leave" — en ese caso el frontend no dispara trackParticipantDisconnected y
 * la sala queda sin composition.
 *
 * Configurar en Twilio Console → Video → Manage → Room settings → Status Callbacks.
 */
router.post('/twilio/room-ended', async (req: Request, res: Response) => {
  // Validar firma Twilio
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';
  const signature = req.headers['x-twilio-signature'] as string || '';
  const url = `${process.env.BASE_URL || ''}/api/webhook/twilio/room-ended`;

  if (authToken && signature) {
    const valid = twilio.validateRequest(authToken, signature, url, req.body);
    if (!valid) {
      console.warn('[Webhook] Firma Twilio inválida — request rechazado');
      res.status(403).json({ error: 'Invalid Twilio signature' });
      return;
    }
  } else {
    console.warn('[Webhook] TWILIO_AUTH_TOKEN no configurado — saltando validación de firma');
  }

  const { RoomSid, RoomName, RoomStatus } = req.body;

  if (RoomStatus !== 'completed') {
    res.sendStatus(200);
    return;
  }

  console.log(`[Webhook] room-ended: ${RoomName} (${RoomSid})`);

  // Responder rápido a Twilio, procesar en background
  res.sendStatus(200);

  try {
    // Buscar la sesión: solo actuar si tiene grabación habilitada y aún no tiene composition
    const rows = await postgresService.query(
      `SELECT id, recording_enabled, composition_sid
       FROM video_sessions
       WHERE room_sid = $1 OR room_name = $2
       LIMIT 1`,
      [RoomSid, RoomName]
    );

    const session = rows && rows[0];

    if (!session) {
      console.log(`[Webhook] Sin registro en video_sessions para room ${RoomName} — ignorando`);
      return;
    }

    if (!session.recording_enabled) {
      console.log(`[Webhook] Room ${RoomName} sin grabación habilitada — ignorando`);
      return;
    }

    if (session.composition_sid) {
      console.log(`[Webhook] Room ${RoomName} ya tiene composition_sid ${session.composition_sid} — ignorando`);
      return;
    }

    // Crear composición
    console.log(`[Webhook] Creando composición para room ${RoomName} (${RoomSid})`);
    const comp = await twilioService.createComposition(RoomSid);

    await postgresService.query(
      `UPDATE video_sessions SET composition_sid = $1 WHERE room_sid = $2 OR room_name = $3`,
      [comp.sid, RoomSid, RoomName]
    );

    console.log(`[Webhook] Composición ${comp.sid} creada y guardada para room ${RoomName}`);
  } catch (err: any) {
    console.error(`[Webhook] Error procesando room-ended para ${RoomName}:`, err.message);
  }
});

export default router;

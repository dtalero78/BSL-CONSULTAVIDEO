/**
 * Provider de video basado en Twilio Video.
 * Envuelve el `twilioService` existente (no duplica su lógica), de modo que el
 * comportamiento en DigitalOcean queda idéntico al actual.
 */
import twilioService from '../twilio.service';
import {
  IVideoProvider,
  JoinInfo,
  RoomInfo,
  ParticipantInfo,
  RoomCompletedError,
} from './types';

export class TwilioVideoProvider implements IVideoProvider {
  readonly name = 'twilio' as const;

  async join({
    identity,
    roomName,
    role,
  }: { identity: string; roomName: string; role?: 'doctor' | 'patient' }): Promise<JoinInfo> {
    // Misma lógica que tenía el controlador: si la sala existe y está completada
    // → 403; si no existe → crearla; luego generar token.
    // Excepción: el médico siempre puede reingresar. Una sala completada se trata
    // como inexistente y se crea de nuevo con el mismo uniqueName (Twilio lo
    // permite una vez la anterior finalizó).
    try {
      const existing = await twilioService.getRoom(roomName);
      if (existing.status === 'completed') {
        if (role === 'doctor') throw new Error('room-completed-reopen');
        throw new RoomCompletedError();
      }
      console.log(`Room already exists: ${roomName}`);
    } catch (err) {
      if (err instanceof RoomCompletedError) throw err;
      try {
        await twilioService.createRoom(roomName);
        console.log(`Room created as group (max 2): ${roomName}`);
      } catch (createError: any) {
        if (createError?.code !== 53113) {
          console.warn(`Could not create room, will use existing: ${createError?.message}`);
        }
      }
    }

    const tokenData = twilioService.generateVideoToken({ identity, roomName });
    return { provider: 'twilio', identity, roomName, token: tokenData.token };
  }

  async getRoom(roomName: string): Promise<RoomInfo | null> {
    try {
      const r = await twilioService.getRoom(roomName);
      return { id: r.sid, name: r.uniqueName, status: r.status, raw: r };
    } catch {
      return null;
    }
  }

  async createRoom(roomName: string): Promise<RoomInfo> {
    const r = await twilioService.createRoom(roomName);
    return { id: r.sid, name: r.uniqueName, status: r.status, raw: r };
  }

  async endRoom(roomName: string): Promise<{ id: string; status: string }> {
    const r = await twilioService.endRoom(roomName, false);
    return { id: r.sid, status: r.status };
  }

  async listParticipants(roomName: string): Promise<ParticipantInfo[]> {
    const ps = await twilioService.listParticipants(roomName);
    return ps.map((p) => ({
      id: p.sid,
      identity: p.identity,
      status: p.status,
      startTime: p.startTime,
      duration: p.duration,
    }));
  }

  async disconnectParticipant(roomName: string, participantId: string): Promise<{ id: string; status: string }> {
    const r = await twilioService.disconnectParticipant(roomName, participantId);
    return { id: r.sid, status: r.status };
  }

  async enableRecording(roomName: string): Promise<boolean> {
    const room = await twilioService.getRoom(roomName);
    await twilioService.enableRecording(room.sid);
    return true;
  }

  // Twilio graba vía recording rules (enableRecording en setupRecordingIfNeeded);
  // no usa este disparador. No-op.
  async startRecording(_roomName: string): Promise<void> {
    /* no-op para Twilio */
  }
}

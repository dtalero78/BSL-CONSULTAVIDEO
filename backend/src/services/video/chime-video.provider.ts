/**
 * Provider de video basado en Amazon Chime SDK.
 *
 * Usa el rol IAM de la tarea Fargate (sin llaves estáticas). Mantiene en memoria
 * el mapa roomName → Meeting (consistente con el modelo single-instance de la app,
 * igual que session-tracker). La grabación server-side se difiere en este corte.
 */
import crypto from 'crypto';
import {
  ChimeSDKMeetingsClient,
  CreateMeetingCommand,
  CreateAttendeeCommand,
  GetMeetingCommand,
  DeleteMeetingCommand,
  ListAttendeesCommand,
  DeleteAttendeeCommand,
  Meeting,
} from '@aws-sdk/client-chime-sdk-meetings';
import {
  IVideoProvider,
  JoinInfo,
  RoomInfo,
  ParticipantInfo,
  RoomCompletedError,
} from './types';
import { chimeRecordingService } from './chime-recording.service';

// Región del plano de control de Chime (endpoints regionales limitados).
const CONTROL_REGION = process.env.CHIME_CONTROL_REGION || 'us-east-1';
// Región donde se hospeda el media (puede ser distinta; Chime elige la más cercana).
const MEDIA_REGION = process.env.CHIME_MEDIA_REGION || process.env.AWS_REGION || 'us-east-1';
// Cuánto tiempo se bloquea el reingreso a una sala tras finalizarla.
const ENDED_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function sanitizeExternalUserId(identity: string): string {
  // Chime ExternalUserId: 2-64 chars. Recortamos y garantizamos longitud mínima.
  const cleaned = (identity || 'user').trim().slice(0, 64);
  return cleaned.length >= 2 ? cleaned : `u-${cleaned}`;
}

export class ChimeVideoProvider implements IVideoProvider {
  readonly name = 'chime' as const;
  private client = new ChimeSDKMeetingsClient({ region: CONTROL_REGION });
  private meetings = new Map<string, Meeting>(); // roomName -> Meeting
  private ended = new Map<string, number>(); // roomName -> endedAt (ms)

  private isEnded(roomName: string): boolean {
    const t = this.ended.get(roomName);
    if (!t) return false;
    if (Date.now() - t > ENDED_TTL_MS) {
      this.ended.delete(roomName);
      return false;
    }
    return true;
  }

  /** Reutiliza el meeting vigente para la sala, o crea uno nuevo. */
  private async ensureMeeting(roomName: string): Promise<Meeting> {
    const cached = this.meetings.get(roomName);
    if (cached?.MeetingId) {
      try {
        const got = await this.client.send(new GetMeetingCommand({ MeetingId: cached.MeetingId }));
        if (got.Meeting) return got.Meeting;
      } catch {
        this.meetings.delete(roomName);
      }
    }

    const created = await this.client.send(
      new CreateMeetingCommand({
        ClientRequestToken: crypto.randomUUID(),
        MediaRegion: MEDIA_REGION,
        ExternalMeetingId: roomName.slice(0, 64),
      })
    );
    if (!created.Meeting) throw new Error('Chime CreateMeeting no devolvió Meeting');
    this.meetings.set(roomName, created.Meeting);
    console.log(`[Chime] Meeting creado para sala ${roomName}: ${created.Meeting.MeetingId}`);

    // NOTA: la grabación NO se arranca aquí. Si el Media Capture Pipeline se une
    // mientras los clientes establecen su video, la señalización se satura
    // (Batch timing timeout) y el video no se renderiza (peor en móvil). Se
    // arranca en startRecording() cuando ambos ya están conectados.

    return created.Meeting;
  }

  async join({
    identity,
    roomName,
    role,
  }: { identity: string; roomName: string; role?: 'doctor' | 'patient' }): Promise<JoinInfo> {
    // El médico SIEMPRE puede reingresar, y al hacerlo REABRE la sala (borra la
    // marca de finalizada) para que su paciente también pueda volver a entrar.
    // Antes, cualquier desconexión del médico —recargar la página, una caída de
    // red, cerrar la pestaña por error— marcaba la sala como finalizada y la
    // dejaba inutilizable durante ENDED_TTL_MS (6h): al volver recibía
    // "Esta videollamada ya finalizó y no se puede volver a ingresar".
    if (role === 'doctor') {
      if (this.ended.delete(roomName)) {
        console.log(`[Chime] Sala ${roomName} reabierta por el médico (${identity})`);
      }
    } else if (this.isEnded(roomName)) {
      throw new RoomCompletedError();
    }

    const meeting = await this.ensureMeeting(roomName);
    const att = await this.client.send(
      new CreateAttendeeCommand({
        MeetingId: meeting.MeetingId!,
        ExternalUserId: sanitizeExternalUserId(identity),
      })
    );

    return { provider: 'chime', identity, roomName, meeting, attendee: att.Attendee };
  }

  async getRoom(roomName: string): Promise<RoomInfo | null> {
    const cached = this.meetings.get(roomName);
    if (!cached?.MeetingId) {
      return this.isEnded(roomName)
        ? { id: roomName, name: roomName, status: 'completed' }
        : null;
    }
    try {
      const got = await this.client.send(new GetMeetingCommand({ MeetingId: cached.MeetingId }));
      if (got.Meeting) {
        return { id: got.Meeting.MeetingId!, name: roomName, status: 'in-progress', raw: got.Meeting };
      }
      return null;
    } catch {
      this.meetings.delete(roomName);
      return null;
    }
  }

  async createRoom(roomName: string): Promise<RoomInfo> {
    const m = await this.ensureMeeting(roomName);
    return { id: m.MeetingId!, name: roomName, status: 'in-progress', raw: m };
  }

  async endRoom(roomName: string): Promise<{ id: string; status: string }> {
    // Idempotente: el cliente puede disparar la desconexión dos veces (colgar +
    // beforeunload), y sin esta guarda se intentaba concatenar y borrar el mismo
    // meeting dos veces (de ahí los ConditionalCheckFailed en DeleteMeeting).
    if (this.isEnded(roomName)) {
      return { id: this.meetings.get(roomName)?.MeetingId || roomName, status: 'completed' };
    }

    const cached = this.meetings.get(roomName);
    if (cached?.MeetingId) {
      // Grabación: detener la captura y arrancar la concatenación → MP4 en S3.
      await chimeRecordingService.stopAndConcatenate(cached.MeetingId);
      try {
        await this.client.send(new DeleteMeetingCommand({ MeetingId: cached.MeetingId }));
      } catch (err: any) {
        console.warn(`[Chime] endRoom: no se pudo borrar el meeting ${cached.MeetingId}: ${err?.message}`);
      }
    }
    this.meetings.delete(roomName);
    this.ended.set(roomName, Date.now());
    return { id: cached?.MeetingId || roomName, status: 'completed' };
  }

  async listParticipants(roomName: string): Promise<ParticipantInfo[]> {
    const cached = this.meetings.get(roomName);
    if (!cached?.MeetingId) return [];
    const res = await this.client.send(new ListAttendeesCommand({ MeetingId: cached.MeetingId }));
    return (res.Attendees || []).map((a) => ({
      id: a.AttendeeId!,
      identity: a.ExternalUserId || '',
    }));
  }

  async disconnectParticipant(roomName: string, participantId: string): Promise<{ id: string; status: string }> {
    const cached = this.meetings.get(roomName);
    if (cached?.MeetingId) {
      await this.client.send(
        new DeleteAttendeeCommand({ MeetingId: cached.MeetingId, AttendeeId: participantId })
      );
    }
    return { id: participantId, status: 'disconnected' };
  }

  async enableRecording(_roomName: string): Promise<boolean> {
    // Grabación server-side se maneja vía startRecording (Media Capture Pipeline).
    return false;
  }

  /**
   * Arranca la captura del meeting (Media Capture Pipeline → S3). Se invoca
   * cuando ambos participantes ya están conectados. Idempotente (el servicio
   * verifica en BD que no exista ya una captura para el meeting).
   */
  async startRecording(roomName: string): Promise<void> {
    const meeting = this.meetings.get(roomName);
    if (meeting) {
      await chimeRecordingService.startCapture(roomName, meeting);
    }
  }
}

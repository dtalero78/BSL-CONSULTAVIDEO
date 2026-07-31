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
  ListAttendeesCommand,
  DeleteAttendeeCommand,
  Meeting,
} from '@aws-sdk/client-chime-sdk-meetings';
import {
  IVideoProvider,
  JoinInfo,
  RoomInfo,
  ParticipantInfo,
} from './types';
import { chimeRecordingService } from './chime-recording.service';
import postgresService from '../postgres.service';

// Región del plano de control de Chime (endpoints regionales limitados).
const CONTROL_REGION = process.env.CHIME_CONTROL_REGION || 'us-east-1';
// Región donde se hospeda el media (puede ser distinta; Chime elige la más cercana).
const MEDIA_REGION = process.env.CHIME_MEDIA_REGION || process.env.AWS_REGION || 'us-east-1';
// Cuánto tiempo se bloquea el reingreso a una sala tras finalizarla.
const ENDED_TTL_MS = 6 * 60 * 60 * 1000; // 6h
// Etiqueta de asignación de costos. BSL y BODYTECH comparten la cuenta AWS; sin
// esto el gasto de Chime (reuniones + grabación) no se puede separar por app.
// BODYTECH debe poner COST_APP_TAG=bodytech. Requiere activar la etiqueta 'app'
// en Billing → Cost allocation tags (aparece ~24h tras el primer recurso etiquetado).
const APP_TAG = process.env.COST_APP_TAG || 'bsl';

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
  private tableReady: Promise<void> | null = null;

  private isEnded(roomName: string): boolean {
    const t = this.ended.get(roomName);
    if (!t) return false;
    if (Date.now() - t > ENDED_TTL_MS) {
      this.ended.delete(roomName);
      return false;
    }
    return true;
  }

  /** Devuelve el meeting si sigue vivo en Chime; null si ya no existe. */
  private async fetchMeeting(meetingId: string): Promise<Meeting | null> {
    try {
      const got = await this.client.send(new GetMeetingCommand({ MeetingId: meetingId }));
      return got.Meeting || null;
    } catch {
      return null;
    }
  }

  /**
   * El mapa sala → meeting se guarda TAMBIÉN en Postgres. Si vive sólo en
   * memoria, cada reinicio de la tarea (un despliegue, un crash) lo borra y el
   * siguiente en entrar crea una reunión NUEVA para la misma sala: el médico
   * queda en una y el paciente en otra, se ven "solos" y hay que volver a
   * entrar. Los fallos de BD no rompen el video: se degrada a sólo memoria.
   */
  private async ensureMeetingsTable(): Promise<void> {
    if (!this.tableReady) {
      this.tableReady = postgresService
        .query(
          `CREATE TABLE IF NOT EXISTS chime_meetings (
             room_name  TEXT PRIMARY KEY,
             meeting_id TEXT NOT NULL,
             created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
           )`
        )
        .then(() => undefined)
        .catch((err: any) => {
          this.tableReady = null;
          throw err;
        });
    }
    return this.tableReady;
  }

  private async recallMeetingId(roomName: string): Promise<string | null> {
    try {
      await this.ensureMeetingsTable();
      const r = await postgresService.query(
        `SELECT meeting_id FROM chime_meetings WHERE room_name = $1 LIMIT 1`,
        [roomName]
      );
      return r?.[0]?.meeting_id || null;
    } catch (err: any) {
      console.warn(`[Chime] no se pudo leer chime_meetings: ${err?.message}`);
      return null;
    }
  }

  private async rememberMeetingId(roomName: string, meetingId: string): Promise<void> {
    try {
      await this.ensureMeetingsTable();
      await postgresService.query(
        `INSERT INTO chime_meetings (room_name, meeting_id) VALUES ($1, $2)
         ON CONFLICT (room_name) DO UPDATE SET meeting_id = EXCLUDED.meeting_id, created_at = NOW()`,
        [roomName, meetingId]
      );
    } catch (err: any) {
      console.warn(`[Chime] no se pudo guardar chime_meetings: ${err?.message}`);
    }
  }

  private async forgetMeetingId(roomName: string): Promise<void> {
    try {
      await postgresService.query(`DELETE FROM chime_meetings WHERE room_name = $1`, [roomName]);
    } catch {
      /* no crítico */
    }
  }

  /** Reutiliza el meeting vigente para la sala, o crea uno nuevo. */
  private async ensureMeeting(roomName: string): Promise<Meeting> {
    const cached = this.meetings.get(roomName);
    if (cached?.MeetingId) {
      const live = await this.fetchMeeting(cached.MeetingId);
      if (live) return live;
      this.meetings.delete(roomName);
    }

    // Sobrevive a reinicios: puede haber gente ya conectada a esta reunión.
    const persistedId = await this.recallMeetingId(roomName);
    if (persistedId) {
      const live = await this.fetchMeeting(persistedId);
      if (live) {
        this.meetings.set(roomName, live);
        console.log(`[Chime] Sala ${roomName} reanudada desde BD: meeting ${persistedId}`);
        return live;
      }
      await this.forgetMeetingId(roomName);
    }

    const created = await this.client.send(
      new CreateMeetingCommand({
        ClientRequestToken: crypto.randomUUID(),
        MediaRegion: MEDIA_REGION,
        ExternalMeetingId: roomName.slice(0, 64),
        Tags: [{ Key: 'app', Value: APP_TAG }],
      })
    );
    if (!created.Meeting) throw new Error('Chime CreateMeeting no devolvió Meeting');
    this.meetings.set(roomName, created.Meeting);
    await this.rememberMeetingId(roomName, created.Meeting.MeetingId!);
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
    // CUALQUIERA que entre REABRE la sala; no se bloquea el reingreso.
    //
    // Bloquearlo (RoomCompletedError → "esta videollamada ya finalizó") causó un
    // incidente masivo: el médico abre la sala y a los pocos segundos sale
    // (recarga, cierra la pestaña, o el propio handleLeave al desmontar la
    // página), lo que llama al endpoint de "colgar" y marcaba la sala como
    // finalizada. El paciente —que SÍ tiene su link de WhatsApp— quedaba fuera.
    // Dejar afuera a un paciente legítimo es mucho peor que permitir reentrar a
    // una sala que de verdad terminó (que a lo sumo es una sala vacía esperando).
    if (this.ended.delete(roomName)) {
      console.log(`[Chime] Sala ${roomName} reabierta al reingresar (${identity}, ${role || 'sin rol'})`);
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

  /**
   * Cierra la GRABACIÓN de la sala, pero NO borra el meeting de Chime ni el
   * registro en BD.
   *
   * Antes se borraba el meeting (DeleteMeeting) y se olvidaba el registro en
   * cada desconexión/recarga del médico. Eso PARTÍA la sala: el siguiente en
   * entrar —o el propio médico al volver— ya no encontraba el meeting y creaba
   * uno NUEVO, mientras el otro seguía en el viejo → "los dos en sala pero no se
   * ven" (se vieron 2 meetings para la misma sala en los logs). Borrar el
   * meeting anulaba justo la persistencia que evita el split.
   *
   * Ahora NO se toca el meeting: Chime termina solo las reuniones que quedan sin
   * asistentes, y si eso ocurre `ensureMeeting` recrea y actualiza la BD, así
   * ambos convergen por el registro persistido. Aquí sólo se cierra la grabación
   * (con su claim atómico, una sola concatenación aunque se llame varias veces).
   */
  async endRoom(roomName: string, _opts?: { completed?: boolean }): Promise<{ id: string; status: string }> {
    let meetingId = this.meetings.get(roomName)?.MeetingId || null;
    if (!meetingId) meetingId = await this.recallMeetingId(roomName);
    if (!meetingId) meetingId = await chimeRecordingService.getCapturingMeetingId(roomName);

    if (meetingId) {
      // Detener la captura y arrancar la concatenación → MP4 en S3. NO se borra
      // el meeting: dejarlo vivo es lo que evita que la sala se parta en dos.
      await chimeRecordingService.stopAndConcatenate(meetingId);
    }

    return { id: meetingId || roomName, status: 'disconnected' };
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

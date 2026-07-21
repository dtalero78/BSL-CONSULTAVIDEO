/**
 * Abstracción de proveedor de video.
 *
 * Permite conmutar entre Twilio Video y Amazon Chime SDK sin tocar los
 * controladores ni el session-tracker. Se selecciona con la variable de entorno
 * VIDEO_PROVIDER (default: "twilio", para que DigitalOcean siga igual).
 */

export type VideoProviderName = 'twilio' | 'chime';

/** Info normalizada de una sala/meeting. */
export interface RoomInfo {
  /** SID (Twilio) o MeetingId (Chime). */
  id: string;
  /** Nombre lógico de la sala (roomName). */
  name: string;
  /** 'in-progress' | 'completed' | ... */
  status: string;
  /** Objeto crudo del proveedor (por si se necesita). */
  raw?: unknown;
}

/**
 * Credenciales de ingreso que el frontend usa para conectarse.
 * El campo `provider` le dice al frontend qué SDK usar.
 */
export interface JoinInfo {
  provider: VideoProviderName;
  identity: string;
  roomName: string;
  /** Twilio: Access Token JWT. */
  token?: string;
  /** Chime: objeto Meeting de CreateMeeting. */
  meeting?: unknown;
  /** Chime: objeto Attendee de CreateAttendee (incluye JoinToken). */
  attendee?: unknown;
}

export interface ParticipantInfo {
  /** SID (Twilio) o AttendeeId (Chime). */
  id: string;
  identity: string;
  status?: string;
  startTime?: Date | null;
  duration?: number | null;
}

/** Se lanza cuando la sala ya fue finalizada y no admite reingreso → HTTP 403. */
export class RoomCompletedError extends Error {
  readonly code = 'ROOM_COMPLETED' as const;
  constructor(message = 'Room has been completed') {
    super(message);
    this.name = 'RoomCompletedError';
  }
}

export interface IVideoProvider {
  readonly name: VideoProviderName;

  /**
   * Asegura que la sala exista y devuelve las credenciales de ingreso del
   * participante. Lanza RoomCompletedError si la sala ya finalizó.
   *
   * `role` decide el reingreso a una sala finalizada: el médico SIEMPRE puede
   * volver a entrar (y al hacerlo reabre la sala, p. ej. tras recargar o
   * perder la conexión); el paciente queda bloqueado.
   */
  join(opts: { identity: string; roomName: string; role?: 'doctor' | 'patient' }): Promise<JoinInfo>;

  /** Devuelve info de la sala, o null si no existe. */
  getRoom(roomName: string): Promise<RoomInfo | null>;

  /** Crea explícitamente una sala. */
  createRoom(roomName: string): Promise<RoomInfo>;

  /**
   * Cierra la sala y su grabación. Con `completed: false` NO se marca como
   * finalizada, de modo que se pueda volver a entrar con el mismo link: es el
   * caso de una desconexión cualquiera del médico, frente a colgar a propósito.
   */
  endRoom(roomName: string, opts?: { completed?: boolean }): Promise<{ id: string; status: string }>;

  /** Lista participantes. */
  listParticipants(roomName: string): Promise<ParticipantInfo[]>;

  /** Desconecta un participante. */
  disconnectParticipant(roomName: string, participantId: string): Promise<{ id: string; status: string }>;

  /** Activa grabación (no-op donde no esté soportada). Devuelve si quedó activada. */
  enableRecording(roomName: string): Promise<boolean>;

  /**
   * Arranca la grabación de la llamada (Chime: Media Capture Pipeline).
   * Se invoca cuando ambos participantes ya están conectados, para no interferir
   * con el establecimiento del video. No-op donde no aplique (Twilio).
   */
  startRecording(roomName: string): Promise<void>;
}

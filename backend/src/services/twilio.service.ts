import twilio from 'twilio';
import twilioConfig from '../config/twilio.config';

const AccessToken = twilio.jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;

interface TokenOptions {
  identity: string;
  roomName: string;
}

interface TokenResponse {
  token: string;
  identity: string;
  roomName: string;
}

class TwilioService {
  private client: twilio.Twilio;

  constructor() {
    this.client = twilio(
      twilioConfig.accountSid,
      twilioConfig.authToken
    );
  }

  /**
   * Genera un Access Token para Twilio Video
   * @param identity - Identificador único del usuario
   * @param roomName - Nombre de la sala de video
   * @returns Token de acceso para conectarse a la sala
   */
  generateVideoToken({ identity, roomName }: TokenOptions): TokenResponse {
    // Crear Access Token
    const token = new AccessToken(
      twilioConfig.accountSid,
      twilioConfig.apiKeySid,
      twilioConfig.apiKeySecret,
      {
        identity,
        ttl: 3600, // Token válido por 1 hora
      }
    );

    // Crear Video Grant
    const videoGrant = new VideoGrant({
      room: roomName,
    });

    // Agregar el grant al token
    token.addGrant(videoGrant);

    return {
      token: token.toJwt(),
      identity,
      roomName,
    };
  }

  /**
   * Crear una sala de video en Twilio
   * @param roomName - Nombre único de la sala
   * @param type - Tipo de sala (group, peer-to-peer, group-small)
   * @returns Información de la sala creada
   */
  async createRoom(
    roomName: string,
    _type?: string,
    maxParticipants: number = 2
  ) {
    try {
      const room = await this.client.video.v1.rooms.create({
        uniqueName: roomName,
        type: 'group',
        maxParticipants,
      });

      return {
        sid: room.sid,
        uniqueName: room.uniqueName,
        status: room.status,
        type: room.type,
        maxParticipants: room.maxParticipants,
        dateCreated: room.dateCreated,
      };
    } catch (error) {
      console.error('Error creating room:', error);
      throw error;
    }
  }

  /**
   * Obtener información de una sala existente
   * @param roomSidOrUniqueName - SID o nombre único de la sala
   */
  async getRoom(roomSidOrUniqueName: string) {
    try {
      const room = await this.client.video.v1.rooms(roomSidOrUniqueName).fetch();

      return {
        sid: room.sid,
        uniqueName: room.uniqueName,
        status: room.status,
        type: room.type,
        maxParticipants: room.maxParticipants,
        duration: room.duration,
        dateCreated: room.dateCreated,
      };
    } catch (error) {
      console.error('Error fetching room:', error);
      throw error;
    }
  }

  /**
   * Finalizar una sala de video
   * @param roomSidOrUniqueName - SID o nombre único de la sala
   */
  async endRoom(roomSidOrUniqueName: string, createComposition: boolean = false) {
    try {
      const room = await this.client.video.v1
        .rooms(roomSidOrUniqueName)
        .update({ status: 'completed' });

      let compositionSid: string | undefined;

      // Solo crear composición si la grabación estaba activada
      if (createComposition) {
        try {
          const comp = await this.createComposition(room.sid);
          compositionSid = comp.sid;
          console.log(`[Twilio] Composition created: ${comp.sid} for room ${room.sid}`);
        } catch (err: any) {
          console.error(`[Twilio] Error creating composition for room ${room.sid}:`, err.message);
        }
      }

      return {
        sid: room.sid,
        status: room.status,
        compositionSid,
      };
    } catch (error) {
      console.error('Error ending room:', error);
      throw error;
    }
  }

  /**
   * Activar grabación en una sala existente usando Recording Rules
   */
  async enableRecording(roomSid: string) {
    try {
      await this.client.video.v1.rooms(roomSid)
        .recordingRules.update({
          rules: [{ type: 'include', all: true }],
        });
      console.log(`[Twilio] Recording enabled for room ${roomSid}`);
    } catch (error) {
      console.error('Error enabling recording:', error);
      throw error;
    }
  }

  /**
   * Crear composición combinada de todos los tracks de una sala
   * Genera un solo archivo MP4 con audio y video de todos los participantes
   */
  async createComposition(roomSid: string) {
    try {
      const composition = await this.client.video.v1.compositions.create({
        roomSid,
        audioSources: ['*'],
        videoLayout: {
          grid: {
            video_sources: ['*'],
          },
        },
        format: 'mp4',
        resolution: '640x480',
      });

      return {
        sid: composition.sid,
        status: composition.status,
        roomSid: composition.roomSid,
      };
    } catch (error) {
      console.error('Error creating composition:', error);
      throw error;
    }
  }

  /**
   * Listar participantes de una sala
   * @param roomSidOrUniqueName - SID o nombre único de la sala
   */
  async listParticipants(roomSidOrUniqueName: string) {
    try {
      const participants = await this.client.video.v1
        .rooms(roomSidOrUniqueName)
        .participants.list();

      return participants.map((participant) => ({
        sid: participant.sid,
        identity: participant.identity,
        status: participant.status,
        startTime: participant.startTime,
        duration: participant.duration,
      }));
    } catch (error) {
      console.error('Error listing participants:', error);
      throw error;
    }
  }

  /**
   * Desconectar un participante de una sala
   * @param roomSidOrUniqueName - SID o nombre único de la sala
   * @param participantSid - SID del participante
   */
  async disconnectParticipant(
    roomSidOrUniqueName: string,
    participantSid: string
  ) {
    try {
      const participant = await this.client.video.v1
        .rooms(roomSidOrUniqueName)
        .participants(participantSid)
        .update({ status: 'disconnected' });

      return {
        sid: participant.sid,
        status: participant.status,
      };
    } catch (error) {
      console.error('Error disconnecting participant:', error);
      throw error;
    }
  }
}

export default new TwilioService();

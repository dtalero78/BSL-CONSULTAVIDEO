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
    type: 'group' | 'peer-to-peer' | 'group-small' = 'group'
  ) {
    try {
      const room = await this.client.video.v1.rooms.create({
        uniqueName: roomName,
        type,
        maxParticipants: type === 'peer-to-peer' ? 2 : 50,
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
  async endRoom(roomSidOrUniqueName: string) {
    try {
      const room = await this.client.video.v1
        .rooms(roomSidOrUniqueName)
        .update({ status: 'completed' });

      return {
        sid: room.sid,
        status: room.status,
      };
    } catch (error) {
      console.error('Error ending room:', error);
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

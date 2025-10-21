import axios, { AxiosInstance } from 'axios';

// En producción (Digital Ocean), el frontend se sirve desde el mismo backend
// entonces usamos URL relativa (vacía). En desarrollo, apuntamos a localhost:3000
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Obtener token de acceso para Twilio Video
   */
  async getVideoToken(identity: string, roomName: string): Promise<string> {
    const response = await this.client.post('/api/video/token', {
      identity,
      roomName,
    });

    return response.data.data.token;
  }

  /**
   * Crear una sala de video
   */
  async createRoom(roomName: string, type?: 'group' | 'peer-to-peer' | 'group-small') {
    const response = await this.client.post('/api/video/rooms', {
      roomName,
      type,
    });

    return response.data.data;
  }

  /**
   * Obtener información de una sala
   */
  async getRoom(roomName: string) {
    const response = await this.client.get(`/api/video/rooms/${roomName}`);
    return response.data.data;
  }

  /**
   * Finalizar una sala
   */
  async endRoom(roomName: string) {
    const response = await this.client.post(`/api/video/rooms/${roomName}/end`);
    return response.data.data;
  }

  /**
   * Listar participantes
   */
  async listParticipants(roomName: string) {
    const response = await this.client.get(`/api/video/rooms/${roomName}/participants`);
    return response.data.data;
  }
}

export default new ApiService();

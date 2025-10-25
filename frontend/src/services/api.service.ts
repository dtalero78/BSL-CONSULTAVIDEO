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

  /**
   * Registrar que un participante se conectó (para reportes)
   */
  async trackParticipantConnected(
    roomName: string,
    identity: string,
    role: 'doctor' | 'patient'
  ): Promise<void> {
    await this.client.post('/api/video/events/participant-connected', {
      roomName,
      identity,
      role,
    });
  }

  /**
   * Registrar que un participante se desconectó (para reportes)
   */
  async trackParticipantDisconnected(roomName: string, identity: string): Promise<void> {
    await this.client.post('/api/video/events/participant-disconnected', {
      roomName,
      identity,
    });
  }

  /**
   * Enviar mensaje de WhatsApp
   */
  async sendWhatsApp(phone: string, message: string): Promise<void> {
    await this.client.post('/api/video/whatsapp/send', {
      phone,
      message,
    });
  }

  /**
   * Obtener historia clínica de un paciente
   */
  async getMedicalHistory(historiaId: string): Promise<any> {
    const response = await this.client.get(`/api/video/medical-history/${historiaId}`);
    return response.data.data;
  }

  /**
   * Actualizar historia clínica de un paciente
   */
  async updateMedicalHistory(payload: {
    historiaId: string;
    mdAntecedentes?: string;
    mdObsParaMiDocYa?: string;
    mdObservacionesCertificado?: string;
    mdRecomendacionesMedicasAdicionales?: string;
    mdConceptoFinal?: string;
    mdDx1?: string;
    mdDx2?: string;
    talla?: string;
    peso?: string;
    cargo?: string;
  }): Promise<void> {
    await this.client.post('/api/video/medical-history', payload);
  }

  /**
   * Generar sugerencias médicas con IA
   */
  async generateAISuggestions(patientData: any): Promise<string> {
    const response = await this.client.post('/api/video/ai-suggestions', {
      patientData,
    });
    return response.data.data.suggestions;
  }
}

export default new ApiService();

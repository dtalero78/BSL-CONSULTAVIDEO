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
    role: 'doctor' | 'patient',
    documento?: string,
    medicoCode?: string
  ): Promise<void> {
    await this.client.post('/api/video/events/participant-connected', {
      roomName,
      identity,
      role,
      documento,
      medicoCode,
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
   * Obtener lista de pacientes actualmente conectados
   * @param medicoCode - Opcional: filtrar solo pacientes de este médico
   */
  async getConnectedPatients(medicoCode?: string): Promise<Array<{ documento: string; roomName: string; identity: string; connectedAt: string }>> {
    const url = medicoCode
      ? `/api/video/events/connected-patients?medicoCode=${encodeURIComponent(medicoCode)}`
      : '/api/video/events/connected-patients';
    const response = await this.client.get(url);
    return response.data.data;
  }

  /**
   * Enviar mensaje de WhatsApp con template aprobado de Twilio
   * Template: "Hola soy el Dr. Juan de BSL. Tienes cita médica programada conmigo.
   * Por favor responde "SÍ" para iniciar el proceso."
   */
  async sendWhatsApp(phone: string): Promise<void> {
    await this.client.post('/api/video/whatsapp/send', {
      phone,
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

  /**
   * Realizar llamada telefónica con Twilio Voice
   */
  async makeVoiceCall(phoneNumber: string, patientName?: string): Promise<void> {
    await this.client.post('/api/twilio/voice-call', {
      phoneNumber,
      patientName,
    });
  }
}

export default new ApiService();

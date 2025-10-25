import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export interface PatientStats {
  programadosHoy: number;
  atendidosHoy: number;
  restantesHoy: number;
}

export interface Patient {
  _id: string;
  nombres: string;
  primerNombre: string;
  primerApellido: string;
  numeroId: string;
  estado: string;
  foto: string;
  celular: string;
  fechaAtencion: Date;
  empresaListado: string;
  pvEstado?: string;
}

export interface PaginatedPatients {
  patients: Patient[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
}

export interface PatientDetails extends Patient {
  segundoNombre?: string;
  segundoApellido?: string;
  email?: string;
  direccion?: string;
  ciudad?: string;
  fechaNacimiento?: Date;
  genero?: string;
  tipoConsulta?: string;
  motivoConsulta?: string;
  fechaConsulta?: Date;
}

class MedicalPanelService {
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
   * Obtiene estadísticas del día para un médico
   */
  async getDailyStats(medicoCode: string): Promise<PatientStats> {
    const response = await this.client.get<PatientStats>(
      `/api/medical-panel/stats/${medicoCode}`
    );
    return response.data;
  }

  /**
   * Obtiene lista paginada de pacientes pendientes
   */
  async getPendingPatients(
    medicoCode: string,
    page: number = 0,
    pageSize: number = 10
  ): Promise<PaginatedPatients> {
    const response = await this.client.get<PaginatedPatients>(
      `/api/medical-panel/patients/pending/${medicoCode}`,
      {
        params: { page, pageSize }
      }
    );
    return response.data;
  }

  /**
   * Busca un paciente por documento
   */
  async searchPatientByDocument(
    documento: string,
    medicoCode?: string
  ): Promise<Patient> {
    const response = await this.client.get<Patient>(
      `/api/medical-panel/patients/search/${documento}`,
      {
        params: medicoCode ? { medicoCode } : {}
      }
    );
    return response.data;
  }

  /**
   * Obtiene detalles completos de un paciente
   */
  async getPatientDetails(documento: string): Promise<PatientDetails> {
    const response = await this.client.get<PatientDetails>(
      `/api/medical-panel/patients/details/${documento}`
    );
    return response.data;
  }

  /**
   * Marca un paciente como "No Contesta"
   */
  async markAsNoAnswer(patientId: string): Promise<void> {
    await this.client.patch(`/api/medical-panel/patients/${patientId}/no-answer`);
  }

  /**
   * Genera enlace de WhatsApp con mensaje
   */
  generateWhatsAppLink(phone: string, message: string): string {
    const formattedPhone = this.formatPhoneNumber(phone);
    return `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;
  }

  /**
   * Formatea número telefónico con prefijo internacional
   */
  formatPhoneNumber(phone: string): string {
    // Eliminar espacios y caracteres especiales
    let cleaned = phone.replace(/[\s\(\)\+\-]/g, '');

    // Si ya tiene código de país, retornar con +
    if (cleaned.startsWith('57') && cleaned.length >= 10) {
      return '+' + cleaned;
    }

    // Si es número colombiano de 10 dígitos, agregar +57
    if (cleaned.length === 10 && cleaned.startsWith('3')) {
      return '+57' + cleaned;
    }

    // Otros códigos de país
    const countryCodes = ['1', '52', '54', '55', '34', '44', '49', '33'];
    for (const code of countryCodes) {
      if (cleaned.startsWith(code)) {
        return '+' + cleaned;
      }
    }

    // Por defecto, asumir Colombia
    return '+57' + cleaned;
  }

  /**
   * Genera nombre de sala para videollamada
   */
  generateRoomName(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 7);
    return `consulta-${timestamp}-${random}`;
  }
}

export default new MedicalPanelService();

/**
 * Medical Panel Service
 *
 * Este servicio se conecta a los endpoints HTTP de Wix para obtener datos reales.
 * Los endpoints de Wix están definidos en wix-http-functions.js
 */

import axios, { AxiosInstance } from 'axios';

interface PatientStats {
  programadosHoy: number;
  atendidosHoy: number;
  restantesHoy: number;
}

interface Patient {
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
  segundoNombre?: string;
  segundoApellido?: string;
  medico?: string;
  motivoConsulta?: string;
}

interface PaginatedPatients {
  patients: Patient[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
}

interface PatientDetails extends Patient {
  email?: string;
  direccion?: string;
  ciudad?: string;
  fechaNacimiento?: Date;
  genero?: string;
  tipoConsulta?: string;
  fechaConsulta?: Date;
  diagnostico?: string;
  tratamiento?: string;
}

class MedicalPanelService {
  private wixClient: AxiosInstance;
  private wixBaseUrl: string;

  constructor() {
    this.wixBaseUrl = process.env.WIX_FUNCTIONS_URL || 'https://www.bsl.com.co/_functions';

    this.wixClient = axios.create({
      baseURL: this.wixBaseUrl,
      timeout: 30000, // 30 segundos
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('🔗 Medical Panel Service conectado a Wix:', this.wixBaseUrl);
  }

  /**
   * Obtiene las estadísticas del día para un médico específico
   */
  async getDailyStats(medicoCode: string): Promise<PatientStats> {
    try {
      const response = await this.wixClient.get(`/estadisticasMedico`, {
        params: { medicoCode }
      });

      return response.data;
    } catch (error) {
      console.error('Error obteniendo estadísticas de Wix:', error);

      // Retornar datos por defecto en caso de error
      return {
        programadosHoy: 0,
        atendidosHoy: 0,
        restantesHoy: 0
      };
    }
  }

  /**
   * Obtiene lista paginada de pacientes pendientes del día
   */
  async getPendingPatients(
    medicoCode: string,
    page: number = 0,
    pageSize: number = 10
  ): Promise<PaginatedPatients> {
    try {
      const response = await this.wixClient.get(`/pacientesPendientes`, {
        params: {
          medicoCode,
          page: page.toString(),
          pageSize: pageSize.toString()
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error obteniendo pacientes pendientes de Wix:', error);

      // Retornar estructura vacía en caso de error
      return {
        patients: [],
        currentPage: page,
        totalPages: 0,
        totalItems: 0
      };
    }
  }

  /**
   * Busca un paciente por documento de identidad o celular
   * La búsqueda se realiza en toda la base de datos, sin filtro de médico
   */
  async searchPatientByDocument(
    searchTerm: string,
    medicoCode?: string
  ): Promise<Patient | null> {
    try {
      // Enviar el término de búsqueda como 'searchTerm' para que Wix busque por documento o celular
      const params: any = { searchTerm };

      // NO enviar medicoCode para buscar en toda la base de datos
      // (comentado intencionalmente para buscar en todos los pacientes)
      // if (medicoCode) {
      //   params.medicoCode = medicoCode;
      // }

      const response = await this.wixClient.get(`/buscarPaciente`, { params });

      return response.data.patient || null;
    } catch (error) {
      console.error('Error buscando paciente en Wix:', error);
      return null;
    }
  }

  /**
   * Marca un paciente como "No Contesta"
   */
  async markPatientAsNoAnswer(patientId: string): Promise<boolean> {
    try {
      await this.wixClient.patch(`/marcarNoContesta`, {
        patientId
      });

      return true;
    } catch (error) {
      console.error('Error marcando paciente como No Contesta en Wix:', error);
      return false;
    }
  }

  /**
   * Obtiene detalles completos de un paciente (combina HistoriaClinica + FORMULARIO)
   */
  async getPatientDetails(documento: string): Promise<PatientDetails | null> {
    try {
      const response = await this.wixClient.get(`/detallesPaciente`, {
        params: { documento }
      });

      return response.data.details || null;
    } catch (error) {
      console.error('Error obteniendo detalles del paciente en Wix:', error);
      return null;
    }
  }

  /**
   * Genera un nombre de sala para videollamada (similar a Wix)
   */
  generateRoomName(_medicoCode: string, _patientId: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 7);
    return `consulta-${timestamp}-${random}`;
  }

  /**
   * Formatea número telefónico con prefijo internacional
   */
  formatPhoneNumber(phone: string): string {
    // Eliminar espacios, paréntesis y otros caracteres especiales
    let cleaned = phone.replace(/[\s\(\)\+\-]/g, '');

    // Si ya tiene código de país válido, retornar con +
    if (cleaned.startsWith('57') && cleaned.length >= 10) {
      return '+' + cleaned;
    }

    // Si es número colombiano de 10 dígitos, agregar +57
    if (cleaned.length === 10 && cleaned.startsWith('3')) {
      return '+57' + cleaned;
    }

    // Otros códigos de país reconocidos
    const countryCodes = ['1', '52', '54', '55', '34', '44', '49', '33'];
    for (const code of countryCodes) {
      if (cleaned.startsWith(code)) {
        return '+' + cleaned;
      }
    }

    // Por defecto, asumir Colombia
    return '+57' + cleaned;
  }
}

export default new MedicalPanelService();

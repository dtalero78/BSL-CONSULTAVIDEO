/**
 * Medical Panel Service
 *
 * Este servicio consulta PostgreSQL como base de datos principal.
 * Wix queda como backup secundario.
 */

import postgresService from './postgres.service';

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
  tipoExamen?: string;
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
  constructor() {
    console.log('🔗 Medical Panel Service conectado a PostgreSQL');
  }

  /**
   * Obtiene las estadísticas del día para un médico específico
   */
  async getDailyStats(medicoCode: string): Promise<PatientStats> {
    try {
      // Calcular inicio y fin del día en Colombia (UTC-5)
      const now = new Date();
      const colombiaTime = new Date(now.getTime() - (5 * 60 * 60 * 1000));
      const year = colombiaTime.getUTCFullYear();
      const month = colombiaTime.getUTCMonth();
      const day = colombiaTime.getUTCDate();

      const startOfDay = new Date(Date.UTC(year, month, day, 5, 0, 0, 0)); // 00:00 Colombia = 05:00 UTC
      const endOfDay = new Date(Date.UTC(year, month, day + 1, 4, 59, 59, 999)); // 23:59:59 Colombia

      // Query para programados hoy
      const programadosResult = await postgresService.query(
        `SELECT COUNT(*) as count FROM "HistoriaClinica"
         WHERE "medico" = $1
         AND "fechaAtencion" >= $2
         AND "fechaAtencion" <= $3`,
        [medicoCode, startOfDay, endOfDay]
      );

      // Query para atendidos hoy
      const atendidosResult = await postgresService.query(
        `SELECT COUNT(*) as count FROM "HistoriaClinica"
         WHERE "medico" = $1
         AND "fechaConsulta" >= $2
         AND "fechaConsulta" <= $3`,
        [medicoCode, startOfDay, endOfDay]
      );

      // Query para restantes hoy (programados sin fechaConsulta)
      const restantesResult = await postgresService.query(
        `SELECT COUNT(*) as count FROM "HistoriaClinica"
         WHERE "medico" = $1
         AND "fechaAtencion" >= $2
         AND "fechaAtencion" <= $3
         AND ("fechaConsulta" IS NULL OR "fechaConsulta" = '')`,
        [medicoCode, startOfDay, endOfDay]
      );

      return {
        programadosHoy: parseInt(programadosResult?.[0]?.count || '0'),
        atendidosHoy: parseInt(atendidosResult?.[0]?.count || '0'),
        restantesHoy: parseInt(restantesResult?.[0]?.count || '0')
      };
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas de PostgreSQL:', error);
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
      // Calcular inicio y fin del día en Colombia (UTC-5)
      const now = new Date();
      const colombiaTime = new Date(now.getTime() - (5 * 60 * 60 * 1000));
      const year = colombiaTime.getUTCFullYear();
      const month = colombiaTime.getUTCMonth();
      const day = colombiaTime.getUTCDate();

      const startOfDay = new Date(Date.UTC(year, month, day, 5, 0, 0, 0));
      const endOfDay = new Date(Date.UTC(year, month, day + 1, 4, 59, 59, 999));

      const offset = page * pageSize;

      // Query para obtener pacientes pendientes
      const patientsResult = await postgresService.query(
        `SELECT "_id", "numeroId", "primerNombre", "segundoNombre", "primerApellido", "segundoApellido",
                "celular", "fechaAtencion", "atendido", "pvEstado", "codEmpresa", "empresa",
                "medico", "motivoConsulta", "tipoExamen"
         FROM "HistoriaClinica"
         WHERE "medico" = $1
         AND "fechaAtencion" >= $2
         AND "fechaAtencion" <= $3
         AND ("fechaConsulta" IS NULL)
         AND "numeroId" NOT IN ('TEST', 'test')
         ORDER BY "fechaAtencion" ASC
         LIMIT $4 OFFSET $5`,
        [medicoCode, startOfDay, endOfDay, pageSize, offset]
      );

      // Query para contar total
      const countResult = await postgresService.query(
        `SELECT COUNT(*) as count FROM "HistoriaClinica"
         WHERE "medico" = $1
         AND "fechaAtencion" >= $2
         AND "fechaAtencion" <= $3
         AND ("fechaConsulta" IS NULL)
         AND "numeroId" NOT IN ('TEST', 'test')`,
        [medicoCode, startOfDay, endOfDay]
      );

      const totalItems = parseInt(countResult?.[0]?.count || '0');
      const totalPages = Math.ceil(totalItems / pageSize);

      const patients: Patient[] = (patientsResult || []).map((row: any) => ({
        _id: row._id,
        nombres: `${row.primerNombre || ''} ${row.primerApellido || ''}`.trim(),
        primerNombre: row.primerNombre || '',
        segundoNombre: row.segundoNombre || '',
        primerApellido: row.primerApellido || '',
        segundoApellido: row.segundoApellido || '',
        numeroId: row.numeroId,
        estado: row.atendido || 'Pendiente',
        pvEstado: row.pvEstado || '',
        foto: '', // PostgreSQL no tiene fotos, se pueden agregar después
        celular: row.celular || '',
        fechaAtencion: row.fechaAtencion,
        empresaListado: row.codEmpresa || row.empresa || 'SIN EMPRESA',
        medico: row.medico,
        motivoConsulta: row.motivoConsulta || '',
        tipoExamen: row.tipoExamen || ''
      }));

      return {
        patients,
        currentPage: page,
        totalPages,
        totalItems
      };
    } catch (error) {
      console.error('❌ Error obteniendo pacientes pendientes de PostgreSQL:', error);
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
   */
  async searchPatientByDocument(searchTerm: string): Promise<Patient | null> {
    try {
      // Buscar por numeroId o celular
      const result = await postgresService.query(
        `SELECT "_id", "numeroId", "primerNombre", "segundoNombre", "primerApellido", "segundoApellido",
                "celular", "fechaAtencion", "fechaConsulta", "atendido", "pvEstado", "codEmpresa",
                "empresa", "medico", "motivoConsulta", "tipoExamen"
         FROM "HistoriaClinica"
         WHERE "numeroId" = $1 OR "celular" = $1
         ORDER BY "fechaAtencion" DESC
         LIMIT 1`,
        [searchTerm]
      );

      if (!result || result.length === 0) {
        return null;
      }

      const row = result[0];
      return {
        _id: row._id,
        nombres: `${row.primerNombre || ''} ${row.primerApellido || ''}`.trim(),
        primerNombre: row.primerNombre || '',
        segundoNombre: row.segundoNombre || '',
        primerApellido: row.primerApellido || '',
        segundoApellido: row.segundoApellido || '',
        numeroId: row.numeroId,
        estado: row.atendido || 'Pendiente',
        pvEstado: row.pvEstado || '',
        foto: '',
        celular: row.celular || '',
        fechaAtencion: row.fechaAtencion,
        empresaListado: row.codEmpresa || row.empresa || 'SIN EMPRESA',
        medico: row.medico,
        motivoConsulta: row.motivoConsulta || '',
        tipoExamen: row.tipoExamen || ''
      };
    } catch (error) {
      console.error('❌ Error buscando paciente en PostgreSQL:', error);
      return null;
    }
  }

  /**
   * Marca un paciente como "No Contesta"
   */
  async markPatientAsNoAnswer(patientId: string): Promise<boolean> {
    try {
      const result = await postgresService.query(
        `UPDATE "HistoriaClinica"
         SET "pvEstado" = 'No Contesta', "medico" = 'RESERVA'
         WHERE "_id" = $1
         RETURNING "_id"`,
        [patientId]
      );

      return result !== null && result.length > 0;
    } catch (error) {
      console.error('❌ Error marcando paciente como No Contesta en PostgreSQL:', error);
      return false;
    }
  }

  /**
   * Obtiene detalles completos de un paciente
   */
  async getPatientDetails(documento: string): Promise<PatientDetails | null> {
    try {
      const result = await postgresService.query(
        `SELECT * FROM "HistoriaClinica"
         WHERE "numeroId" = $1
         ORDER BY "fechaAtencion" DESC
         LIMIT 1`,
        [documento]
      );

      if (!result || result.length === 0) {
        return null;
      }

      const row = result[0];
      return {
        _id: row._id,
        nombres: `${row.primerNombre || ''} ${row.primerApellido || ''}`.trim(),
        primerNombre: row.primerNombre || '',
        segundoNombre: row.segundoNombre || '',
        primerApellido: row.primerApellido || '',
        segundoApellido: row.segundoApellido || '',
        numeroId: row.numeroId,
        estado: row.atendido || 'Pendiente',
        pvEstado: row.pvEstado || '',
        foto: '',
        celular: row.celular || '',
        fechaAtencion: row.fechaAtencion,
        fechaConsulta: row.fechaConsulta,
        empresaListado: row.codEmpresa || row.empresa || 'SIN EMPRESA',
        medico: row.medico,
        motivoConsulta: row.motivoConsulta || '',
        tipoExamen: row.tipoExamen || '',
        email: row.email || '',
        ciudad: row.ciudad || '',
        diagnostico: row.diagnostico || '',
        tratamiento: row.tratamiento || ''
      };
    } catch (error) {
      console.error('❌ Error obteniendo detalles del paciente en PostgreSQL:', error);
      return null;
    }
  }

  /**
   * Genera un nombre de sala para videollamada
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
    let cleaned = phone.replace(/[\s\(\)\+\-]/g, '');

    if (cleaned.startsWith('57') && cleaned.length >= 10) {
      return '+' + cleaned;
    }

    if (cleaned.length === 10 && cleaned.startsWith('3')) {
      return '+57' + cleaned;
    }

    const countryCodes = ['1', '52', '54', '55', '34', '44', '49', '33'];
    for (const code of countryCodes) {
      if (cleaned.startsWith(code)) {
        return '+' + cleaned;
      }
    }

    return '+57' + cleaned;
  }
}

export default new MedicalPanelService();
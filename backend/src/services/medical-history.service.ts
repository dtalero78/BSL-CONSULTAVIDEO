import axios from 'axios';
import historiaClinicaPostgresService from './historia-clinica-postgres.service';
import postgresService from './postgres.service';

interface MedicalHistoryData {
  // Datos del paciente
  _id?: string;
  numeroId: string;
  primerNombre: string;
  segundoNombre?: string;
  primerApellido: string;
  segundoApellido?: string;
  celular: string;
  email?: string;
  fechaNacimiento?: Date;
  edad?: number;
  genero?: string;
  estadoCivil?: string;
  hijos?: string;
  ejercicio?: string;

  // Datos de la empresa
  codEmpresa?: string;
  cargo?: string;
  tipoExamen?: string;

  // Encuesta de salud
  encuestaSalud?: string;
  antecedentesFamiliares?: string;
  empresa1?: string;

  // Campos médicos editables
  mdAntecedentes?: string;
  mdObsParaMiDocYa?: string;
  mdObservacionesCertificado?: string;
  mdRecomendacionesMedicasAdicionales?: string;
  mdConceptoFinal?: string;
  mdDx1?: string;
  mdDx2?: string;
  talla?: string;
  peso?: string;

  // Fechas y estado
  fechaAtencion?: Date;
  fechaConsulta?: Date;
  atendido?: string;
  medico?: string;
}

interface UpdateMedicalHistoryPayload {
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
}

class MedicalHistoryService {
  private wixBaseUrl: string;

  constructor() {
    this.wixBaseUrl = process.env.WIX_FUNCTIONS_URL || 'https://www.bsl.com.co/_functions';
  }

  /**
   * Obtiene la historia clínica de un paciente desde PostgreSQL (principal)
   * Si no existe en PostgreSQL, intenta obtener de Wix como fallback
   */
  async getMedicalHistory(historiaId: string): Promise<MedicalHistoryData | null> {
    try {
      console.log(`📋 Obteniendo historia clínica para ID: ${historiaId}`);

      // PASO 1: Intentar obtener de PostgreSQL (fuente principal)
      const pgResult = await postgresService.query(
        `SELECT * FROM "HistoriaClinica" WHERE "_id" = $1`,
        [historiaId]
      );

      if (pgResult && pgResult.length > 0) {
        const row = pgResult[0];
        console.log(`✅ [PostgreSQL] Historia clínica encontrada para ${historiaId}`);
        return {
          _id: row._id,
          numeroId: row.numeroId,
          primerNombre: row.primerNombre,
          segundoNombre: row.segundoNombre,
          primerApellido: row.primerApellido,
          segundoApellido: row.segundoApellido,
          celular: row.celular,
          email: row.email,
          codEmpresa: row.codEmpresa,
          cargo: row.cargo,
          tipoExamen: row.tipoExamen,
          mdAntecedentes: row.mdAntecedentes,
          mdObsParaMiDocYa: row.mdObsParaMiDocYa,
          mdObservacionesCertificado: row.mdObservacionesCertificado,
          mdRecomendacionesMedicasAdicionales: row.mdRecomendacionesMedicasAdicionales,
          mdConceptoFinal: row.mdConceptoFinal,
          mdDx1: row.mdDx1,
          mdDx2: row.mdDx2,
          talla: row.talla,
          peso: row.peso,
          fechaAtencion: row.fechaAtencion,
          fechaConsulta: row.fechaConsulta,
          atendido: row.atendido,
          medico: row.medico,
        } as MedicalHistoryData;
      }

      // PASO 2: Fallback a Wix si no está en PostgreSQL
      console.log(`⚠️  [PostgreSQL] No encontrado, intentando Wix para ${historiaId}`);
      const response = await axios.get(`${this.wixBaseUrl}/getHistoriaClinica`, {
        params: { historiaId: historiaId },
      });

      if (response.data && response.data.success && response.data.data) {
        console.log(`✅ [Wix] Historia clínica encontrada para ${historiaId}`);
        return response.data.data as MedicalHistoryData;
      }

      console.warn(`⚠️  No se encontró historia clínica para ${historiaId}`);
      return null;
    } catch (error: any) {
      console.error('❌ Error obteniendo historia clínica:', error.message);
      throw new Error('Error al obtener historia clínica del paciente');
    }
  }

  /**
   * Actualiza la historia clínica: PostgreSQL primero (principal), luego Wix (backup)
   */
  async updateMedicalHistory(payload: UpdateMedicalHistoryPayload): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`💾 Actualizando historia clínica para ID: ${payload.historiaId}`);

      // PASO 0: Obtener datos base del paciente
      const historiaBase = await this.getMedicalHistory(payload.historiaId);

      if (!historiaBase) {
        return { success: false, error: 'No se encontró historia clínica' };
      }

      // PASO 1: Guardar en PostgreSQL PRIMERO (fuente principal - OBLIGATORIO)
      console.log(`💾 [PostgreSQL] Guardando historia clínica ${payload.historiaId}...`);

      const pgSuccess = await historiaClinicaPostgresService.upsert({
        _id: payload.historiaId,
        // Datos base del paciente (no cambian)
        numeroId: historiaBase.numeroId,
        primerNombre: historiaBase.primerNombre,
        segundoNombre: historiaBase.segundoNombre,
        primerApellido: historiaBase.primerApellido,
        segundoApellido: historiaBase.segundoApellido,
        celular: historiaBase.celular,
        email: historiaBase.email,
        codEmpresa: historiaBase.codEmpresa,
        tipoExamen: historiaBase.tipoExamen,
        fechaAtencion: historiaBase.fechaAtencion,
        medico: historiaBase.medico,

        // Datos médicos ingresados por el doctor (del payload)
        mdAntecedentes: payload.mdAntecedentes,
        mdObsParaMiDocYa: payload.mdObsParaMiDocYa,
        mdObservacionesCertificado: payload.mdObservacionesCertificado,
        mdRecomendacionesMedicasAdicionales: payload.mdRecomendacionesMedicasAdicionales,
        mdConceptoFinal: payload.mdConceptoFinal,
        mdDx1: payload.mdDx1,
        mdDx2: payload.mdDx2,
        talla: payload.talla,
        peso: payload.peso,
        cargo: payload.cargo,

        // Campos de estado
        fechaConsulta: new Date(),
        atendido: 'ATENDIDO',
      });

      if (!pgSuccess) {
        console.error(`❌ [PostgreSQL] Error guardando historia clínica ${payload.historiaId}`);
        return { success: false, error: 'Error guardando en PostgreSQL' };
      }

      console.log(`✅ [PostgreSQL] Historia clínica guardada exitosamente para ${payload.historiaId}`);

      // PASO 2: Guardar en Wix como BACKUP (obligatorio pero no bloquea si falla)
      console.log(`💾 [Wix] Guardando backup de historia clínica ${payload.historiaId}...`);

      try {
        const response = await axios.post(`${this.wixBaseUrl}/updateHistoriaClinica`, {
          historiaId: payload.historiaId,
          mdAntecedentes: payload.mdAntecedentes,
          mdObsParaMiDocYa: payload.mdObsParaMiDocYa,
          mdObservacionesCertificado: payload.mdObservacionesCertificado,
          mdRecomendacionesMedicasAdicionales: payload.mdRecomendacionesMedicasAdicionales,
          mdConceptoFinal: payload.mdConceptoFinal,
          mdDx1: payload.mdDx1,
          mdDx2: payload.mdDx2,
          talla: payload.talla,
          peso: payload.peso,
          cargo: payload.cargo,
          atendido: 'ATENDIDO',
        });

        if (response.data && response.data.success) {
          console.log(`✅ [Wix] Backup guardado exitosamente para ${payload.historiaId}`);
        } else {
          console.warn(`⚠️  [Wix] Respuesta inesperada al guardar backup: ${JSON.stringify(response.data)}`);
        }
      } catch (wixError: any) {
        // Log error pero no fallar - PostgreSQL ya tiene los datos
        console.error(`⚠️  [Wix] Error guardando backup (no crítico): ${wixError.message}`);
      }

      return { success: true };
    } catch (error: any) {
      console.error('❌ Error actualizando historia clínica:', error.message);
      return {
        success: false,
        error: error.message || 'Error al actualizar historia clínica'
      };
    }
  }
}

export default new MedicalHistoryService();

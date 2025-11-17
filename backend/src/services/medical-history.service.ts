import axios from 'axios';
import historiaClinicaPostgresService from './historia-clinica-postgres.service';

interface MedicalHistoryData {
  // Datos del paciente
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
   * Obtiene la historia clínica de un paciente desde Wix por _id
   */
  async getMedicalHistory(historiaId: string): Promise<MedicalHistoryData | null> {
    try {
      console.log(`📋 Obteniendo historia clínica para ID: ${historiaId}`);

      const response = await axios.get(`${this.wixBaseUrl}/getHistoriaClinica`, {
        params: { historiaId: historiaId },
      });

      if (response.data && response.data.success && response.data.data) {
        console.log(`✅ Historia clínica encontrada para ${historiaId}`);
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
   * Actualiza la historia clínica de un paciente en Wix Y PostgreSQL por _id
   */
  async updateMedicalHistory(payload: UpdateMedicalHistoryPayload): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`💾 Actualizando historia clínica para ID: ${payload.historiaId}`);

      // PASO 0: Obtener datos base del paciente ANTES de actualizar (para PostgreSQL)
      const historiaBase = await this.getMedicalHistory(payload.historiaId);

      if (!historiaBase) {
        return { success: false, error: 'No se encontró historia clínica' };
      }

      // PASO 1: Actualizar en Wix (fuente principal)
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
        // NO enviamos fechaConsulta - Wix copiará _updatedDate después del update
        atendido: 'ATENDIDO',
      });

      if (!response.data || !response.data.success) {
        console.warn(`⚠️  Respuesta inesperada al actualizar historia clínica: ${JSON.stringify(response.data)}`);
        return { success: false, error: 'Respuesta inesperada del servidor' };
      }

      console.log(`✅ [Wix] Historia clínica actualizada exitosamente para ${payload.historiaId}`);

      // PASO 2: Guardar en PostgreSQL INDEPENDIENTEMENTE de Wix
      // PostgreSQL guarda los datos que el médico ingresó + fechaConsulta = NOW()
      historiaClinicaPostgresService.upsert({
        _id: payload.historiaId,
        // Datos base del paciente (no cambian)
        numeroId: historiaBase.numeroId,
        primerNombre: historiaBase.primerNombre,
        segundoNombre: historiaBase.segundoNombre,
        primerApellido: historiaBase.primerApellido,
        segundoApellido: historiaBase.segundoApellido,
        celular: historiaBase.celular,
        email: historiaBase.email,
        fechaNacimiento: historiaBase.fechaNacimiento,
        edad: historiaBase.edad,
        genero: historiaBase.genero,
        estadoCivil: historiaBase.estadoCivil,
        hijos: historiaBase.hijos,
        ejercicio: historiaBase.ejercicio,
        codEmpresa: historiaBase.codEmpresa,
        tipoExamen: historiaBase.tipoExamen,
        encuestaSalud: historiaBase.encuestaSalud,
        antecedentesFamiliares: historiaBase.antecedentesFamiliares,
        empresa1: historiaBase.empresa1,
        fechaAtencion: historiaBase.fechaAtencion,

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
        fechaConsulta: new Date(), // IMPORTANTE: PostgreSQL genera su propia fechaConsulta
        atendido: 'ATENDIDO',
      }).catch((error) => {
        // No fallar si PostgreSQL falla (Wix es la fuente principal)
        console.error(`⚠️  [PostgreSQL] Error guardando historia clínica ${payload.historiaId}:`, error);
      });

      return { success: true };
    } catch (error: any) {
      console.error('❌ Error actualizando historia clínica:', error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Error al actualizar historia clínica'
      };
    }
  }
}

export default new MedicalHistoryService();

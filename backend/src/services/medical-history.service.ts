import axios from 'axios';

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
   * Actualiza la historia clínica de un paciente en Wix por _id
   */
  async updateMedicalHistory(payload: UpdateMedicalHistoryPayload): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`💾 Actualizando historia clínica para ID: ${payload.historiaId}`);

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
        fechaConsulta: new Date().toISOString(), // Se convertirá a Date en Wix
        atendido: 'ATENDIDO',
      });

      if (response.data && response.data.success) {
        console.log(`✅ Historia clínica actualizada exitosamente para ${payload.historiaId}`);
        return { success: true };
      }

      console.warn(`⚠️  Respuesta inesperada al actualizar historia clínica: ${JSON.stringify(response.data)}`);
      return { success: false, error: 'Respuesta inesperada del servidor' };
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

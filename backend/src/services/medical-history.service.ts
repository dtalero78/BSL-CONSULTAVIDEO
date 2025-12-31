import axios from 'axios';
import historiaClinicaPostgresService from './historia-clinica-postgres.service';
import postgresService from './postgres.service';
import whatsappService from './whatsapp.service';

interface AntecedentesPersonales {
  cirugiaOcular?: boolean;
  cirugiaProgramada?: boolean;
  condicionMedica?: boolean;
  dolorCabeza?: boolean;
  dolorEspalda?: boolean;
  embarazo?: boolean;
  enfermedadHigado?: boolean;
  enfermedadPulmonar?: boolean;
  fuma?: boolean;
  consumoLicor?: boolean;
  hernias?: boolean;
  hormigueos?: boolean;
  presionAlta?: boolean;
  problemasAzucar?: boolean;
  problemasCardiacos?: boolean;
  problemasSueno?: boolean;
  usaAnteojos?: boolean;
  usaLentesContacto?: boolean;
  varices?: boolean;
  hepatitis?: boolean;
  trastornoPsicologico?: boolean;
  sintomasPsicologicos?: boolean;
  diagnosticoCancer?: boolean;
  enfermedadesLaborales?: boolean;
  enfermedadOsteomuscular?: boolean;
  enfermedadAutoinmune?: boolean;
  ruidoJaqueca?: boolean;
}

interface AntecedentesFamiliares {
  hereditarias?: boolean;
  geneticas?: boolean;
  diabetes?: boolean;
  hipertension?: boolean;
  infartos?: boolean;
  cancer?: boolean;
  trastornos?: boolean;
  infecciosas?: boolean;
}

interface MedicalHistoryData {
  // Datos del paciente
  _id?: string;
  historiaId?: string; // Alias de _id para compatibilidad con frontend
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
  foto?: string;

  // Datos de la empresa
  codEmpresa?: string;
  cargo?: string;
  tipoExamen?: string;

  // Encuesta de salud
  encuestaSalud?: string;
  antecedentesFamiliares?: string;
  empresa1?: string;

  // Antecedentes médicos del formulario
  antecedentesPersonales?: AntecedentesPersonales;
  antecedentesFamiliaresDetalle?: AntecedentesFamiliares;

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

      // PASO 1: Intentar obtener de PostgreSQL con JOIN a formularios para datos demográficos y antecedentes
      const pgResult = await postgresService.query(
        `SELECT
          h.*,
          f.edad as f_edad,
          f.genero as f_genero,
          f.email as f_email,
          f.estado_civil as f_estado_civil,
          f.hijos as f_hijos,
          f.ejercicio as f_ejercicio,
          f.foto_url as f_foto,
          -- Antecedentes personales
          f.cirugia_ocular,
          f.cirugia_programada,
          f.condicion_medica,
          f.dolor_cabeza,
          f.dolor_espalda,
          f.embarazo,
          f.enfermedad_higado,
          f.enfermedad_pulmonar,
          f.fuma,
          f.consumo_licor,
          f.hernias,
          f.hormigueos,
          f.presion_alta,
          f.problemas_azucar,
          f.problemas_cardiacos,
          f.problemas_sueno,
          f.usa_anteojos,
          f.usa_lentes_contacto,
          f.varices,
          f.hepatitis,
          f.trastorno_psicologico,
          f.sintomas_psicologicos,
          f.diagnostico_cancer,
          f.enfermedades_laborales,
          f.enfermedad_osteomuscular,
          f.enfermedad_autoinmune,
          f.ruido_jaqueca,
          -- Antecedentes familiares
          f.familia_hereditarias,
          f.familia_geneticas,
          f.familia_diabetes,
          f.familia_hipertension,
          f.familia_infartos,
          f.familia_cancer,
          f.familia_trastornos,
          f.familia_infecciosas
        FROM "HistoriaClinica" h
        LEFT JOIN formularios f ON h."numeroId" = f.numero_id
        WHERE h."_id" = $1
        ORDER BY f.fecha_registro DESC
        LIMIT 1`,
        [historiaId]
      );

      if (pgResult && pgResult.length > 0) {
        const row = pgResult[0];
        console.log(`✅ [PostgreSQL] Historia clínica encontrada para ${historiaId}`);
        return {
          _id: row._id,
          historiaId: row._id, // Alias para compatibilidad con frontend
          numeroId: row.numeroId,
          primerNombre: row.primerNombre,
          segundoNombre: row.segundoNombre,
          primerApellido: row.primerApellido,
          segundoApellido: row.segundoApellido,
          celular: row.celular,
          // Datos demográficos desde formularios (con fallback a HistoriaClinica)
          email: row.f_email || row.email,
          edad: row.f_edad,
          genero: row.f_genero,
          estadoCivil: row.f_estado_civil,
          hijos: row.f_hijos?.toString(),
          ejercicio: row.f_ejercicio,
          foto: row.f_foto,
          // Datos de empresa
          codEmpresa: row.codEmpresa,
          cargo: row.cargo,
          tipoExamen: row.tipoExamen,
          // Antecedentes personales (de formularios)
          antecedentesPersonales: {
            cirugiaOcular: row.cirugia_ocular === true || row.cirugia_ocular === 'true' || row.cirugia_ocular === 'Sí' || row.cirugia_ocular === 'SI',
            cirugiaProgramada: row.cirugia_programada === true || row.cirugia_programada === 'true' || row.cirugia_programada === 'Sí' || row.cirugia_programada === 'SI',
            condicionMedica: row.condicion_medica === true || row.condicion_medica === 'true' || row.condicion_medica === 'Sí' || row.condicion_medica === 'SI',
            dolorCabeza: row.dolor_cabeza === true || row.dolor_cabeza === 'true' || row.dolor_cabeza === 'Sí' || row.dolor_cabeza === 'SI',
            dolorEspalda: row.dolor_espalda === true || row.dolor_espalda === 'true' || row.dolor_espalda === 'Sí' || row.dolor_espalda === 'SI',
            embarazo: row.embarazo === true || row.embarazo === 'true' || row.embarazo === 'Sí' || row.embarazo === 'SI',
            enfermedadHigado: row.enfermedad_higado === true || row.enfermedad_higado === 'true' || row.enfermedad_higado === 'Sí' || row.enfermedad_higado === 'SI',
            enfermedadPulmonar: row.enfermedad_pulmonar === true || row.enfermedad_pulmonar === 'true' || row.enfermedad_pulmonar === 'Sí' || row.enfermedad_pulmonar === 'SI',
            fuma: row.fuma === true || row.fuma === 'true' || row.fuma === 'Sí' || row.fuma === 'SI',
            consumoLicor: row.consumo_licor === true || row.consumo_licor === 'true' || row.consumo_licor === 'Sí' || row.consumo_licor === 'SI',
            hernias: row.hernias === true || row.hernias === 'true' || row.hernias === 'Sí' || row.hernias === 'SI',
            hormigueos: row.hormigueos === true || row.hormigueos === 'true' || row.hormigueos === 'Sí' || row.hormigueos === 'SI',
            presionAlta: row.presion_alta === true || row.presion_alta === 'true' || row.presion_alta === 'Sí' || row.presion_alta === 'SI',
            problemasAzucar: row.problemas_azucar === true || row.problemas_azucar === 'true' || row.problemas_azucar === 'Sí' || row.problemas_azucar === 'SI',
            problemasCardiacos: row.problemas_cardiacos === true || row.problemas_cardiacos === 'true' || row.problemas_cardiacos === 'Sí' || row.problemas_cardiacos === 'SI',
            problemasSueno: row.problemas_sueno === true || row.problemas_sueno === 'true' || row.problemas_sueno === 'Sí' || row.problemas_sueno === 'SI',
            usaAnteojos: row.usa_anteojos === true || row.usa_anteojos === 'true' || row.usa_anteojos === 'Sí' || row.usa_anteojos === 'SI',
            usaLentesContacto: row.usa_lentes_contacto === true || row.usa_lentes_contacto === 'true' || row.usa_lentes_contacto === 'Sí' || row.usa_lentes_contacto === 'SI',
            varices: row.varices === true || row.varices === 'true' || row.varices === 'Sí' || row.varices === 'SI',
            hepatitis: row.hepatitis === true || row.hepatitis === 'true' || row.hepatitis === 'Sí' || row.hepatitis === 'SI',
            trastornoPsicologico: row.trastorno_psicologico === true || row.trastorno_psicologico === 'true' || row.trastorno_psicologico === 'Sí' || row.trastorno_psicologico === 'SI',
            sintomasPsicologicos: row.sintomas_psicologicos === true || row.sintomas_psicologicos === 'true' || row.sintomas_psicologicos === 'Sí' || row.sintomas_psicologicos === 'SI',
            diagnosticoCancer: row.diagnostico_cancer === true || row.diagnostico_cancer === 'true' || row.diagnostico_cancer === 'Sí' || row.diagnostico_cancer === 'SI',
            enfermedadesLaborales: row.enfermedades_laborales === true || row.enfermedades_laborales === 'true' || row.enfermedades_laborales === 'Sí' || row.enfermedades_laborales === 'SI',
            enfermedadOsteomuscular: row.enfermedad_osteomuscular === true || row.enfermedad_osteomuscular === 'true' || row.enfermedad_osteomuscular === 'Sí' || row.enfermedad_osteomuscular === 'SI',
            enfermedadAutoinmune: row.enfermedad_autoinmune === true || row.enfermedad_autoinmune === 'true' || row.enfermedad_autoinmune === 'Sí' || row.enfermedad_autoinmune === 'SI',
            ruidoJaqueca: row.ruido_jaqueca === true || row.ruido_jaqueca === 'true' || row.ruido_jaqueca === 'Sí' || row.ruido_jaqueca === 'SI',
          },
          // Antecedentes familiares (de formularios)
          antecedentesFamiliaresDetalle: {
            hereditarias: row.familia_hereditarias === true || row.familia_hereditarias === 'true' || row.familia_hereditarias === 'Sí' || row.familia_hereditarias === 'SI',
            geneticas: row.familia_geneticas === true || row.familia_geneticas === 'true' || row.familia_geneticas === 'Sí' || row.familia_geneticas === 'SI',
            diabetes: row.familia_diabetes === true || row.familia_diabetes === 'true' || row.familia_diabetes === 'Sí' || row.familia_diabetes === 'SI',
            hipertension: row.familia_hipertension === true || row.familia_hipertension === 'true' || row.familia_hipertension === 'Sí' || row.familia_hipertension === 'SI',
            infartos: row.familia_infartos === true || row.familia_infartos === 'true' || row.familia_infartos === 'Sí' || row.familia_infartos === 'SI',
            cancer: row.familia_cancer === true || row.familia_cancer === 'true' || row.familia_cancer === 'Sí' || row.familia_cancer === 'SI',
            trastornos: row.familia_trastornos === true || row.familia_trastornos === 'true' || row.familia_trastornos === 'Sí' || row.familia_trastornos === 'SI',
            infecciosas: row.familia_infecciosas === true || row.familia_infecciosas === 'true' || row.familia_infecciosas === 'Sí' || row.familia_infecciosas === 'SI',
          },
          // Campos médicos
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

      // PASO 1.5: Enviar link de certificado por WhatsApp para empresas específicas (PARTICULAR o SANITHELP-JJ)
      if (historiaBase.codEmpresa === 'PARTICULAR' || historiaBase.codEmpresa === 'SANITHELP-JJ') {
        console.log(`📜 [Certificado] Enviando link de certificado para ${payload.historiaId} (${historiaBase.codEmpresa})...`);

        // Construir URL del certificado
        const certificadoUrl = `https://bsl-utilidades-yp78a.ondigitalocean.app/generar-certificado-desde-wix/${payload.historiaId}`;

        // Formatear número de celular para WhatsApp
        let celularFormateado = historiaBase.celular
          .replace(/\s+/g, '') // Quitar espacios
          .replace(/[()+-]/g, ''); // Quitar caracteres especiales

        // Detectar si ya tiene código de país (números internacionales empiezan con 1-9, no con 3)
        // Colombia: 57 + 10 dígitos (3001234567)
        // USA/Canada: 1 + 10 dígitos
        // Otros países: código país + número

        const codigosPais = ['1', '52', '57', '54', '55', '34', '44', '49', '33']; // USA, México, Colombia, Argentina, Brasil, España, UK, Alemania, Francia
        const tieneCodigo = codigosPais.some(codigo => celularFormateado.startsWith(codigo));

        // Si no tiene código de país y empieza con 3 (celulares colombianos), agregar 57
        if (!tieneCodigo && celularFormateado.startsWith('3') && celularFormateado.length === 10) {
          celularFormateado = `57${celularFormateado}`;
        }

        // Construir mensaje de WhatsApp
        const nombreCompleto = `${historiaBase.primerNombre} ${historiaBase.primerApellido}`;
        const mensaje = `Hola ${nombreCompleto}! 👋\n\n` +
          `Tu certificado médico ya está listo. Puedes descargarlo en el siguiente enlace:\n\n` +
          `${certificadoUrl}\n\n` +
          `_Este enlace estará disponible por 30 días._`;

        // Enviar WhatsApp en background (fire-and-forget)
        whatsappService.sendTextMessage(celularFormateado, mensaje)
          .then((result) => {
            if (result.success) {
              console.log(`✅ [Certificado] Link enviado por WhatsApp a ${celularFormateado}`);
            } else {
              console.error(`⚠️  [Certificado] Error enviando WhatsApp: ${result.error}`);
            }
          })
          .catch((error: any) => {
            console.error(`⚠️  [Certificado] Error inesperado al enviar WhatsApp: ${error.message}`);
          });

        console.log(`📤 [Certificado] Enviando link por WhatsApp a ${celularFormateado}...`);
      } else {
        console.log(`ℹ️  [Certificado] No se envía certificado para ${historiaBase.codEmpresa || 'N/A'}`);
      }

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

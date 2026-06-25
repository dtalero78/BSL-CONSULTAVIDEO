import { useState, useEffect, useRef } from 'react';
import type { Room } from 'twilio-video';
import apiService from '../services/api.service';
import { PatientHistoryModal } from './PatientHistoryModal';
import { useConsultationRecorder } from '../hooks/useConsultationRecorder';

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

interface VoximetriaData {
  f0_mean?: number;
  f0_min?: number;
  f0_max?: number;
  jitter_percent?: number;
  shimmer_percent?: number;
  hnr_db?: number;
  intensidad_mean_db?: number;
  tiempo_maximo_fonacion_s?: number;
  concepto?: string;
  interpretacion?: string;
  recomendaciones?: string;
  created_at?: string;
}

interface MedicalHistoryData {
  historiaId: string;
  numeroId: string;
  primerNombre: string;
  segundoNombre?: string;
  primerApellido: string;
  segundoApellido?: string;
  celular: string;
  email?: string;
  fechaNacimiento?: string;
  edad?: number;
  genero?: string;
  estadoCivil?: string;
  hijos?: string;
  ejercicio?: string;
  codEmpresa?: string;
  cargo?: string;
  tipoExamen?: string;
  encuestaSalud?: string;
  antecedentesFamiliares?: string;
  empresa1?: string;
  antecedentesPersonales?: AntecedentesPersonales;
  antecedentesFamiliaresDetalle?: AntecedentesFamiliares;
  mdAntecedentes?: string;
  mdObsParaMiDocYa?: string;
  mdObservacionesCertificado?: string;
  mdRecomendacionesMedicasAdicionales?: string;
  mdConceptoFinal?: string;
  mdDx1?: string;
  mdDx2?: string;
  talla?: string;
  peso?: string;
  transcriptionText?: string;
  voximetria?: VoximetriaData;
}

interface MedicalHistoryPanelProps {
  historiaId: string;
  onAppendToObservaciones?: (text: string) => void;
  room?: Room | null;
  patientConnected?: boolean;
}

export const MedicalHistoryPanel = ({ historiaId, onAppendToObservaciones, room, patientConnected }: MedicalHistoryPanelProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MedicalHistoryData | null>(null);

  // Campos editables
  const [mdAntecedentes, setMdAntecedentes] = useState('');
  const [mdObsParaMiDocYa, setMdObsParaMiDocYa] = useState('');
  const [mdObservacionesCertificado, setMdObservacionesCertificado] = useState('');
  const [mdRecomendacionesMedicasAdicionales, setMdRecomendacionesMedicasAdicionales] = useState('');
  const [mdConceptoFinal, setMdConceptoFinal] = useState('');
  const [mdDx1, setMdDx1] = useState('');
  const [mdDx2, setMdDx2] = useState('');
  const [talla, setTalla] = useState('');
  const [peso, setPeso] = useState('');
  const [imc, setImc] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [transcriptionNotice, setTranscriptionNotice] = useState<string | null>(null);
  const [transcriptText, setTranscriptText] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);
  // Campos que la IA acaba de rellenar (para resaltarlos en el formulario).
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set());
  // Diagnóstico sugerido por la IA cuando no calza con ninguna opción del select.
  const [dxSuggestion, setDxSuggestion] = useState('');

  // Grabación de la consulta → transcripción + auto-llenado de campos con IA.
  // Usa el _id vigente (data.historiaId) si ya cargó, para persistir bien el transcript.
  const recorder = useConsultationRecorder(room ?? null, data?.historiaId || historiaId);
  // Evita que el auto-inicio se dispare más de una vez por sesión.
  const autoStartedRef = useRef(false);

  useEffect(() => {
    loadMedicalHistory();
  }, [historiaId]);

  // Auto-inicia la grabación cuando el paciente se conecta. Espera (poll corto)
  // a que el audio remoto esté suscrito para capturar ambas voces. Una sola vez.
  useEffect(() => {
    if (!patientConnected || !room || autoStartedRef.current) return;
    if (recorder.isRecording || recorder.isProcessing) return;
    autoStartedRef.current = true;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let tries = 0;

    const hasRemoteAudio = (): boolean =>
      Array.from(room.participants.values()).some((p) =>
        Array.from(p.audioTracks.values()).some(
          (pub) => (pub.track as any)?.mediaStreamTrack
        )
      );

    const tryStart = () => {
      if (cancelled) return;
      if (hasRemoteAudio() || tries >= 8) {
        recorder.startRecording();
        setTranscriptionNotice('🎙️ Grabación iniciada automáticamente al conectarse el paciente.');
      } else {
        tries += 1;
        timer = setTimeout(tryStart, 600);
      }
    };
    timer = setTimeout(tryStart, 800);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientConnected, room]);

  // Formatear segundos a mm:ss para el cronómetro de grabación
  const formatElapsed = (totalSeconds: number): string => {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Resaltado de los campos que la IA acaba de rellenar.
  const aiRing = (field: string): string =>
    aiFilledFields.has(field) ? ' !border-[#00a884] ring-2 ring-[#00a884]/40' : '';
  const aiTag = (field: string) =>
    aiFilledFields.has(field) ? (
      <span className="ml-1 text-[10px] font-bold text-[#00a884] bg-[#00a884]/15 px-1.5 py-0.5 rounded align-middle">
        ✨ IA
      </span>
    ) : null;

  // Texto de los campos que la IA puede autocompletar (para el aviso). Los de
  // texto largo se ANEXAN a lo que ya haya; los cortos se rellenan si están vacíos.
  const FIELD_LABELS: Record<string, string> = {
    mdAntecedentes: 'Antecedentes',
    mdObservacionesCertificado: 'Obs. Certificado',
    mdRecomendacionesMedicasAdicionales: 'Recomendaciones',
    mdDx1: 'Diagnóstico',
    talla: 'Talla',
    peso: 'Peso',
  };

  // ¿Calza el texto libre de la IA con alguna opción del <select> de diagnóstico?
  const matchDxOption = (selectId: string, aiText: string): string => {
    const el = document.getElementById(selectId) as HTMLSelectElement | null;
    if (!el || !aiText) return '';
    const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const t = norm(aiText);
    const opts = Array.from(el.options).map((o) => o.value).filter(Boolean);
    const hits = opts.filter((o) => t.includes(norm(o))).sort((a, b) => b.length - a.length);
    return hits[0] || '';
  };

  // Auto-llena los campos del formulario con lo que extrajo la IA y los resalta.
  // El médico revisa, edita o borra, y guarda con el flujo normal.
  const applyAiFields = (fields: Record<string, string>): { count: number; dxSug: string } => {
    const filled: string[] = [];
    let dxSug = '';

    // Texto largo: anexar si ya hay contenido, o setear si está vacío.
    const longSetters: Record<string, React.Dispatch<React.SetStateAction<string>>> = {
      mdAntecedentes: setMdAntecedentes,
      mdObservacionesCertificado: setMdObservacionesCertificado,
      mdRecomendacionesMedicasAdicionales: setMdRecomendacionesMedicasAdicionales,
    };
    for (const f of Object.keys(longSetters)) {
      const v = fields[f];
      if (v && v.trim()) {
        longSetters[f]((prev) => (prev && prev.trim() ? `${prev}\n\n${v.trim()}` : v.trim()));
        filled.push(f);
      }
    }

    // Talla / peso: tomar solo el número, setear si está vacío.
    if (fields.talla) {
      const n = String(fields.talla).replace(/[^\d.]/g, '');
      if (n) { setTalla((prev) => (prev && prev.trim() ? prev : n)); filled.push('talla'); }
    }
    if (fields.peso) {
      const n = String(fields.peso).replace(/[^\d.]/g, '');
      if (n) { setPeso((prev) => (prev && prev.trim() ? prev : n)); filled.push('peso'); }
    }

    // Diagnóstico: mapear el texto libre a una opción del select; si no calza,
    // dejarlo vacío (correcto para sanos) y mostrar la sugerencia como hint.
    if (fields.mdDx1) {
      const m = matchDxOption('dx1-select', fields.mdDx1);
      if (m) { setMdDx1((prev) => (prev ? prev : m)); filled.push('mdDx1'); }
      else { dxSug = String(fields.mdDx1).trim(); }
    }
    if (fields.mdDx2) {
      const m = matchDxOption('dx2-select', fields.mdDx2);
      if (m) { setMdDx2((prev) => (prev ? prev : m)); }
    }

    setAiFilledFields(new Set(filled));
    setDxSuggestion(dxSug);
    return { count: filled.length, dxSug };
  };

  const handleToggleRecording = async () => {
    setTranscriptionNotice(null);
    if (recorder.isRecording) {
      const result = await recorder.stopRecording();
      if (result) {
        const fields = result.fields || {};
        if (result.transcript) {
          setTranscriptText(result.transcript);
          setShowTranscript(true);
        }
        const { count, dxSug } = applyAiFields(fields);
        const labels = Array.from(new Set(Object.keys(fields)))
          .filter((f) => FIELD_LABELS[f])
          .map((f) => FIELD_LABELS[f]);
        setTranscriptionNotice(
          count > 0
            ? `✅ La IA rellenó ${count} campo(s) (resaltados): ${labels.join(', ')}. Revísalos y guarda.${dxSug ? ` · Diagnóstico sugerido: "${dxSug}" — selecciona el código.` : ''}`
            : (dxSug
                ? `ℹ️ Transcripción lista. Diagnóstico sugerido: "${dxSug}" — selecciona el código. El texto completo está abajo.`
                : 'ℹ️ Transcripción lista, sin campos para autocompletar. El texto completo está abajo.')
        );
      }
    } else {
      await recorder.startRecording();
    }
  };

  // Exponer función para agregar texto a observaciones desde componentes externos
  useEffect(() => {
    if (onAppendToObservaciones) {
      // Crear función que agrega texto al campo actual
      const appendText = (text: string) => {
        setMdObservacionesCertificado(prev => {
          if (prev) {
            return `${prev}\n\n${text}`;
          }
          return text;
        });
      };

      // "Registrar" la función llamándola inmediatamente
      // Esto permite que el padre llame a esta función cuando sea necesario
      onAppendToObservaciones(appendText as any);
    }
  }, [onAppendToObservaciones]);

  // Calcular IMC automáticamente cuando cambian talla o peso
  useEffect(() => {
    if (talla && peso) {
      const tallaNum = parseFloat(talla);
      const pesoNum = parseFloat(peso);

      if (!isNaN(tallaNum) && !isNaN(pesoNum) && tallaNum > 0) {
        // IMC = peso(kg) / (talla(m))^2
        const tallaMetros = tallaNum / 100;
        const imcCalculado = pesoNum / (tallaMetros * tallaMetros);
        setImc(imcCalculado.toFixed(2));
      } else {
        setImc('');
      }
    } else {
      setImc('');
    }
  }, [talla, peso]);

  // Función para determinar el color del IMC
  const getImcColor = () => {
    const imcNum = parseFloat(imc);
    if (isNaN(imcNum)) return 'text-gray-400';
    if (imcNum >= 25) return 'text-red-500'; // Sobrepeso u obesidad
    return 'text-green-400'; // Normal o bajo peso
  };

  // Función para obtener el texto de interpretación del IMC
  const getImcInterpretation = () => {
    const imcNum = parseFloat(imc);
    if (isNaN(imcNum)) return '';
    if (imcNum < 18.5) return 'Bajo peso';
    if (imcNum < 25) return 'Normal';
    if (imcNum < 30) return 'Sobrepeso';
    return 'Obesidad';
  };

  // Función para convertir camelCase a texto legible
  const formatFieldName = (fieldName: string): string => {
    const translations: { [key: string]: string } = {
      // Antecedentes personales
      cirugiaOcular: 'Cirugía Ocular',
      cirugiaProgramada: 'Cirugía Programada',
      condicionMedica: 'Condición Médica',
      dolorCabeza: 'Dolor de Cabeza',
      dolorEspalda: 'Dolor de Espalda',
      embarazo: 'Embarazo',
      enfermedadHigado: 'Enfermedad del Hígado',
      enfermedadPulmonar: 'Enfermedad Pulmonar',
      fuma: 'Fuma',
      consumoLicor: 'Consumo de Licor',
      hernias: 'Hernias',
      hormigueos: 'Hormigueos',
      presionAlta: 'Presión Alta',
      problemasAzucar: 'Problemas de Azúcar',
      problemasCardiacos: 'Problemas Cardíacos',
      problemasSueno: 'Problemas de Sueño',
      usaAnteojos: 'Usa Anteojos',
      usaLentesContacto: 'Usa Lentes de Contacto',
      varices: 'Várices',
      hepatitis: 'Hepatitis',
      trastornoPsicologico: 'Trastorno Psicológico',
      sintomasPsicologicos: 'Síntomas Psicológicos',
      diagnosticoCancer: 'Diagnóstico de Cáncer',
      enfermedadesLaborales: 'Enfermedades Laborales',
      enfermedadOsteomuscular: 'Enfermedad Osteomuscular',
      enfermedadAutoinmune: 'Enfermedad Autoinmune',
      ruidoJaqueca: 'Ruido/Jaqueca',
      // Antecedentes familiares
      hereditarias: 'Enfermedades Hereditarias',
      geneticas: 'Enfermedades Genéticas',
      diabetes: 'Diabetes',
      hipertension: 'Hipertensión',
      infartos: 'Infartos',
      cancer: 'Cáncer',
      trastornos: 'Trastornos',
      infecciosas: 'Enfermedades Infecciosas',
    };
    return translations[fieldName] || fieldName;
  };

  // Función para obtener antecedentes positivos como array de strings
  const getPositiveConditions = (): string[] => {
    if (!data) return [];

    const conditions: string[] = [];

    // Agregar antecedentes personales positivos
    if (data.antecedentesPersonales) {
      Object.entries(data.antecedentesPersonales).forEach(([key, value]) => {
        if (value === true) {
          conditions.push(formatFieldName(key));
        }
      });
    }

    // Agregar antecedentes familiares positivos (con prefijo)
    if (data.antecedentesFamiliaresDetalle) {
      Object.entries(data.antecedentesFamiliaresDetalle).forEach(([key, value]) => {
        if (value === true) {
          conditions.push(`Fam: ${formatFieldName(key)}`);
        }
      });
    }

    return conditions;
  };

  const loadMedicalHistory = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const history = await apiService.getMedicalHistory(historiaId);
      setData(history);

      // Pre-llenar campos editables
      setMdAntecedentes(history.mdAntecedentes || '');
      setMdObsParaMiDocYa(history.mdObsParaMiDocYa || '');
      setMdObservacionesCertificado(history.mdObservacionesCertificado || '');
      setMdRecomendacionesMedicasAdicionales(history.mdRecomendacionesMedicasAdicionales || '');
      setMdConceptoFinal(history.mdConceptoFinal || '');
      setMdDx1(history.mdDx1 || '');
      setMdDx2(history.mdDx2 || '');
      setTalla(history.talla || '');
      setPeso(history.peso || '');
      setTranscriptText(history.transcriptionText || '');
      setAiFilledFields(new Set());
      setDxSuggestion('');
    } catch (err: any) {
      setError(err.message || 'Error al cargar historia clínica');
      console.error('Error loading medical history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateAISuggestions = async () => {
    if (!data) return;

    try {
      setIsGeneratingAI(true);
      setError(null);

      const patientData = {
        edad: data.edad,
        genero: data.genero,
        estadoCivil: data.estadoCivil,
        hijos: data.hijos,
        ejercicio: data.ejercicio,
        codEmpresa: data.codEmpresa,
        cargo: data.cargo,
        tipoExamen: data.tipoExamen,
        antecedentesFamiliares: data.antecedentesFamiliares,
        encuestaSalud: data.encuestaSalud,
        empresa1: data.empresa1,
      };

      const suggestions = await apiService.generateAISuggestions(patientData);
      setAiSuggestions(suggestions);
    } catch (err: any) {
      setError(err.message || 'Error al generar sugerencias con IA');
      console.error('Error generating AI suggestions:', err);
      alert('Error al generar sugerencias con IA');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleSave = async () => {
    if (!data) return;

    if (!mdConceptoFinal) {
      alert('Debe seleccionar un Concepto Final antes de guardar.');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      // Concatenar sugerencias de IA con recomendaciones manuales
      const combinedRecommendations = aiSuggestions
        ? `${aiSuggestions}\n\n${mdRecomendacionesMedicasAdicionales}`.trim()
        : mdRecomendacionesMedicasAdicionales;

      // Concatenar IMC con antecedentes
      let combinedAntecedentes = mdAntecedentes;
      if (imc) {
        const imcText = `IMC: ${imc} (${getImcInterpretation()})`;
        combinedAntecedentes = mdAntecedentes
          ? `${mdAntecedentes}\n\n${imcText}`
          : imcText;
      }

      await apiService.updateMedicalHistory({
        historiaId: data.historiaId,
        mdAntecedentes: combinedAntecedentes,
        mdObsParaMiDocYa,
        mdObservacionesCertificado,
        mdRecomendacionesMedicasAdicionales: combinedRecommendations,
        mdConceptoFinal,
        mdDx1,
        mdDx2,
        talla,
        peso,
        cargo: data.cargo,
      });

      alert('Historia clínica guardada exitosamente');
    } catch (err: any) {
      setError(err.message || 'Error al guardar historia clínica');
      console.error('Error saving medical history:', err);
      alert('Error al guardar historia clínica');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-[#1f2c34] rounded-xl p-6 text-white">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00a884]"></div>
          <span className="ml-3">Cargando historia clínica...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    const isWixNotConfigured = error && error.includes('Error al obtener historia clínica');

    return (
      <div className="h-full flex flex-col bg-[#1f2c34] text-white p-6">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-red-400">Error al Cargar Historia Clínica</h2>
        </div>

        <div className="bg-[#2a3942] rounded-lg p-4 mb-4">
          <p className="text-red-400 mb-3">
            {error || 'No se encontró historia clínica para este paciente'}
          </p>

          {isWixNotConfigured && (
            <div className="mt-4 border-l-4 border-yellow-500 pl-4">
              <p className="text-yellow-400 font-semibold mb-2">⚠️ Configuración Pendiente</p>
              <p className="text-sm text-gray-300 mb-2">
                Las funciones HTTP de Wix no están configuradas. Para activar esta funcionalidad:
              </p>
              <ol className="text-sm text-gray-300 space-y-1 list-decimal list-inside">
                <li>Abre tu sitio de Wix (www.bsl.com.co)</li>
                <li>Activa el Developer Mode (Velo)</li>
                <li>Ve a Backend → http-functions.js</li>
                <li>Copia las funciones de: <code className="bg-gray-700 px-1 rounded">backend/wix-backend-medical-history.js</code></li>
                <li>Publica el sitio</li>
              </ol>
              <p className="text-sm text-gray-400 mt-3">
                ID de Historia: <span className="text-white font-mono">{historiaId}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#1f2c34] text-white">
      {/* Header fijo */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-[#1f2c34] sticky top-0 z-10">
        <h2 className="text-lg font-bold text-[#00a884]">Historia Clínica</h2>
        {data?.numeroId && (
          <div className="flex items-center gap-2">
            {room && (
              <button
                onClick={handleToggleRecording}
                disabled={recorder.isProcessing}
                title={
                  recorder.isRecording
                    ? 'Detener grabación y transcribir'
                    : 'Grabar consulta y transcribir con IA'
                }
                className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition font-medium disabled:opacity-60 disabled:cursor-not-allowed ${
                  recorder.isRecording
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                {recorder.isProcessing ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Transcribiendo...
                  </>
                ) : recorder.isRecording ? (
                  <>
                    <span className="relative flex items-center justify-center w-2.5 h-2.5">
                      <span className="absolute w-2.5 h-2.5 bg-white rounded-full animate-ping"></span>
                      <span className="relative w-2.5 h-2.5 bg-white rounded-full"></span>
                    </span>
                    Detener · {formatElapsed(recorder.seconds)}
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
                      <path d="M17 11a1 1 0 1 0-2 0 3 3 0 0 1-6 0 1 1 0 1 0-2 0 5 5 0 0 0 4 4.9V19H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.1A5 5 0 0 0 17 11z" />
                    </svg>
                    Grabar
                  </>
                )}
              </button>
            )}
            <button
              onClick={() => {
                const certBase =
                  import.meta.env.VITE_UTILIDADES_URL ||
                  'https://bsl-utilidades-yp78a.ondigitalocean.app';
                window.open(
                  `${certBase}/preview-certificado-html/${historiaId}`,
                  '_blank',
                  'noopener,noreferrer'
                );
              }}
              className="flex items-center gap-2 px-3 py-2 bg-[#00a884] text-white text-sm rounded-lg hover:bg-[#008f6f] transition"
              title="Ver certificado médico en HTML"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Certificado
            </button>
            <button
              onClick={() => setIsHistoryModalOpen(true)}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
              title="Ver consultas anteriores de este paciente"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Historial
            </button>
          </div>
        )}
      </div>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

      {/* Estado de la grabación / transcripción */}
      {recorder.isRecording && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-300 text-xs flex items-center gap-2">
          <span className="relative flex items-center justify-center w-2.5 h-2.5">
            <span className="absolute w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></span>
            <span className="relative w-2.5 h-2.5 bg-red-500 rounded-full"></span>
          </span>
          Grabando la consulta (médico + paciente)… {formatElapsed(recorder.seconds)}
        </div>
      )}
      {recorder.isProcessing && (
        <div className="bg-purple-500/10 border border-purple-500/50 rounded-lg p-3 text-purple-200 text-xs">
          Transcribiendo y analizando la consulta con IA… esto puede tardar unos segundos.
        </div>
      )}
      {recorder.error && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 text-xs">
          {recorder.error}
        </div>
      )}
      {transcriptionNotice && (
        <div className="bg-[#00a884]/10 border border-[#00a884]/50 rounded-lg p-3 text-[#7fe7cd] text-xs">
          {transcriptionNotice}
        </div>
      )}

      {/* Transcripción de la consulta (se muestra siempre que exista) */}
      {transcriptText && (
        <div className="bg-[#2a3942] rounded-lg p-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowTranscript((v) => !v)}
              className="flex items-center gap-2 text-sm font-semibold text-[#00a884]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" style={{ transform: showTranscript ? 'rotate(90deg)' : 'none', transformOrigin: 'center' }} />
              </svg>
              Transcripción de la consulta
            </button>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(transcriptText);
                setTranscriptionNotice('📋 Transcripción copiada al portapapeles.');
              }}
              className="text-xs px-2 py-1 bg-[#1f2c34] text-gray-300 rounded hover:text-white transition"
              title="Copiar transcripción"
            >
              Copiar
            </button>
          </div>
          {showTranscript && (
            <textarea
              readOnly
              value={transcriptText}
              className="mt-3 w-full h-40 bg-[#1f2c34] border border-gray-700 rounded-lg p-2 text-xs text-gray-200 resize-y focus:outline-none"
            />
          )}
        </div>
      )}

      {/* Información del Paciente (Solo lectura) */}
      <div className="bg-[#2a3942] rounded-lg p-3">
        <h3 className="text-sm font-semibold mb-2 text-[#00a884]">Datos del Paciente</h3>
        <div className="grid grid-cols-1 gap-2 text-xs">
          <div>
            <span className="text-gray-400">Nombre:</span>
            <span className="text-white ml-2">
              {data.primerNombre} {data.segundoNombre} {data.primerApellido} {data.segundoApellido}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Documento:</span>
            <span className="text-white ml-2">{data.numeroId}</span>
          </div>
          <div>
            <span className="text-gray-400">Edad:</span>
            <span className="text-white ml-2">{data.edad || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-400">Género:</span>
            <span className="text-white ml-2">{data.genero || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-400">Celular:</span>
            <span className="text-white ml-2">{data.celular}</span>
          </div>
          <div>
            <span className="text-gray-400">Email:</span>
            <span className="text-white ml-2">{data.email || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-400">Estado Civil:</span>
            <span className="text-white ml-2">{data.estadoCivil || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-400">Hijos:</span>
            <span className="text-white ml-2">{data.hijos || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-400">Ejercicio:</span>
            <span className="text-white ml-2">{data.ejercicio || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-400">Empresa:</span>
            <span className="text-white ml-2">{data.codEmpresa || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-400">Cargo:</span>
            <span className="text-white ml-2">{data.cargo || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-400">Tipo Examen:</span>
            <span className="text-white ml-2">{data.tipoExamen || 'N/A'}</span>
          </div>
        </div>
      </div>

      {/* Condiciones Especiales (antecedentes positivos del formulario) */}
      {getPositiveConditions().length > 0 && (
        <div className="bg-[#2a3942] rounded-lg p-3">
          <h3 className="text-sm font-semibold mb-2 text-[#00a884]">Condiciones Especiales</h3>
          <div className="flex flex-wrap gap-2">
            {getPositiveConditions().map((condition, index) => (
              <span
                key={index}
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  condition.startsWith('Fam:')
                    ? 'bg-purple-900/30 text-purple-300 border border-purple-500/30'
                    : 'bg-amber-900/30 text-amber-300 border border-amber-500/30'
                }`}
              >
                {condition}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Antecedentes (Solo lectura) */}
      {(data.antecedentesFamiliares || data.encuestaSalud || data.empresa1) && (
        <div className="bg-[#2a3942] rounded-lg p-3">
          <h3 className="text-sm font-semibold mb-2 text-[#00a884]">Antecedentes</h3>
          <div className="space-y-2 text-xs">
            {data.antecedentesFamiliares && (
              <div>
                <span className="text-gray-400">Antecedentes Familiares:</span>
                <p className="text-white mt-1 whitespace-pre-wrap">{data.antecedentesFamiliares}</p>
              </div>
            )}
            {data.encuestaSalud && (
              <div>
                <span className="text-gray-400">Encuesta de Salud:</span>
                <p className="text-white mt-1 whitespace-pre-wrap">{data.encuestaSalud}</p>
              </div>
            )}
            {data.empresa1 && (
              <div>
                <span className="text-gray-400">Cargo Anterior:</span>
                <p className="text-white mt-1">{data.empresa1}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Voximetría Virtual (resultados de prueba de voz) */}
      {data.voximetria && (
        <div className="bg-[#2a3942] rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-[#00a884]">🎤 Voximetría Virtual</h3>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              data.voximetria.concepto === 'Normal'
                ? 'bg-green-900/30 text-green-300 border border-green-500/30'
                : data.voximetria.concepto?.includes('Alteración') || data.voximetria.concepto?.includes('Alteracion')
                  ? 'bg-red-900/30 text-red-300 border border-red-500/30'
                  : 'bg-amber-900/30 text-amber-300 border border-amber-500/30'
            }`}>
              {data.voximetria.concepto || 'Sin concepto'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-[#1f2c34] rounded p-2 text-center">
              <div className="text-sm font-bold text-white">{data.voximetria.f0_mean || '--'}</div>
              <div className="text-[10px] text-gray-400">F0 (Hz)</div>
            </div>
            <div className="bg-[#1f2c34] rounded p-2 text-center">
              <div className="text-sm font-bold text-white">{data.voximetria.jitter_percent || '--'}</div>
              <div className="text-[10px] text-gray-400">Jitter (%)</div>
            </div>
            <div className="bg-[#1f2c34] rounded p-2 text-center">
              <div className="text-sm font-bold text-white">{data.voximetria.shimmer_percent || '--'}</div>
              <div className="text-[10px] text-gray-400">Shimmer (%)</div>
            </div>
            <div className="bg-[#1f2c34] rounded p-2 text-center">
              <div className="text-sm font-bold text-white">{data.voximetria.hnr_db || '--'}</div>
              <div className="text-[10px] text-gray-400">HNR (dB)</div>
            </div>
            <div className="bg-[#1f2c34] rounded p-2 text-center">
              <div className="text-sm font-bold text-white">{data.voximetria.intensidad_mean_db || '--'}</div>
              <div className="text-[10px] text-gray-400">Intensidad (dB)</div>
            </div>
            <div className="bg-[#1f2c34] rounded p-2 text-center">
              <div className="text-sm font-bold text-white">{data.voximetria.tiempo_maximo_fonacion_s || '--'}</div>
              <div className="text-[10px] text-gray-400">TMF (seg)</div>
            </div>
          </div>
          {data.voximetria.interpretacion && (
            <div className="mb-2">
              <span className="text-xs text-gray-400">Interpretación:</span>
              <p className="text-xs text-white mt-1">{data.voximetria.interpretacion}</p>
            </div>
          )}
          {data.voximetria.recomendaciones && (
            <div>
              <span className="text-xs text-gray-400">Recomendaciones:</span>
              <p className="text-xs text-white mt-1">{data.voximetria.recomendaciones}</p>
            </div>
          )}
        </div>
      )}

      {/* Medidas Físicas */}
      <div className="bg-[#2a3942] rounded-lg p-3">
        <h3 className="text-sm font-semibold mb-2 text-[#00a884]">Medidas Físicas</h3>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Talla (cm){aiTag('talla')}</label>
            <input
              type="text"
              value={talla}
              onChange={(e) => setTalla(e.target.value)}
              className={`w-full bg-[#1f2c34] text-white text-sm px-2 py-2 rounded border border-gray-600 focus:border-[#00a884] focus:outline-none${aiRing('talla')}`}
              placeholder="170"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Peso (kg){aiTag('peso')}</label>
            <input
              type="text"
              value={peso}
              onChange={(e) => setPeso(e.target.value)}
              className={`w-full bg-[#1f2c34] text-white text-sm px-2 py-2 rounded border border-gray-600 focus:border-[#00a884] focus:outline-none${aiRing('peso')}`}
              placeholder="70"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">IMC</label>
            <input
              type="text"
              value={imc ? `${imc} (${getImcInterpretation()})` : ''}
              readOnly
              className={`w-full bg-[#2a3942] ${getImcColor()} text-sm px-2 py-2 rounded border border-gray-600 cursor-not-allowed font-semibold`}
              placeholder="Auto"
            />
          </div>
        </div>
      </div>

      {/* Campos Médicos Editables */}
      <div className="bg-[#2a3942] rounded-lg p-3">
        <h3 className="text-sm font-semibold mb-3 text-[#00a884]">Evaluación Médica</h3>
        <div className="space-y-3">

        {/* 1. ANTECEDENTES */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Antecedentes{aiTag('mdAntecedentes')}</label>
          <textarea
            value={mdAntecedentes}
            onChange={(e) => setMdAntecedentes(e.target.value)}
            className={`w-full bg-[#1f2c34] text-white text-sm px-2 py-2 rounded border border-gray-600 focus:border-[#00a884] focus:outline-none${aiRing('mdAntecedentes')}`}
            rows={3}
            placeholder="Antecedentes médicos relevantes..."
          />
        </div>

        {/* 2. OBS. CERTIFICADO */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Obs. Certificado{aiTag('mdObservacionesCertificado')}</label>
          <textarea
            value={mdObservacionesCertificado}
            onChange={(e) => setMdObservacionesCertificado(e.target.value)}
            className={`w-full bg-[#1f2c34] text-white text-sm px-2 py-2 rounded border border-gray-600 focus:border-[#00a884] focus:outline-none${aiRing('mdObservacionesCertificado')}`}
            rows={3}
            placeholder="Observaciones para el certificado..."
          />
        </div>

        {/* 3. RECOMENDACIONES MÉDICAS ADICIONALES */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Recomendaciones Médicas Adicionales{aiTag('mdRecomendacionesMedicasAdicionales')}</label>
          <textarea
            value={mdRecomendacionesMedicasAdicionales}
            onChange={(e) => setMdRecomendacionesMedicasAdicionales(e.target.value)}
            className={`w-full bg-[#1f2c34] text-white text-sm px-2 py-2 rounded border border-gray-600 focus:border-[#00a884] focus:outline-none${aiRing('mdRecomendacionesMedicasAdicionales')}`}
            rows={3}
            placeholder="Recomendaciones médicas adicionales..."
          />
        </div>

        {/* 4. OBSERVACIONES PRIVADAS PARA LA EMPRESA */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Observaciones privadas para la empresa</label>
          <textarea
            value={mdObsParaMiDocYa}
            onChange={(e) => setMdObsParaMiDocYa(e.target.value)}
            className="w-full bg-[#1f2c34] text-white text-sm px-2 py-2 rounded border border-gray-600 focus:border-[#00a884] focus:outline-none"
            rows={3}
            placeholder="Observaciones privadas para la empresa..."
          />
        </div>

        {/* 5. DIAGNÓSTICOS */}
        <div className="grid grid-cols-1 gap-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Diagnóstico 1 (Principal){aiTag('mdDx1')}</label>
            {dxSuggestion && (
              <div className="mb-1 text-[11px] text-[#7fe7cd] bg-[#00a884]/10 border border-[#00a884]/40 rounded px-2 py-1">
                ✨ Sugerencia IA: “{dxSuggestion}” — selecciona el código que corresponda.
              </div>
            )}
            <select
              id="dx1-select"
              value={mdDx1}
              onChange={(e) => setMdDx1(e.target.value)}
              className={`w-full bg-[#1f2c34] text-white text-sm px-2 py-2 rounded border border-gray-600 focus:border-[#00a884] focus:outline-none${aiRing('mdDx1')}`}
            >
              <option value="">Seleccione diagnóstico</option>
              <option value="Asma ocupacional">Asma ocupacional</option>
              <option value="Bronquitis crónica por polvos inorgánicos">Bronquitis crónica por polvos inorgánicos</option>
              <option value="Bursitis de codo">Bursitis de codo</option>
              <option value="Bursitis de hombro">Bursitis de hombro</option>
              <option value="Bursitis de rodilla">Bursitis de rodilla</option>
              <option value="Cervicalgia">Cervicalgia</option>
              <option value="Dermatitis alérgica de contacto">Dermatitis alérgica de contacto</option>
              <option value="Dermatitis irritativa de contacto">Dermatitis irritativa de contacto</option>
              <option value="Dorsalgia">Dorsalgia</option>
              <option value="Epicondilitis lateral (codo de tenista)">Epicondilitis lateral (codo de tenista)</option>
              <option value="Epicondilitis medial">Epicondilitis medial</option>
              <option value="Escoliosis">Escoliosis</option>
              <option value="Espondiloartrosis cervical">Espondiloartrosis cervical</option>
              <option value="Espondiloartrosis lumbar">Espondiloartrosis lumbar</option>
              <option value="Espondilosis cervical">Espondilosis cervical</option>
              <option value="Espondilosis lumbar">Espondilosis lumbar</option>
              <option value="Estrés postraumático">Estrés postraumático</option>
              <option value="Gonalgia (dolor de rodilla)">Gonalgia (dolor de rodilla)</option>
              <option value="Hernia discal cervical">Hernia discal cervical</option>
              <option value="Hernia discal lumbar">Hernia discal lumbar</option>
              <option value="Hipoacusia neurosensorial bilateral">Hipoacusia neurosensorial bilateral</option>
              <option value="Lumbalgia">Lumbalgia</option>
              <option value="Mialgia">Mialgia</option>
              <option value="Obesidad">Obesidad</option>
              <option value="Onicomicosis">Onicomicosis</option>
              <option value="Otros síntomas y signos que involucran los sistemas nervioso y osteomuscular no especificados">Otros síntomas y signos que involucran los sistemas nervioso y osteomuscular no especificados</option>
              <option value="Pérdida auditiva inducida por ruido">Pérdida auditiva inducida por ruido</option>
              <option value="Presbiacusia">Presbiacusia</option>
              <option value="Síndrome de Burnout">Síndrome de Burnout</option>
              <option value="Síndrome de túnel carpiano">Síndrome de túnel carpiano</option>
              <option value="Síndrome del manguito rotador">Síndrome del manguito rotador</option>
              <option value="Sinovitis de muñeca">Sinovitis de muñeca</option>
              <option value="Sobrepeso">Sobrepeso</option>
              <option value="Tenosinovitis de De Quervain">Tenosinovitis de De Quervain</option>
              <option value="Tendinitis de hombro">Tendinitis de hombro</option>
              <option value="Tendinitis del manguito rotador">Tendinitis del manguito rotador</option>
              <option value="Trastorno adaptativo con ansiedad">Trastorno adaptativo con ansiedad</option>
              <option value="Trastorno de ansiedad generalizada">Trastorno de ansiedad generalizada</option>
              <option value="Trastorno depresivo">Trastorno depresivo</option>
              <option value="Trastornos del sueño">Trastornos del sueño</option>
              <option value="Trauma acústico agudo">Trauma acústico agudo</option>
              <option value="Vértigo posicional">Vértigo posicional</option>
              <option value="Vitiligo">Vitiligo</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Diagnóstico 2 (Secundario){aiTag('mdDx2')}</label>
            <select
              id="dx2-select"
              value={mdDx2}
              onChange={(e) => setMdDx2(e.target.value)}
              className={`w-full bg-[#1f2c34] text-white text-sm px-2 py-2 rounded border border-gray-600 focus:border-[#00a884] focus:outline-none${aiRing('mdDx2')}`}
            >
              <option value="">Seleccione diagnóstico</option>
              <option value="Asma ocupacional">Asma ocupacional</option>
              <option value="Bronquitis crónica por polvos inorgánicos">Bronquitis crónica por polvos inorgánicos</option>
              <option value="Bursitis de codo">Bursitis de codo</option>
              <option value="Bursitis de hombro">Bursitis de hombro</option>
              <option value="Bursitis de rodilla">Bursitis de rodilla</option>
              <option value="Cervicalgia">Cervicalgia</option>
              <option value="Dermatitis alérgica de contacto">Dermatitis alérgica de contacto</option>
              <option value="Dermatitis irritativa de contacto">Dermatitis irritativa de contacto</option>
              <option value="Dorsalgia">Dorsalgia</option>
              <option value="Epicondilitis lateral (codo de tenista)">Epicondilitis lateral (codo de tenista)</option>
              <option value="Epicondilitis medial">Epicondilitis medial</option>
              <option value="Escoliosis">Escoliosis</option>
              <option value="Espondiloartrosis cervical">Espondiloartrosis cervical</option>
              <option value="Espondiloartrosis lumbar">Espondiloartrosis lumbar</option>
              <option value="Espondilosis cervical">Espondilosis cervical</option>
              <option value="Espondilosis lumbar">Espondilosis lumbar</option>
              <option value="Estrés postraumático">Estrés postraumático</option>
              <option value="Gonalgia (dolor de rodilla)">Gonalgia (dolor de rodilla)</option>
              <option value="Hernia discal cervical">Hernia discal cervical</option>
              <option value="Hernia discal lumbar">Hernia discal lumbar</option>
              <option value="Hipoacusia neurosensorial bilateral">Hipoacusia neurosensorial bilateral</option>
              <option value="Lumbalgia">Lumbalgia</option>
              <option value="Mialgia">Mialgia</option>
              <option value="Obesidad">Obesidad</option>
              <option value="Onicomicosis">Onicomicosis</option>
              <option value="Otros síntomas y signos que involucran los sistemas nervioso y osteomuscular no especificados">Otros síntomas y signos que involucran los sistemas nervioso y osteomuscular no especificados</option>
              <option value="Pérdida auditiva inducida por ruido">Pérdida auditiva inducida por ruido</option>
              <option value="Presbiacusia">Presbiacusia</option>
              <option value="Síndrome de Burnout">Síndrome de Burnout</option>
              <option value="Síndrome de túnel carpiano">Síndrome de túnel carpiano</option>
              <option value="Síndrome del manguito rotador">Síndrome del manguito rotador</option>
              <option value="Sinovitis de muñeca">Sinovitis de muñeca</option>
              <option value="Sobrepeso">Sobrepeso</option>
              <option value="Tenosinovitis de De Quervain">Tenosinovitis de De Quervain</option>
              <option value="Tendinitis de hombro">Tendinitis de hombro</option>
              <option value="Tendinitis del manguito rotador">Tendinitis del manguito rotador</option>
              <option value="Trastorno adaptativo con ansiedad">Trastorno adaptativo con ansiedad</option>
              <option value="Trastorno de ansiedad generalizada">Trastorno de ansiedad generalizada</option>
              <option value="Trastorno depresivo">Trastorno depresivo</option>
              <option value="Trastornos del sueño">Trastornos del sueño</option>
              <option value="Trauma acústico agudo">Trauma acústico agudo</option>
              <option value="Vértigo posicional">Vértigo posicional</option>
              <option value="Vitiligo">Vitiligo</option>
            </select>
          </div>
        </div>

        {/* 6. SUGERENCIAS IA */}
        <div className="border-2 border-blue-500/30 rounded-lg p-3 bg-blue-900/10">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs text-blue-400 font-semibold">Sugerencias IA</label>
            <button
              onClick={handleGenerateAISuggestions}
              disabled={isGeneratingAI}
              className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {isGeneratingAI ? (
                <>
                  <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generando...
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generar con IA
                </>
              )}
            </button>
          </div>
          <textarea
            value={aiSuggestions}
            onChange={(e) => setAiSuggestions(e.target.value)}
            className="w-full bg-[#1f2c34] text-white text-sm px-2 py-2 rounded border border-blue-500/30 focus:border-blue-400 focus:outline-none"
            rows={5}
            placeholder="Haz clic en 'Generar con IA' para obtener recomendaciones médicas personalizadas basadas en los datos del paciente..."
          />
          <p className="text-xs text-blue-400/70 mt-1">
            Estas sugerencias se concatenarán automáticamente con las recomendaciones médicas adicionales al guardar
          </p>
        </div>

        {/* 7. CONCEPTO FINAL */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Concepto Final <span className="text-red-500">*</span></label>
          <select
            value={mdConceptoFinal}
            onChange={(e) => setMdConceptoFinal(e.target.value)}
            className="w-full bg-[#1f2c34] text-white text-sm px-2 py-2 rounded border border-gray-600 focus:border-[#00a884] focus:outline-none"
          >
            <option value="">Seleccione una opción</option>
            <option value="Apto para el cargo sin restricciones médico-laborales.">Apto para el cargo sin restricciones médico-laborales.</option>
            <option value="Apto para el cargo recomendaciones médico-laborales.">Apto para el cargo recomendaciones médico-laborales.</option>
            <option value="Apto para el cargo restricciones médico-laborales temporales.">Apto para el cargo restricciones médico-laborales temporales.</option>
            <option value="Apto para el cargo restricciones médico-laborales permanentes.">Apto para el cargo restricciones médico-laborales permanentes.</option>
            <option value="Concepto pendiente por valoración médica complementaria.">Concepto pendiente por valoración médica complementaria.</option>
            <option value="Presenta restricciones médico-laborales actualmente incompatibles con las exigencias del cargo evaluado.">Presenta restricciones médico-laborales actualmente incompatibles con las exigencias del cargo evaluado.</option>
            <option value="NO PRESENTA DETERIORO FÍSICO POR ACTIVIDAD LABORAL">NO PRESENTA DETERIORO FÍSICO POR ACTIVIDAD LABORAL</option>
          </select>
        </div>

        </div>
      </div>

      </div>
      {/* Cierre del contenido scrollable */}

      {/* Botón Guardar - Footer fijo */}
      <div className="border-t border-gray-700 p-4 bg-[#1f2c34]">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-[#00a884] text-white px-6 py-3 rounded-lg hover:bg-[#008f6f] transition font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed shadow-lg"
        >
          {isSaving ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Guardando...
            </span>
          ) : (
            'Guardar Historia Clínica'
          )}
        </button>
      </div>

      {/* Modal de Historial de Consultas */}
      {data?.numeroId && (
        <PatientHistoryModal
          isOpen={isHistoryModalOpen}
          onClose={() => setIsHistoryModalOpen(false)}
          numeroId={data.numeroId}
          patientName={`${data.primerNombre} ${data.primerApellido}`}
        />
      )}
    </div>
  );
};

import { useState, useEffect } from 'react';
import apiService from '../services/api.service';

interface MedicalHistoryData {
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
  mdAntecedentes?: string;
  mdObsParaMiDocYa?: string;
  mdObservacionesCertificado?: string;
  mdRecomendacionesMedicasAdicionales?: string;
  mdConceptoFinal?: string;
  mdDx1?: string;
  mdDx2?: string;
  talla?: string;
  peso?: string;
}

interface MedicalHistoryPanelProps {
  numeroId: string;
}

export const MedicalHistoryPanel = ({ numeroId }: MedicalHistoryPanelProps) => {
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

  useEffect(() => {
    loadMedicalHistory();
  }, [numeroId]);

  const loadMedicalHistory = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const history = await apiService.getMedicalHistory(numeroId);
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
    } catch (err: any) {
      setError(err.message || 'Error al cargar historia clínica');
      console.error('Error loading medical history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!data) return;

    try {
      setIsSaving(true);
      setError(null);

      await apiService.updateMedicalHistory({
        numeroId: data.numeroId,
        mdAntecedentes,
        mdObsParaMiDocYa,
        mdObservacionesCertificado,
        mdRecomendacionesMedicasAdicionales,
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
                Documento del paciente: <span className="text-white font-mono">{numeroId}</span>
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
      <div className="flex items-center p-4 border-b border-gray-700 bg-[#1f2c34] sticky top-0 z-10">
        <h2 className="text-lg font-bold text-[#00a884]">Historia Clínica</h2>
      </div>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

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

      {/* Medidas Físicas */}
      <div className="bg-[#2a3942] rounded-lg p-3">
        <h3 className="text-sm font-semibold mb-2 text-[#00a884]">Medidas Físicas</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Talla (cm)</label>
            <input
              type="text"
              value={talla}
              onChange={(e) => setTalla(e.target.value)}
              className="w-full bg-[#1f2c34] text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-[#00a884] focus:outline-none"
              placeholder="Ej: 170"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Peso (kg)</label>
            <input
              type="text"
              value={peso}
              onChange={(e) => setPeso(e.target.value)}
              className="w-full bg-[#1f2c34] text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-[#00a884] focus:outline-none"
              placeholder="Ej: 70"
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
          <label className="block text-xs text-gray-400 mb-1">Antecedentes</label>
          <textarea
            value={mdAntecedentes}
            onChange={(e) => setMdAntecedentes(e.target.value)}
            className="w-full bg-[#1f2c34] text-white text-sm px-2 py-2 rounded border border-gray-600 focus:border-[#00a884] focus:outline-none"
            rows={3}
            placeholder="Antecedentes médicos relevantes..."
          />
        </div>

        {/* 2. OBS. CERTIFICADO */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Obs. Certificado</label>
          <textarea
            value={mdObservacionesCertificado}
            onChange={(e) => setMdObservacionesCertificado(e.target.value)}
            className="w-full bg-[#1f2c34] text-white text-sm px-2 py-2 rounded border border-gray-600 focus:border-[#00a884] focus:outline-none"
            rows={3}
            placeholder="Observaciones para el certificado..."
          />
        </div>

        {/* 3. RECOMENDACIONES MÉDICAS ADICIONALES */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Recomendaciones Médicas Adicionales</label>
          <textarea
            value={mdRecomendacionesMedicasAdicionales}
            onChange={(e) => setMdRecomendacionesMedicasAdicionales(e.target.value)}
            className="w-full bg-[#1f2c34] text-white text-sm px-2 py-2 rounded border border-gray-600 focus:border-[#00a884] focus:outline-none"
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
            <label className="block text-xs text-gray-400 mb-1">Diagnóstico 1 (Principal)</label>
            <select
              value={mdDx1}
              onChange={(e) => setMdDx1(e.target.value)}
              className="w-full bg-[#1f2c34] text-white text-sm px-2 py-2 rounded border border-gray-600 focus:border-[#00a884] focus:outline-none"
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
            <label className="block text-xs text-gray-400 mb-1">Diagnóstico 2 (Secundario)</label>
            <select
              value={mdDx2}
              onChange={(e) => setMdDx2(e.target.value)}
              className="w-full bg-[#1f2c34] text-white text-sm px-2 py-2 rounded border border-gray-600 focus:border-[#00a884] focus:outline-none"
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

        {/* 6. CONCEPTO FINAL */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Concepto Final</label>
          <select
            value={mdConceptoFinal}
            onChange={(e) => setMdConceptoFinal(e.target.value)}
            className="w-full bg-[#1f2c34] text-white text-sm px-2 py-2 rounded border border-gray-600 focus:border-[#00a884] focus:outline-none"
          >
            <option value="">Seleccione una opción</option>
            <option value="ELEGIBLE PARA EL CARGO SIN RECOMENDACIONES LABORALES">ELEGIBLE PARA EL CARGO SIN RECOMENDACIONES LABORALES</option>
            <option value="ELEGIBLE PARA EL CARGO CON RECOMENDACIONES LABORALES">ELEGIBLE PARA EL CARGO CON RECOMENDACIONES LABORALES</option>
            <option value="NO ELEGIBLE PARA EL CARGO POR FUERA DEL PROFESIOGRAMA">NO ELEGIBLE PARA EL CARGO POR FUERA DEL PROFESIOGRAMA</option>
            <option value="PENDIENTE">PENDIENTE</option>
            <option value="NO PRESENTA DETERIORO FÍSICO POR ACTIVIDAD LABORAL">NO PRESENTA DETERIORO FÍSICO POR ACTIVIDAD LABORAL</option>
            <option value="Puede realizar actividades escolares y grupales">Puede realizar actividades escolares y grupales</option>
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
    </div>
  );
};

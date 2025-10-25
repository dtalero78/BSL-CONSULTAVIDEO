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
  onClose?: () => void;
}

export const MedicalHistoryPanel = ({ numeroId, onClose }: MedicalHistoryPanelProps) => {
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
    return (
      <div className="bg-[#1f2c34] rounded-xl p-6 text-white">
        <div className="text-red-400">
          {error || 'No se encontró historia clínica para este paciente'}
        </div>
        <button
          onClick={onClose}
          className="mt-4 bg-gray-600 px-4 py-2 rounded-lg hover:bg-gray-700"
        >
          Cerrar
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#1f2c34] rounded-xl p-6 text-white max-h-[80vh] overflow-y-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-600">
        <h2 className="text-2xl font-bold text-[#00a884]">Historia Clínica</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        )}
      </div>

      {/* Información del Paciente (Solo lectura) */}
      <div className="mb-6 bg-[#2a3942] rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3 text-[#00a884]">Datos del Paciente</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
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
        <div className="mb-6 bg-[#2a3942] rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3 text-[#00a884]">Antecedentes</h3>
          <div className="space-y-2 text-sm">
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
      <div className="mb-6 bg-[#2a3942] rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3 text-[#00a884]">Medidas Físicas</h3>
        <div className="grid grid-cols-2 gap-4">
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
      <div className="space-y-4 mb-6">
        <h3 className="text-lg font-semibold text-[#00a884]">Evaluación Médica</h3>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Antecedentes</label>
          <textarea
            value={mdAntecedentes}
            onChange={(e) => setMdAntecedentes(e.target.value)}
            className="w-full bg-[#2a3942] text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-[#00a884] focus:outline-none min-h-[80px]"
            placeholder="Ingrese los antecedentes médicos..."
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Observaciones para MiDocYa</label>
          <textarea
            value={mdObsParaMiDocYa}
            onChange={(e) => setMdObsParaMiDocYa(e.target.value)}
            className="w-full bg-[#2a3942] text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-[#00a884] focus:outline-none min-h-[80px]"
            placeholder="Observaciones para MiDocYa..."
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Observaciones del Certificado</label>
          <textarea
            value={mdObservacionesCertificado}
            onChange={(e) => setMdObservacionesCertificado(e.target.value)}
            className="w-full bg-[#2a3942] text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-[#00a884] focus:outline-none min-h-[80px]"
            placeholder="Observaciones del certificado..."
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Recomendaciones Médicas Adicionales</label>
          <textarea
            value={mdRecomendacionesMedicasAdicionales}
            onChange={(e) => setMdRecomendacionesMedicasAdicionales(e.target.value)}
            className="w-full bg-[#2a3942] text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-[#00a884] focus:outline-none min-h-[80px]"
            placeholder="Recomendaciones médicas..."
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Concepto Final</label>
          <textarea
            value={mdConceptoFinal}
            onChange={(e) => setMdConceptoFinal(e.target.value)}
            className="w-full bg-[#2a3942] text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-[#00a884] focus:outline-none min-h-[80px]"
            placeholder="Concepto final del médico..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Diagnóstico 1</label>
            <input
              type="text"
              value={mdDx1}
              onChange={(e) => setMdDx1(e.target.value)}
              className="w-full bg-[#2a3942] text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-[#00a884] focus:outline-none"
              placeholder="Diagnóstico principal..."
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Diagnóstico 2</label>
            <input
              type="text"
              value={mdDx2}
              onChange={(e) => setMdDx2(e.target.value)}
              className="w-full bg-[#2a3942] text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-[#00a884] focus:outline-none"
              placeholder="Diagnóstico secundario..."
            />
          </div>
        </div>
      </div>

      {/* Botón Guardar */}
      <div className="sticky bottom-0 bg-[#1f2c34] pt-4 pb-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-[#00a884] text-white px-6 py-3 rounded-lg hover:bg-[#008f6f] transition font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Guardando...' : 'Guardar Historia Clínica'}
        </button>
      </div>
    </div>
  );
};

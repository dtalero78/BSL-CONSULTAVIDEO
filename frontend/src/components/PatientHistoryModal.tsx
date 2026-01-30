import { useState, useEffect } from 'react';
import apiService, { PatientHistoryRecord } from '../services/api.service';

interface PatientHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  numeroId: string;
  patientName: string;
}

export const PatientHistoryModal = ({
  isOpen,
  onClose,
  numeroId,
  patientName,
}: PatientHistoryModalProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<PatientHistoryRecord[]>([]);
  const [expandedRecord, setExpandedRecord] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && numeroId) {
      loadHistory();
    }
  }, [isOpen, numeroId]);

  const loadHistory = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiService.getPatientHistory(numeroId);
      setHistory(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar historial');
      console.error('Error loading patient history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const toggleExpand = (recordId: string) => {
    setExpandedRecord(expandedRecord === recordId ? null : recordId);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-[#1f2c34] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-[#00a884]">Historial de Consultas</h2>
            <p className="text-sm text-gray-400 mt-1">
              Paciente: {patientName} | Doc: {numeroId}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700 transition"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00a884]"></div>
              <span className="ml-3 text-white">Cargando historial...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-red-400">{error}</p>
              <button
                onClick={loadHistory}
                className="mt-4 px-4 py-2 bg-[#00a884] text-white rounded-lg hover:bg-[#008f6f] transition"
              >
                Reintentar
              </button>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-600/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-gray-400">No se encontraron consultas anteriores</p>
              <p className="text-gray-500 text-sm mt-2">Este paciente no tiene historial de consultas completadas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((record) => (
                <div
                  key={record._id}
                  className="bg-[#2a3942] rounded-xl overflow-hidden border border-gray-700"
                >
                  {/* Record Header - Clickable */}
                  <button
                    onClick={() => toggleExpand(record._id)}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-[#333f48] transition"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-white font-semibold">
                          {formatDate(record.fechaConsulta)}
                        </span>
                        {record.medico && (
                          <span className="text-xs bg-blue-900/40 text-blue-300 px-2 py-1 rounded-full">
                            Dr. {record.medico}
                          </span>
                        )}
                        {record.tipoExamen && (
                          <span className="text-xs bg-purple-900/40 text-purple-300 px-2 py-1 rounded-full">
                            {record.tipoExamen}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {record.mdDx1 && (
                          <span className="text-amber-400">Dx1: {record.mdDx1}</span>
                        )}
                        {record.mdDx2 && (
                          <span className="text-amber-300">| Dx2: {record.mdDx2}</span>
                        )}
                      </div>
                      {record.mdConceptoFinal && (
                        <p className="text-sm text-gray-300 mt-1 truncate">
                          {record.mdConceptoFinal}
                        </p>
                      )}
                    </div>
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${
                        expandedRecord === record._id ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expanded Details */}
                  {expandedRecord === record._id && (
                    <div className="border-t border-gray-700 p-4 space-y-3 bg-[#232f36]">
                      {/* Medidas */}
                      {(record.talla || record.peso) && (
                        <div className="flex gap-4 text-sm">
                          {record.talla && (
                            <span className="text-gray-400">
                              Talla: <span className="text-white">{record.talla} cm</span>
                            </span>
                          )}
                          {record.peso && (
                            <span className="text-gray-400">
                              Peso: <span className="text-white">{record.peso} kg</span>
                            </span>
                          )}
                        </div>
                      )}

                      {/* Antecedentes */}
                      {record.mdAntecedentes && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Antecedentes</p>
                          <p className="text-sm text-white whitespace-pre-wrap bg-[#1f2c34] p-2 rounded">
                            {record.mdAntecedentes}
                          </p>
                        </div>
                      )}

                      {/* Observaciones del Certificado */}
                      {record.mdObservacionesCertificado && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Observaciones del Certificado</p>
                          <p className="text-sm text-white whitespace-pre-wrap bg-[#1f2c34] p-2 rounded">
                            {record.mdObservacionesCertificado}
                          </p>
                        </div>
                      )}

                      {/* Recomendaciones */}
                      {record.mdRecomendacionesMedicasAdicionales && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Recomendaciones Médicas</p>
                          <p className="text-sm text-white whitespace-pre-wrap bg-[#1f2c34] p-2 rounded">
                            {record.mdRecomendacionesMedicasAdicionales}
                          </p>
                        </div>
                      )}

                      {/* Concepto Final completo */}
                      {record.mdConceptoFinal && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Concepto Final</p>
                          <p className="text-sm text-[#00a884] font-medium">
                            {record.mdConceptoFinal}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 p-4">
          <button
            onClick={onClose}
            className="w-full bg-[#374045] text-white px-4 py-3 rounded-xl hover:bg-[#4a5459] transition font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

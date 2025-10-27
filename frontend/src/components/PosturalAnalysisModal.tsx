import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import { PosturalAnalysisCanvas } from './PosturalAnalysisCanvas';

interface PoseData {
  landmarks: any[];
  metrics: {
    posture: any;
    joints: any;
    symmetry: any;
  };
  timestamp: number;
}

interface CapturedSnapshot extends PoseData {
  description: string;
  canvasImage?: string; // Base64 image of the skeleton
}

interface PosturalAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomName: string;
  sessionActive: boolean;
  patientConnected: boolean;
  latestPoseData?: PoseData | null;
  hasReceivedFirstFrame?: boolean;
  onStartSession: () => void;
  onEndSession: () => void;
}

export const PosturalAnalysisModal: React.FC<PosturalAnalysisModalProps> = ({
  isOpen,
  onClose,
  roomName,
  sessionActive,
  patientConnected,
  latestPoseData,
  hasReceivedFirstFrame = false,
  onStartSession,
  onEndSession,
}) => {
  const [capturedSnapshots, setCapturedSnapshots] = useState<CapturedSnapshot[]>([]);
  const [snapshotDescription, setSnapshotDescription] = useState('');
  const [showCaptureDialog, setShowCaptureDialog] = useState(false);

  const handleOpenCaptureDialog = () => {
    if (!latestPoseData) {
      alert('No hay datos de pose disponibles para capturar');
      return;
    }
    setSnapshotDescription(`Ejercicio ${capturedSnapshots.length + 1}`);
    setShowCaptureDialog(true);
  };

  const handleCaptureSnapshot = () => {
    if (!latestPoseData) {
      alert('No hay datos de pose disponibles para capturar');
      return;
    }

    // Capturar imagen del canvas
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const canvasImage = canvas ? canvas.toDataURL('image/png') : undefined;

    const snapshot: CapturedSnapshot = {
      ...latestPoseData,
      description: snapshotDescription || `Ejercicio ${capturedSnapshots.length + 1}`,
      canvasImage,
    };

    setCapturedSnapshots((prev) => [...prev, snapshot]);
    console.log('[Capture] Snapshot captured:', snapshot);
    setShowCaptureDialog(false);
    setSnapshotDescription('');
  };

  const handleDeleteSnapshot = (index: number) => {
    setCapturedSnapshots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGeneratePDF = () => {
    if (capturedSnapshots.length === 0) {
      alert('No hay datos capturados para generar el PDF');
      return;
    }

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Title Page
      doc.setFontSize(24);
      doc.setTextColor(0, 0, 0);
      doc.text('Análisis Postural', pageWidth / 2, 30, { align: 'center' });

      doc.setFontSize(12);
      doc.text(`Sala: ${roomName}`, 20, 50);
      doc.text(`Fecha: ${new Date().toLocaleString('es-CO')}`, 20, 60);
      doc.text(`Snapshots capturados: ${capturedSnapshots.length}`, 20, 70);

      let yPosition = 90;

      // Add snapshots data
      capturedSnapshots.forEach((snapshot, index) => {
        // Nueva página para cada snapshot
        if (index > 0) {
          doc.addPage();
        }
        yPosition = 20;

        // Título del snapshot
        doc.setFontSize(18);
        doc.setTextColor(0, 100, 200);
        doc.text(`${snapshot.description}`, pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 10;

        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(`Capturado: ${new Date(snapshot.timestamp).toLocaleString('es-CO')}`, pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 15;

        // Agregar imagen del esqueleto si existe
        if (snapshot.canvasImage) {
          try {
            const imgWidth = 120;
            const imgHeight = 90;
            const imgX = (pageWidth - imgWidth) / 2;
            doc.addImage(snapshot.canvasImage, 'PNG', imgX, yPosition, imgWidth, imgHeight);
            yPosition += imgHeight + 10;
          } catch (err) {
            console.error('[PDF] Error adding image:', err);
          }
        }
        yPosition += 5;

        // Posture
        if (snapshot.metrics.posture) {
          doc.setFontSize(12);
          doc.setTextColor(50, 50, 50);
          doc.text('Postura:', 25, yPosition);
          yPosition += 7;

          doc.setFontSize(10);
          doc.text(`  Ángulo del Trunco: ${snapshot.metrics.posture.trunkAngle}°`, 30, yPosition);
          yPosition += 6;
          doc.text(`  Alineación: ${snapshot.metrics.posture.alignment}`, 30, yPosition);
          yPosition += 10;
        }

        // Joints
        if (snapshot.metrics.joints) {
          doc.setFontSize(12);
          doc.setTextColor(50, 50, 50);
          doc.text('Ángulos Articulares:', 25, yPosition);
          yPosition += 7;

          doc.setFontSize(10);
          doc.text(`  Codo Izquierdo: ${snapshot.metrics.joints.leftElbow}°`, 30, yPosition);
          yPosition += 6;
          doc.text(`  Codo Derecho: ${snapshot.metrics.joints.rightElbow}°`, 30, yPosition);
          yPosition += 6;
          doc.text(`  Rodilla Izquierda: ${snapshot.metrics.joints.leftKnee}°`, 30, yPosition);
          yPosition += 6;
          doc.text(`  Rodilla Derecha: ${snapshot.metrics.joints.rightKnee}°`, 30, yPosition);
          yPosition += 10;
        }

        // Symmetry
        if (snapshot.metrics.symmetry) {
          doc.setFontSize(12);
          doc.setTextColor(50, 50, 50);
          doc.text('Simetría Corporal:', 25, yPosition);
          yPosition += 7;

          doc.setFontSize(10);
          doc.text(`  Hombros: ${snapshot.metrics.symmetry.shoulders} (${snapshot.metrics.symmetry.shoulderDiff}%)`, 30, yPosition);
          yPosition += 6;
          doc.text(`  Caderas: ${snapshot.metrics.symmetry.hips} (${snapshot.metrics.symmetry.hipDiff}%)`, 30, yPosition);
          yPosition += 15;
        }
      });

      // Footer on last page
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(
          `BSL Consulta Video - Análisis Postural`,
          pageWidth / 2,
          pageHeight - 10,
          { align: 'center' }
        );
        doc.text(
          `Página ${i} de ${totalPages}`,
          pageWidth - 20,
          pageHeight - 10,
          { align: 'right' }
        );
      }

      // Save PDF
      const fileName = `analisis-postural-${roomName}-${Date.now()}.pdf`;
      doc.save(fileName);

      console.log('[PDF] Generated successfully:', fileName);
      alert(`PDF generado exitosamente: ${fileName}`);
    } catch (error) {
      console.error('[PDF] Error generating PDF:', error);
      alert('Error al generar el PDF. Ver consola para detalles.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 pointer-events-auto">
      <div className="bg-[#1a2730] rounded-lg shadow-2xl w-[90%] max-w-6xl h-[85vh] flex flex-col border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white">Análisis Postural</h2>
            <p className="text-sm text-gray-400 mt-1">Sala: {roomName}</p>
          </div>

          <div className="flex items-center gap-4">
            {/* Session Status */}
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  sessionActive ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
                }`}
              />
              <span className="text-sm text-gray-300">
                {sessionActive ? 'Sesión Activa' : 'Sesión Inactiva'}
              </span>
            </div>

            {/* Patient Status */}
            {sessionActive && (
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    patientConnected ? 'bg-blue-500 animate-pulse' : 'bg-yellow-500'
                  }`}
                />
                <span className="text-sm text-gray-300">
                  {patientConnected ? 'Paciente Conectado' : 'Esperando Paciente...'}
                </span>
              </div>
            )}

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
              aria-label="Cerrar"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left: Canvas/Visualization Area */}
          <div className="flex-1 bg-[#0b141a] relative p-4">
            {!sessionActive ? (
              // Not started state
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="mb-6">
                    <svg
                      className="w-24 h-24 mx-auto text-gray-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-xl text-gray-400 mb-2">Análisis Postural No Iniciado</h3>
                  <p className="text-sm text-gray-500 mb-6">
                    Haz clic en "Iniciar Análisis" para comenzar
                  </p>
                  <button
                    onClick={onStartSession}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Iniciar Análisis
                  </button>
                </div>
              </div>
            ) : !patientConnected ? (
              // Waiting for patient
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="mb-6">
                    <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  </div>
                  <h3 className="text-xl text-gray-400 mb-2">Esperando Paciente...</h3>
                  <p className="text-sm text-gray-500">
                    El paciente debe estar en la videollamada para continuar
                  </p>
                </div>
              </div>
            ) : !hasReceivedFirstFrame ? (
              // Waiting for first frame from patient
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="mb-6">
                    <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  </div>
                  <h3 className="text-xl text-gray-400 mb-2">Cargando Análisis...</h3>
                  <p className="text-sm text-gray-500 mb-2">
                    Esperando datos del paciente
                  </p>
                  <p className="text-xs text-gray-600">
                    El paciente está activando su cámara y cargando el modelo de IA
                  </p>
                </div>
              </div>
            ) : (
              // Active analysis - Show skeleton and pose data
              <PosturalAnalysisCanvas poseData={latestPoseData || null} />
            )}
          </div>

          {/* Right: Metrics and Controls */}
          <div className="w-full lg:w-80 bg-[#15202b] border-t lg:border-t-0 lg:border-l border-gray-700 flex flex-col">
            {/* Metrics Panel */}
            <div className="flex-1 overflow-y-auto p-4">
              <h3 className="text-lg font-semibold text-white mb-4">Métricas en Tiempo Real</h3>

              {sessionActive && patientConnected ? (
                <div className="space-y-4">
                  {/* Posture Metrics */}
                  <div className="bg-[#1a2730] rounded-lg p-4 border border-gray-700">
                    <p className="text-xs text-gray-500 uppercase mb-3">Postura</p>
                    {latestPoseData?.metrics?.posture ? (
                      <>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-gray-400">Ángulo del Tronco:</span>
                          <span className="text-lg font-semibold text-white">
                            {latestPoseData.metrics.posture.trunkAngle}°
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-400">Alineación:</span>
                          <span
                            className={`text-sm font-semibold ${
                              latestPoseData.metrics.posture.alignment === 'Buena'
                                ? 'text-green-400'
                                : 'text-yellow-400'
                            }`}
                          >
                            {latestPoseData.metrics.posture.alignment}
                          </span>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400">Esperando datos...</p>
                    )}
                  </div>

                  {/* Joint Angles */}
                  <div className="bg-[#1a2730] rounded-lg p-4 border border-gray-700">
                    <p className="text-xs text-gray-500 uppercase mb-3">Ángulos Articulares</p>
                    {latestPoseData?.metrics?.joints ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Codo Izq:</span>
                          <span className="text-white font-mono">
                            {latestPoseData.metrics.joints.leftElbow}°
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Codo Der:</span>
                          <span className="text-white font-mono">
                            {latestPoseData.metrics.joints.rightElbow}°
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Rodilla Izq:</span>
                          <span className="text-white font-mono">
                            {latestPoseData.metrics.joints.leftKnee}°
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Rodilla Der:</span>
                          <span className="text-white font-mono">
                            {latestPoseData.metrics.joints.rightKnee}°
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">Esperando datos...</p>
                    )}
                  </div>

                  {/* Symmetry Analysis */}
                  <div className="bg-[#1a2730] rounded-lg p-4 border border-gray-700">
                    <p className="text-xs text-gray-500 uppercase mb-3">Simetría Corporal</p>
                    {latestPoseData?.metrics?.symmetry ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400">Hombros:</span>
                          <span
                            className={`font-semibold ${
                              latestPoseData.metrics.symmetry.shoulders === 'Simétrico'
                                ? 'text-green-400'
                                : 'text-yellow-400'
                            }`}
                          >
                            {latestPoseData.metrics.symmetry.shoulders}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400">Diferencia:</span>
                          <span className="text-white font-mono">
                            {latestPoseData.metrics.symmetry.shoulderDiff}%
                          </span>
                        </div>
                        <div className="flex justify-between items-center mt-3">
                          <span className="text-gray-400">Caderas:</span>
                          <span
                            className={`font-semibold ${
                              latestPoseData.metrics.symmetry.hips === 'Simétrico'
                                ? 'text-green-400'
                                : 'text-yellow-400'
                            }`}
                          >
                            {latestPoseData.metrics.symmetry.hips}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400">Diferencia:</span>
                          <span className="text-white font-mono">
                            {latestPoseData.metrics.symmetry.hipDiff}%
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">Esperando datos...</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">
                    Las métricas aparecerán aquí cuando el análisis esté activo
                  </p>
                </div>
              )}
            </div>

            {/* Captured Snapshots List */}
            {capturedSnapshots.length > 0 && (
              <div className="p-4 border-t border-gray-700 max-h-48 overflow-y-auto">
                <h4 className="text-sm font-semibold text-gray-400 mb-3">Snapshots Capturados ({capturedSnapshots.length})</h4>
                <div className="space-y-2">
                  {capturedSnapshots.map((snapshot, index) => (
                    <div key={index} className="flex items-center gap-3 bg-[#1a2730] p-2 rounded-lg border border-gray-700">
                      {/* Miniatura */}
                      {snapshot.canvasImage && (
                        <img
                          src={snapshot.canvasImage}
                          alt={snapshot.description}
                          className="w-16 h-12 object-cover rounded border border-gray-600"
                        />
                      )}
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{snapshot.description}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(snapshot.timestamp).toLocaleTimeString('es-CO')}
                        </p>
                      </div>
                      {/* Delete button */}
                      <button
                        onClick={() => handleDeleteSnapshot(index)}
                        className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
                        title="Eliminar"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Control Buttons */}
            <div className="p-4 border-t border-gray-700 space-y-3">
              {sessionActive && patientConnected && (
                <>
                  <button
                    onClick={handleOpenCaptureDialog}
                    disabled={!latestPoseData}
                    className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Capturar Snapshot ({capturedSnapshots.length})
                  </button>

                  <button
                    onClick={handleGeneratePDF}
                    disabled={capturedSnapshots.length === 0}
                    className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    Generar PDF
                  </button>
                </>
              )}

              {sessionActive && (
                <button
                  onClick={onEndSession}
                  className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                >
                  Finalizar Análisis
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-700 bg-[#15202b]">
          <p className="text-xs text-gray-500 text-center">
            El análisis postural se realiza en tiempo real mientras la videollamada continúa
          </p>
        </div>
      </div>

      {/* Capture Snapshot Dialog */}
      {showCaptureDialog && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
          <div className="bg-[#1a2730] rounded-lg shadow-2xl p-6 max-w-md w-full mx-4 border border-gray-700">
            <h3 className="text-xl font-semibold text-white mb-4">Capturar Snapshot</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Nombre del ejercicio o postura:
              </label>
              <input
                type="text"
                value={snapshotDescription}
                onChange={(e) => setSnapshotDescription(e.target.value)}
                placeholder="Ej: Brazos levantados, Inclinación lateral..."
                className="w-full px-3 py-2 bg-[#0b141a] border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                autoFocus
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleCaptureSnapshot();
                  }
                }}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCaptureDialog(false)}
                className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCaptureSnapshot}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
              >
                Capturar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

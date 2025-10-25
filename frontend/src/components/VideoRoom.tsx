import { useState } from 'react';
import { useVideoRoom } from '../hooks/useVideoRoom';
import { useBackgroundEffects } from '../hooks/useBackgroundEffects';
import { usePosturalAnalysis } from '../hooks/usePosturalAnalysis';
import { Participant } from './Participant';
import { VideoControls } from './VideoControls';
import { PosturalAnalysisModal } from './PosturalAnalysisModal';
import { PosturalAnalysisPatient } from './PosturalAnalysisPatient';
import { MedicalHistoryPanel } from './MedicalHistoryPanel';

interface VideoRoomProps {
  identity: string;
  roomName: string;
  role?: 'doctor' | 'patient';
  historiaId?: string; // ID de la historia clínica
  onLeave?: () => void;
}

export const VideoRoom = ({ identity, roomName, role, historiaId, onLeave }: VideoRoomProps) => {
  const [isPosturalAnalysisOpen, setIsPosturalAnalysisOpen] = useState(false);

  const {
    localParticipant,
    remoteParticipants,
    isConnecting,
    isConnected,
    error,
    connectToRoom,
    disconnectFromRoom,
    toggleAudio,
    toggleVideo,
    isAudioEnabled,
    isVideoEnabled,
    localVideoTrack,
  } = useVideoRoom({ identity, roomName, role });

  const {
    currentEffect,
    isProcessing,
    applyBlur,
    applyVirtualBackground,
    removeEffect,
  } = useBackgroundEffects();

  // Initialize postural analysis
  // El hook siempre está enabled para que Socket.io esté listo
  // Pero el componente del paciente solo se muestra cuando sessionActive es true Y el doctor ha iniciado
  const posturalAnalysis = usePosturalAnalysis({
    roomName,
    doctorIdentity: identity,
    role: role || 'patient',
    enabled: true, // Siempre enabled para mantener conexión Socket.io
  });

  const {
    sessionActive,
    patientConnected,
    latestPoseData,
    startSession,
    endSession,
    sendPoseData,
  } = posturalAnalysis;

  const handleLeave = () => {
    disconnectFromRoom();
    onLeave?.();
  };

  const handleApplyBlur = () => {
    if (localVideoTrack) {
      applyBlur(localVideoTrack);
    }
  };

  const handleApplyVirtualBackground = (imageUrl: string) => {
    if (localVideoTrack) {
      applyVirtualBackground(localVideoTrack, imageUrl);
    }
  };

  const handleRemoveEffect = () => {
    if (localVideoTrack) {
      removeEffect(localVideoTrack);
    }
  };

  const handleOpenPosturalAnalysis = () => {
    setIsPosturalAnalysisOpen(true);
  };

  const handleClosePosturalAnalysis = () => {
    if (sessionActive) {
      endSession();
    }
    setIsPosturalAnalysisOpen(false);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-[#0b141a] flex items-center justify-center p-4">
        <div className="bg-[#1f2c34] rounded-3xl shadow-2xl p-8 sm:p-10 max-w-md w-full">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-white mb-3">Error de Conexión</h2>
            <p className="text-gray-400 mb-8">{error}</p>
            <button
              onClick={connectToRoom}
              className="w-full bg-[#00a884] text-white px-6 py-3 rounded-xl hover:bg-[#008f6f] transition font-semibold"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#0b141a] flex items-center justify-center p-4">
        <div className="bg-[#1f2c34] rounded-3xl shadow-2xl p-8 sm:p-10 max-w-md w-full">
          <div className="text-center">
            {/* Logo BSL */}
            <div className="flex justify-center mb-6">
              <img
                src="/logoBlanco.png"
                alt="BSL Logo"
                className="h-20 w-auto"
              />
            </div>

            <h2 className="text-2xl sm:text-3xl font-semibold text-white mb-6">Consulta Video</h2>

            {/* Info de la sala y usuario */}
            <div className="space-y-3 mb-8">
              <div className="bg-[#2a3942] rounded-xl px-4 py-3 text-left">
                <p className="text-xs text-gray-400 mb-1">Sala</p>
                <p className="text-white font-medium">{roomName}</p>
              </div>
              <div className="bg-[#2a3942] rounded-xl px-4 py-3 text-left">
                <p className="text-xs text-gray-400 mb-1">Usuario</p>
                <p className="text-white font-medium">{identity}</p>
              </div>
            </div>

            {/* Botón de unirse */}
            <button
              onClick={connectToRoom}
              disabled={isConnecting}
              className="w-full bg-[#00a884] text-white px-6 py-3.5 rounded-xl hover:bg-[#008f6f] transition disabled:bg-gray-600 disabled:cursor-not-allowed font-semibold shadow-lg"
            >
              {isConnecting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Conectando...
                </span>
              ) : (
                'Unirse a la Llamada'
              )}
            </button>

            {/* Footer con icono de seguridad */}
            <div className="mt-6 pt-6 border-t border-gray-700">
              <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Conexión segura end-to-end</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const remoteParticipantArray = Array.from(remoteParticipants.values());

  return (
    <div className="min-h-screen bg-[#0b141a] flex">
      {/* Panel lateral de Historia Clínica - Siempre visible para doctores */}
      {role === 'doctor' && historiaId && (
        <div
          className="fixed top-0 right-0 h-full bg-[#1f2c34] shadow-2xl z-50"
          style={{ width: '450px', maxWidth: '90vw' }}
        >
          <MedicalHistoryPanel historiaId={historiaId} />
        </div>
      )}

      {/* Contenedor principal de la videollamada */}
      <div className="flex-1 flex flex-col">
      {/* Header tipo WhatsApp */}
      <div className="bg-[#1f2c34] px-4 py-3 flex items-center justify-between shadow-lg">
        {/* Back button */}
        <button
          onClick={handleLeave}
          className="text-white p-2 hover:bg-white/10 rounded-full transition"
          aria-label="Volver"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Logo + Encryption badge */}
        <div className="flex-1 flex items-center justify-center gap-2">
          <img src="/logoBlanco.png" alt="BSL" className="h-8 w-auto" />
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>End-to-end Encrypted</span>
          </div>
        </div>

        {/* Info button */}
        <button
          className="text-white p-2 hover:bg-white/10 rounded-full transition"
          aria-label="Información"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>

      {/* Video Grid - Full screen with better mobile layout */}
      <div className="flex-1 relative overflow-hidden bg-[#0b141a]">
        {/* Remote participant (large) - ocupa TODO el espacio disponible */}
        {remoteParticipantArray.length > 0 ? (
          <div className="absolute inset-0 w-full h-full">
            <Participant participant={remoteParticipantArray[0]} />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0b141a]">
            <div className="text-center">
              <img src="/logoBlanco.png" alt="BSL" className="h-16 w-auto mx-auto mb-4 opacity-50" />
              <p className="text-gray-500">Esperando participantes...</p>
            </div>
          </div>
        )}

        {/* Local participant (floating) - MÁS GRANDE en móvil */}
        {localParticipant && (
          <div className="absolute top-3 right-3 w-36 h-48 sm:w-40 sm:h-56 md:w-32 md:h-48 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/30 z-10">
            <Participant participant={localParticipant} isLocal={true} />
          </div>
        )}

        {/* Additional remote participants (if more than 1) */}
        {remoteParticipantArray.length > 1 && (
          <div className="absolute bottom-24 left-0 right-0 px-4 z-10">
            <div className="flex gap-2 justify-center overflow-x-auto pb-2">
              {remoteParticipantArray.slice(1).map((participant) => (
                <div key={participant.sid} className="w-24 h-32 rounded-lg overflow-hidden flex-shrink-0 border-2 border-gray-700">
                  <Participant participant={participant} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Controls tipo WhatsApp */}
      <VideoControls
        isAudioEnabled={isAudioEnabled}
        isVideoEnabled={isVideoEnabled}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onLeave={handleLeave}
        showBackgroundControls={role === 'doctor' && !!localVideoTrack}
        onApplyBlur={handleApplyBlur}
        onApplyVirtualBackground={handleApplyVirtualBackground}
        onRemoveEffect={handleRemoveEffect}
        isProcessingBackground={isProcessing}
        currentBackgroundEffect={currentEffect}
        showPosturalAnalysis={role === 'doctor'}
        onOpenPosturalAnalysis={handleOpenPosturalAnalysis}
      />

      {/* Postural Analysis Modal - Only for doctors */}
      {role === 'doctor' && (
        <PosturalAnalysisModal
          isOpen={isPosturalAnalysisOpen}
          onClose={handleClosePosturalAnalysis}
          roomName={roomName}
          sessionActive={sessionActive}
          patientConnected={patientConnected}
          latestPoseData={latestPoseData}
          onStartSession={startSession}
          onEndSession={endSession}
        />
      )}

      {/* Postural Analysis Patient - Auto-activates when doctor starts session */}
      {role === 'patient' && sessionActive && (
        <PosturalAnalysisPatient
          onPoseData={sendPoseData}
          isActive={sessionActive}
        />
      )}
      </div>
      {/* Cierre del contenedor principal de videollamada */}
    </div>
    // Cierre del contenedor flex principal
  );
};

import { useState, useEffect, useCallback } from 'react';
import apiService from '../services/api.service';
import type { VideoEngine, NormalizedParticipant, LocalVideoHandle } from '../video/video-engine';

interface UseVideoRoomOptions {
  identity: string;
  roomName: string;
  role?: 'doctor' | 'patient';
  documento?: string;
  medicoCode?: string;
  historiaId?: string;
}

interface UseVideoRoomReturn {
  /** Provider-agnostic handle (Twilio or Chime engine). Also used directly by
   *  MedicalHistoryPanel/useConsultationRecorder to source recorder audio. */
  room: VideoEngine | null;
  localParticipant: NormalizedParticipant | null;
  remoteParticipants: Map<string, NormalizedParticipant>;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  connectToRoom: () => Promise<void>;
  disconnectFromRoom: () => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  localVideoTrack: LocalVideoHandle | null;
}

// Helper function para reproducir sonido de notificación
const playNotificationSound = () => {
  try {
    // Crear un contexto de audio
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Configurar el sonido: tono de notificación agradable
    oscillator.frequency.value = 800; // Frecuencia en Hz
    oscillator.type = 'sine'; // Tipo de onda

    // Configurar volumen con fade
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    // Reproducir
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);

    console.log('🔔 Notification sound played');
  } catch (error) {
    console.error('Error playing notification sound:', error);
  }
};

// Helper function para text-to-speech
const speakText = (text: string) => {
  try {
    if ('speechSynthesis' in window) {
      // Cancelar cualquier speech en progreso
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES'; // Español
      utterance.rate = 1.0; // Velocidad normal
      utterance.pitch = 1.0; // Tono normal
      utterance.volume = 1.0; // Volumen máximo

      // Primero reproducir el sonido de notificación
      playNotificationSound();

      // Luego hablar el texto
      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
        console.log('🔊 Speaking:', text);
      }, 600); // Esperar a que termine el sonido
    } else {
      console.warn('speechSynthesis no está disponible en este navegador');
      // Si no hay speech synthesis, al menos reproducir el sonido
      playNotificationSound();
    }
  } catch (error) {
    console.error('Error in speakText:', error);
  }
};

export const useVideoRoom = ({
  identity,
  roomName,
  role,
  documento,
  medicoCode,
  historiaId,
}: UseVideoRoomOptions): UseVideoRoomReturn => {
  const [room, setRoom] = useState<VideoEngine | null>(null);
  const [localParticipant, setLocalParticipant] = useState<NormalizedParticipant | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string, NormalizedParticipant>>(
    new Map()
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [localVideoTrack, setLocalVideoTrack] = useState<LocalVideoHandle | null>(null);

  const connectToRoom = useCallback(async () => {
    try {
      setIsConnecting(true);
      setError(null);

      // El backend decide el provider (Twilio o Chime) vía VIDEO_PROVIDER.
      const joinInfo = await apiService.getVideoJoinInfo(identity, roomName, role);

      // Cargar el engine correspondiente de forma dinámica: evita empaquetar
      // amazon-chime-sdk-js (pesado) para despliegues que sólo usan Twilio, y
      // viceversa.
      const engine: VideoEngine =
        joinInfo.provider === 'chime'
          ? new (await import('../video/chime-engine')).ChimeVideoEngine()
          : new (await import('../video/twilio-engine')).TwilioVideoEngine();

      const { localParticipant: lp, remoteParticipants: initialRemotes } = await engine.connect(joinInfo);

      setRoom(engine);
      setLocalParticipant(lp);
      setIsConnected(true);
      setLocalVideoTrack(engine.getLocalVideoHandle());
      setRemoteParticipants(new Map(initialRemotes.map((p) => [p.sid, p])));

      // Registrar conexión para reportes (si se proporcionó rol)
      if (role) {
        try {
          await apiService.trackParticipantConnected(roomName, identity, role, documento, medicoCode, historiaId);
        } catch (err) {
          console.error('Error tracking participant connection:', err);
        }
      }

      // Escuchar eventos de participantes
      engine.onParticipantConnected((participant) => {
        console.log(`Participant connected: ${participant.identity}`);
        setRemoteParticipants((prev) => new Map(prev).set(participant.sid, participant));

        // Anunciar con voz cuando un paciente se conecta (solo para doctores)
        if (role === 'doctor') {
          speakText(`Paciente ${participant.identity} conectado`);
        }
      });

      engine.onParticipantDisconnected((sid) => {
        console.log(`Participant disconnected: ${sid}`);
        setRemoteParticipants((prev) => {
          const newMap = new Map(prev);
          newMap.delete(sid);
          return newMap;
        });
      });

      // Escuchar desconexión
      engine.onDisconnected(() => {
        console.log('Disconnected from room');
        setIsConnected(false);
        setRoom(null);
        setLocalParticipant(null);
        setRemoteParticipants(new Map());
      });

      console.log(`Successfully connected to room: ${roomName}`);
    } catch (err: any) {
      console.error('Error connecting to room:', err);
      // Detectar error 403 (sala completada)
      if (err?.response?.status === 403) {
        setError(err.response.data?.message || 'Esta videollamada ya finalizó y no se puede volver a ingresar.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to connect to room');
      }
    } finally {
      setIsConnecting(false);
    }
  }, [identity, roomName, role]);

  const disconnectFromRoom = useCallback(() => {
    if (room) {
      // Registrar desconexión para reportes (si se proporcionó rol)
      if (role) {
        try {
          apiService.trackParticipantDisconnected(roomName, identity);
        } catch (err) {
          console.error('Error tracking participant disconnection:', err);
        }
      }

      room.disconnect();
      setRoom(null);
      setLocalParticipant(null);
      setRemoteParticipants(new Map());
      setIsConnected(false);
    }
  }, [room, role, roomName, identity]);

  const toggleAudio = useCallback(() => {
    if (room) {
      setIsAudioEnabled(room.toggleAudio());
    }
  }, [room]);

  const toggleVideo = useCallback(() => {
    if (room) {
      setIsVideoEnabled(room.toggleVideo());
    }
  }, [room]);

  // Cleanup on unmount or window close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (room && role) {
        // Usar sendBeacon para asegurar que la solicitud se envíe incluso si la ventana se cierra
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
        const url = `${apiBaseUrl}/api/video/events/participant-disconnected`;
        const data = JSON.stringify({ roomName, identity });

        // sendBeacon es síncrono y garantiza que se envíe
        navigator.sendBeacon(url, new Blob([data], { type: 'application/json' }));

        room.disconnect();
      }
    };

    // Agregar listener para cierre de ventana
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);

      if (room) {
        // Registrar desconexión para reportes (si se proporcionó rol)
        if (role) {
          try {
            apiService.trackParticipantDisconnected(roomName, identity);
          } catch (err) {
            console.error('Error tracking participant disconnection:', err);
          }
        }
        room.disconnect();
      }
    };
  }, [room, role, roomName, identity]);

  return {
    room,
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
  };
};

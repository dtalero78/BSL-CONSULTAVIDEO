import { useCallback, useEffect, useRef, useState } from 'react';
import type { VideoEngine } from '../video/video-engine';
import apiService from '../services/api.service';

export interface TranscriptionResult {
  transcript: string;
  fields: Record<string, string>;
}

interface UseConsultationRecorderReturn {
  isRecording: boolean;
  isProcessing: boolean;
  error: string | null;
  seconds: number;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<TranscriptionResult | null>;
}

/**
 * Graba el audio de la consulta directamente en el navegador del médico:
 * mezcla el micrófono local + el audio remoto del paciente (Web Audio API)
 * en un único stream y lo captura con MediaRecorder. Al detener, sube el
 * audio completo al backend para transcribirlo (Whisper) y extraer campos
 * clínicos (GPT). Procesa al final, en un solo envío.
 *
 * Requiere una videollamada activa (`room`, el engine de video provider-agnostic
 * devuelto por `useVideoRoom`) para tener acceso a los tracks de audio local y
 * remoto — funciona igual con el provider Twilio o Chime.
 */
export function useConsultationRecorder(
  room: VideoEngine | null,
  historiaId?: string
): UseConsultationRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeTypeRef = useRef<string>('audio/webm');

  /** Recolecta los MediaStreamTrack de audio (local + remotos) de la sala. */
  const collectAudioTracks = useCallback((): MediaStreamTrack[] => {
    if (!room) return [];
    return [...room.getLocalAudioTracks(), ...room.getRemoteAudioTracks()];
  }, [room]);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);

    if (!room) {
      setError('No hay una videollamada activa para grabar.');
      return;
    }

    const tracks = collectAudioTracks();
    if (tracks.length === 0) {
      setError('No se detectó audio (micrófono/paciente) para grabar.');
      return;
    }

    try {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      // El click del botón es un gesto de usuario → permite resume().
      await ctx.resume();

      const destination = ctx.createMediaStreamDestination();
      tracks.forEach((track) => {
        const source = ctx.createMediaStreamSource(new MediaStream([track]));
        source.connect(destination);
      });

      // Elegir un mimeType soportado por el navegador.
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const supported = candidates.find(
        (c) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)
      );
      mimeTypeRef.current = supported || 'audio/webm';

      const recorder = new MediaRecorder(
        destination.stream,
        supported ? { mimeType: supported } : undefined
      );
      chunksRef.current = [];
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(1000); // junta datos cada 1s (robusto ante grabaciones largas)

      recorderRef.current = recorder;
      audioCtxRef.current = ctx;
      setIsRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err: unknown) {
      console.error('[ConsultationRecorder] Error iniciando grabación:', err);
      setError('No se pudo iniciar la grabación.');
      cleanup();
    }
  }, [room, collectAudioTracks, cleanup]);

  const stopRecording = useCallback(async (): Promise<TranscriptionResult | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return null;

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: mimeTypeRef.current }));
      try {
        recorder.stop();
      } catch {
        resolve(new Blob(chunksRef.current, { type: mimeTypeRef.current }));
      }
    });

    setIsRecording(false);
    cleanup();
    recorderRef.current = null;

    if (!historiaId) {
      setError('Falta el ID de la historia clínica.');
      return null;
    }
    if (blob.size === 0) {
      setError('La grabación quedó vacía.');
      return null;
    }

    try {
      setIsProcessing(true);
      setError(null);
      const result = await apiService.transcribeConsulta(historiaId, blob);
      return result;
    } catch (err: unknown) {
      console.error('[ConsultationRecorder] Error al transcribir:', err);
      setError('Error al transcribir la grabación. Intenta de nuevo.');
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [historiaId, cleanup]);

  // Limpiar al desmontar (ej. el médico cierra la sala mientras graba).
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {
          /* noop */
        }
      }
      cleanup();
    };
  }, [cleanup]);

  return { isRecording, isProcessing, error, seconds, startRecording, stopRecording };
}

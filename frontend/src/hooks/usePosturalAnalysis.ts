import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface PoseData {
  landmarks: any[];
  metrics: {
    posture: any;
    joints: any;
    symmetry: any;
  };
  timestamp: number;
}

interface UsePosturalAnalysisProps {
  roomName: string;
  doctorIdentity: string;
  role: 'doctor' | 'patient';
  enabled: boolean;
}

interface UsePosturalAnalysisReturn {
  isConnected: boolean;
  sessionActive: boolean;
  patientConnected: boolean;
  latestPoseData: PoseData | null;
  hasReceivedFirstFrame: boolean;
  error: string | null;
  startSession: () => void;
  endSession: () => void;
  sendPoseData: (poseData: PoseData) => void;
}

const SEND_INTERVAL_MS = 160;

const round = (n: unknown, decimals: number) =>
  typeof n === 'number' ? Number(n.toFixed(decimals)) : n;

// Reduce el tamaño de cada cuadro (~4 KB → ~1,5 KB) sin cambiar lo que se ve ni las métricas.
const compactPoseData = (poseData: PoseData): PoseData => ({
  ...poseData,
  timestamp: Math.round(poseData.timestamp),
  landmarks: (poseData.landmarks || []).map((l: any) => ({
    x: round(l?.x, 4),
    y: round(l?.y, 4),
    z: round(l?.z, 4),
    visibility: round(l?.visibility, 3),
  })),
});

export const usePosturalAnalysis = ({
  roomName,
  doctorIdentity,
  role,
  enabled,
}: UsePosturalAnalysisProps): UsePosturalAnalysisReturn => {
  const [isConnected, setIsConnected] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [patientConnected, setPatientConnected] = useState(false);
  const [latestPoseData, setLatestPoseData] = useState<PoseData | null>(null);
  const [hasReceivedFirstFrame, setHasReceivedFirstFrame] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  // Refleja sessionActive sin esperar al render: los cuadros que llegan después de finalizar se ignoran.
  const sessionActiveRef = useRef(false);
  const lastSentAtRef = useRef(0);

  // Initialize Socket.io connection
  useEffect(() => {
    if (!enabled) return;

    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
    // En desarrollo, si no hay apiBaseUrl, usar localhost:3000
    const socketUrl = apiBaseUrl || (import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin);

    console.log('[Postural Analysis] Connecting to Socket.io:', socketUrl);

    const socket = io(`${socketUrl}/telemedicine`, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('[Postural Analysis] Connected to Socket.io');
      setIsConnected(true);
      setError(null);
    });

    socket.on('disconnect', () => {
      console.log('[Postural Analysis] Disconnected from Socket.io');
      setIsConnected(false);
      sessionActiveRef.current = false;
      setSessionActive(false);
    });

    socket.on('connect_error', (err) => {
      console.error('[Postural Analysis] Connection error:', err);
      setError('Error connecting to telemedicine service');
    });

    // Session events
    socket.on('session-created', (data: { roomName: string; sessionCode: string; patientConnected: boolean }) => {
      console.log('[Postural Analysis] Session created:', data);
      sessionActiveRef.current = true;
      setSessionActive(true);
      setPatientConnected(data.patientConnected);
    });

    socket.on('session-joined', (data: { roomName: string; doctorIdentity: string }) => {
      console.log('[Postural Analysis] Session joined:', data);
      // NO marcar como activa aquí - solo cuando el doctor inicia (patient-connected event)
      // El paciente espera a que el doctor active la sesión
    });

    socket.on('patient-connected', (data: { patientIdentity: string }) => {
      console.log('[Postural Analysis] Patient connected:', data);
      setPatientConnected(true);
    });

    socket.on('session-activated-by-doctor', (data: { doctorIdentity: string }) => {
      console.log('[Postural Analysis] Session activated by doctor:', data);
      // El doctor inició la sesión, ahora el paciente puede activar su overlay
      sessionActiveRef.current = true;
      setSessionActive(true);
    });

    socket.on('patient-disconnected', () => {
      console.log('[Postural Analysis] Patient disconnected');
      setPatientConnected(false);
    });

    socket.on('session-ended', (data: { roomName: string }) => {
      console.log('[Postural Analysis] Session ended:', data);
      sessionActiveRef.current = false;
      setSessionActive(false);
      setPatientConnected(false);
    });

    // Pose data events (for doctor)
    if (role === 'doctor') {
      socket.on('pose-data-update', (poseData: PoseData) => {
        // Cuadros rezagados que llegan después de "Finalizar" no deben seguir redibujando la pantalla.
        if (!sessionActiveRef.current) return;
        setLatestPoseData(poseData);
        setHasReceivedFirstFrame(true);
      });
    }

    // Error events
    socket.on('session-error', (data: { message: string }) => {
      console.error('[Postural Analysis] Session error:', data);
      setError(data.message);
    });

    socket.on('join-error', (data: { message: string }) => {
      console.error('[Postural Analysis] Join error:', data);
      setError(data.message);
    });

    // Cleanup
    return () => {
      console.log('[Postural Analysis] Cleaning up Socket.io connection');
      socket.disconnect();
    };
  }, [enabled, role]);

  // Start session (doctor creates session)
  const startSession = useCallback(() => {
    if (!socketRef.current || !isConnected) {
      console.warn('[Postural Analysis] ⚠️ Cannot start session: not connected');
      return;
    }

    console.log('[Postural Analysis] ✅ Starting session:', roomName);
    // Reset first frame flag when starting new session
    setHasReceivedFirstFrame(false);
    socketRef.current.emit('create-analysis-session', {
      roomName,
      doctorIdentity,
    });
  }, [isConnected, roomName, doctorIdentity]);

  // End session
  const endSession = useCallback(() => {
    if (!socketRef.current || !isConnected) {
      console.warn('[Postural Analysis] Cannot end session: not connected');
      return;
    }

    console.log('[Postural Analysis] Ending session:', roomName);
    sessionActiveRef.current = false;
    socketRef.current.emit('end-analysis-session', { roomName });
    setSessionActive(false);
    setPatientConnected(false);
    setLatestPoseData(null);
    setHasReceivedFirstFrame(false);
  }, [isConnected, roomName]);

  // Send pose data (patient sends data)
  const sendPoseData = useCallback(
    (poseData: PoseData) => {
      if (!socketRef.current || !isConnected || !sessionActive) {
        return;
      }

      // Máximo ~6 cuadros por segundo: suficiente para ver el esqueleto en vivo y deja ancho de banda
      // para el video. Antes iban 15/s con números de 17 decimales y, con internet lento, se encolaban.
      const now = Date.now();
      if (now - lastSentAtRef.current < SEND_INTERVAL_MS) return;
      lastSentAtRef.current = now;

      // volatile: si la conexión está ocupada, se descarta el cuadro en vez de acumularlo.
      socketRef.current.volatile.emit('pose-data', {
        roomName,
        poseData: compactPoseData(poseData),
      });
    },
    [isConnected, sessionActive, roomName]
  );

  useEffect(() => {
    sessionActiveRef.current = sessionActive;
  }, [sessionActive]);

  // Auto-join session for patient when enabled
  useEffect(() => {
    if (!enabled || !isConnected || role !== 'patient') return;

    // Patient should try to join immediately when connected
    console.log('[Postural Analysis] Patient attempting to join session:', roomName);
    socketRef.current?.emit('join-analysis-session', {
      roomName,
      patientIdentity: 'Patient', // Can be customized later
    });
  }, [enabled, isConnected, role, roomName]);

  return {
    isConnected,
    sessionActive,
    patientConnected,
    latestPoseData,
    hasReceivedFirstFrame,
    error,
    startSession,
    endSession,
    sendPoseData,
  };
};

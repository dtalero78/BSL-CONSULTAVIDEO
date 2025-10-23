import React, { useEffect, useRef, useState } from 'react';
import { createPoseLandmarker, calculateMetrics } from '../utils/mediapipe-loader';

interface PosturalAnalysisPatientProps {
  onPoseData: (data: any) => void;
  isActive: boolean;
}

export const PosturalAnalysisPatient: React.FC<PosturalAnalysisPatientProps> = ({
  onPoseData,
  isActive,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<string>('Inicializando...');
  const [isProcessing, setIsProcessing] = useState(false);
  const poseLandmarkerRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize camera and MediaPipe
  useEffect(() => {
    if (!isActive) return;

    let isMounted = true;

    const initializeAnalysis = async () => {
      try {
        setStatus('Accediendo a cámara...');

        // Get camera stream
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setStatus('Cargando modelo de análisis...');

        // Initialize MediaPipe PoseLandmarker
        const poseLandmarker = await createPoseLandmarker();

        if (!isMounted) {
          poseLandmarker.close();
          return;
        }

        poseLandmarkerRef.current = poseLandmarker;

        setStatus('Analizando postura...');
        setIsProcessing(true);

        // Start pose detection loop
        startPoseDetection();
      } catch (error) {
        console.error('[Postural Analysis Patient] Initialization error:', error);
        setStatus('Error: No se pudo acceder a la cámara');
      }
    };

    initializeAnalysis();

    // Cleanup
    return () => {
      isMounted = false;
      cleanup();
    };
  }, [isActive]);

  const startPoseDetection = () => {
    if (!videoRef.current || !canvasRef.current || !poseLandmarkerRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Set canvas size to match video
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    let lastProcessTime = 0;
    const processingInterval = 1000 / 15; // 15 FPS

    const detectPose = () => {
      const now = performance.now();

      if (now - lastProcessTime < processingInterval) {
        animationFrameRef.current = requestAnimationFrame(detectPose);
        return;
      }

      lastProcessTime = now;

      if (video.readyState >= 2) {
        try {
          // Detect pose
          const result = poseLandmarkerRef.current.detectForVideo(video, now);

          // Clear canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Draw video frame
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          // Draw landmarks if detected
          if (result.landmarks && result.landmarks.length > 0) {
            const landmarks = result.landmarks[0];

            // Draw skeleton
            drawSkeleton(ctx, landmarks, canvas.width, canvas.height);

            // Calculate metrics
            const metrics = calculateMetrics(landmarks);

            // Send data via Socket.io
            onPoseData({
              landmarks,
              metrics,
              timestamp: now,
            });
          }
        } catch (error) {
          console.error('[Postural Analysis Patient] Detection error:', error);
        }
      }

      animationFrameRef.current = requestAnimationFrame(detectPose);
    };

    detectPose();
  };

  const drawSkeleton = (
    ctx: CanvasRenderingContext2D,
    landmarks: any[],
    width: number,
    height: number
  ) => {
    // Draw connections
    const connections = [
      [11, 12], // Shoulders
      [11, 13], // Left arm
      [13, 15], // Left forearm
      [12, 14], // Right arm
      [14, 16], // Right forearm
      [11, 23], // Left torso
      [12, 24], // Right torso
      [23, 24], // Hips
      [23, 25], // Left thigh
      [25, 27], // Left shin
      [24, 26], // Right thigh
      [26, 28], // Right shin
    ];

    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;

    connections.forEach(([start, end]) => {
      const startPoint = landmarks[start];
      const endPoint = landmarks[end];

      if (startPoint && endPoint) {
        ctx.beginPath();
        ctx.moveTo(startPoint.x * width, startPoint.y * height);
        ctx.lineTo(endPoint.x * width, endPoint.y * height);
        ctx.stroke();
      }
    });

    // Draw landmarks
    ctx.fillStyle = '#ff0000';
    landmarks.forEach((landmark) => {
      ctx.beginPath();
      ctx.arc(landmark.x * width, landmark.y * height, 4, 0, 2 * Math.PI);
      ctx.fill();
    });
  };

  const cleanup = () => {
    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Stop camera stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    // Close pose landmarker
    if (poseLandmarkerRef.current) {
      poseLandmarkerRef.current.close();
    }

    setIsProcessing(false);
  };

  if (!isActive) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center">
      <div className="bg-[#1a2730] rounded-lg shadow-2xl p-6 max-w-4xl w-full mx-4">
        {/* Header */}
        <div className="mb-4">
          <h3 className="text-xl font-semibold text-white mb-2">Análisis Postural del Paciente</h3>
          <div className="flex items-center gap-2">
            {isProcessing ? (
              <>
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-gray-300">{status}</span>
              </>
            ) : (
              <>
                <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-gray-300">{status}</span>
              </>
            )}
          </div>
        </div>

        {/* Video and Canvas */}
        <div className="relative bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            className="hidden"
            playsInline
            muted
            autoPlay
          />
          <canvas
            ref={canvasRef}
            className="w-full h-auto"
          />
        </div>

        {/* Instructions */}
        <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-sm text-blue-300 text-center">
            Manténgase de pie frente a la cámara. El doctor está visualizando su postura en tiempo
            real.
          </p>
        </div>
      </div>
    </div>
  );
};

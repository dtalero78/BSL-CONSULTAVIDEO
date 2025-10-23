// MediaPipe Pose Landmarker loader
// Uses CDN for MediaPipe Vision tasks

interface MediaPipeVision {
  PoseLandmarker: any;
  FilesetResolver: any;
}

let mediapipePromise: Promise<MediaPipeVision> | null = null;

/**
 * Loads MediaPipe Vision tasks from CDN
 * Returns cached promise on subsequent calls
 */
export async function loadMediaPipe(): Promise<MediaPipeVision> {
  if (mediapipePromise) {
    console.log('[MediaPipe] Returning cached MediaPipe instance');
    return mediapipePromise;
  }

  console.log('[MediaPipe] Loading MediaPipe from CDN...');

  mediapipePromise = (async () => {
    try {
      // Import MediaPipe tasks-vision from CDN using dynamic import
      const cdnUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15';
      const mediapipe: any = await import(/* @vite-ignore */ cdnUrl);

      console.log('[MediaPipe] Successfully loaded from CDN');

      return {
        PoseLandmarker: mediapipe.PoseLandmarker,
        FilesetResolver: mediapipe.FilesetResolver,
      };
    } catch (error) {
      console.error('[MediaPipe] Error loading from CDN:', error);
      mediapipePromise = null; // Reset on error to allow retry
      throw new Error('Failed to load MediaPipe Vision tasks');
    }
  })();

  return mediapipePromise;
}

/**
 * Creates a PoseLandmarker instance configured for telemedicine
 */
export async function createPoseLandmarker() {
  console.log('[MediaPipe] Creating PoseLandmarker...');

  const { PoseLandmarker, FilesetResolver } = await loadMediaPipe();

  // Initialize vision tasks with WASM files from CDN
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm'
  );

  // Create PoseLandmarker with lite model
  const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
      delegate: 'GPU', // Use GPU if available
    },
    runningMode: 'VIDEO', // Optimized for video streams
    numPoses: 1, // Track single person
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  console.log('[MediaPipe] PoseLandmarker created successfully');

  return poseLandmarker;
}

/**
 * Calculates metrics from pose landmarks
 */
export function calculateMetrics(landmarks: any[]) {
  if (!landmarks || landmarks.length === 0) {
    return {
      posture: null,
      joints: null,
      symmetry: null,
    };
  }

  // Helper function to calculate distance between two points (reserved for future use)
  // const distance = (p1: any, p2: any) => {
  //   return Math.sqrt(
  //     Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2)
  //   );
  // };

  // Helper function to calculate angle between three points
  const angle = (p1: any, p2: any, p3: any) => {
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };

    const dot = v1.x * v2.x + v1.y * v2.y;
    const det = v1.x * v2.y - v1.y * v2.x;
    const angleRad = Math.atan2(det, dot);

    return (angleRad * 180) / Math.PI;
  };

  // Key landmark indices (MediaPipe Pose)
  // const NOSE = 0; // Reserved for future use
  const LEFT_SHOULDER = 11;
  const RIGHT_SHOULDER = 12;
  const LEFT_ELBOW = 13;
  const RIGHT_ELBOW = 14;
  const LEFT_WRIST = 15;
  const RIGHT_WRIST = 16;
  const LEFT_HIP = 23;
  const RIGHT_HIP = 24;
  const LEFT_KNEE = 25;
  const RIGHT_KNEE = 26;
  const LEFT_ANKLE = 27;
  const RIGHT_ANKLE = 28;

  try {
    // Posture analysis
    const shoulderMidpoint = {
      x: (landmarks[LEFT_SHOULDER].x + landmarks[RIGHT_SHOULDER].x) / 2,
      y: (landmarks[LEFT_SHOULDER].y + landmarks[RIGHT_SHOULDER].y) / 2,
      z: (landmarks[LEFT_SHOULDER].z + landmarks[RIGHT_SHOULDER].z) / 2,
    };

    const hipMidpoint = {
      x: (landmarks[LEFT_HIP].x + landmarks[RIGHT_HIP].x) / 2,
      y: (landmarks[LEFT_HIP].y + landmarks[RIGHT_HIP].y) / 2,
      z: (landmarks[LEFT_HIP].z + landmarks[RIGHT_HIP].z) / 2,
    };

    // Calculate trunk angle (posture)
    const trunkAngle = Math.abs(
      Math.atan2(
        shoulderMidpoint.y - hipMidpoint.y,
        shoulderMidpoint.x - hipMidpoint.x
      ) *
        (180 / Math.PI)
    );

    // Joint angles
    const leftElbowAngle = Math.abs(
      angle(landmarks[LEFT_SHOULDER], landmarks[LEFT_ELBOW], landmarks[LEFT_WRIST])
    );
    const rightElbowAngle = Math.abs(
      angle(landmarks[RIGHT_SHOULDER], landmarks[RIGHT_ELBOW], landmarks[RIGHT_WRIST])
    );
    const leftKneeAngle = Math.abs(
      angle(landmarks[LEFT_HIP], landmarks[LEFT_KNEE], landmarks[LEFT_ANKLE])
    );
    const rightKneeAngle = Math.abs(
      angle(landmarks[RIGHT_HIP], landmarks[RIGHT_KNEE], landmarks[RIGHT_ANKLE])
    );

    // Symmetry analysis
    const shoulderSymmetry =
      Math.abs(landmarks[LEFT_SHOULDER].y - landmarks[RIGHT_SHOULDER].y) * 100;
    const hipSymmetry = Math.abs(landmarks[LEFT_HIP].y - landmarks[RIGHT_HIP].y) * 100;

    return {
      posture: {
        trunkAngle: trunkAngle.toFixed(1),
        alignment: trunkAngle > 85 && trunkAngle < 95 ? 'Buena' : 'Revisar',
      },
      joints: {
        leftElbow: leftElbowAngle.toFixed(1),
        rightElbow: rightElbowAngle.toFixed(1),
        leftKnee: leftKneeAngle.toFixed(1),
        rightKnee: rightKneeAngle.toFixed(1),
      },
      symmetry: {
        shoulders: shoulderSymmetry < 5 ? 'Simétrico' : 'Asimétrico',
        shoulderDiff: shoulderSymmetry.toFixed(2),
        hips: hipSymmetry < 5 ? 'Simétrico' : 'Asimétrico',
        hipDiff: hipSymmetry.toFixed(2),
      },
    };
  } catch (error) {
    console.error('[MediaPipe] Error calculating metrics:', error);
    return {
      posture: null,
      joints: null,
      symmetry: null,
    };
  }
}

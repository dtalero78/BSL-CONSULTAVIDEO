import React, { useRef, useEffect } from 'react';

interface PoseData {
  landmarks: any[];
  metrics: {
    posture: any;
    joints: any;
    symmetry: any;
  };
  timestamp: number;
}

interface PosturalAnalysisCanvasProps {
  poseData: PoseData | null;
}

export const PosturalAnalysisCanvas: React.FC<PosturalAnalysisCanvasProps> = ({ poseData }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !poseData || !poseData.landmarks) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Set canvas background
    ctx.fillStyle = '#0b141a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw landmarks and skeleton
    drawSkeleton(ctx, poseData.landmarks, canvas.width, canvas.height);
  }, [poseData]);

  const drawSkeleton = (
    ctx: CanvasRenderingContext2D,
    landmarks: any[],
    width: number,
    height: number
  ) => {
    // Define skeleton connections (MediaPipe Pose landmark indices)
    const connections = [
      // Torso
      [11, 12], // Shoulders
      [11, 23], // Left shoulder to left hip
      [12, 24], // Right shoulder to right hip
      [23, 24], // Hips
      // Left arm
      [11, 13], // Left shoulder to left elbow
      [13, 15], // Left elbow to left wrist
      // Right arm
      [12, 14], // Right shoulder to right elbow
      [14, 16], // Right elbow to right wrist
      // Left leg
      [23, 25], // Left hip to left knee
      [25, 27], // Left knee to left ankle
      // Right leg
      [24, 26], // Right hip to right knee
      [26, 28], // Right knee to right ankle
      // Face (optional, for reference)
      [0, 1], // Nose to left eye inner
      [0, 4], // Nose to right eye inner
    ];

    // Draw connections (skeleton lines)
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;

    connections.forEach(([startIdx, endIdx]) => {
      const start = landmarks[startIdx];
      const end = landmarks[endIdx];

      if (start && end && start.visibility > 0.5 && end.visibility > 0.5) {
        ctx.beginPath();
        ctx.moveTo(start.x * width, start.y * height);
        ctx.lineTo(end.x * width, end.y * height);
        ctx.stroke();
      }
    });

    // Draw landmarks (joint points)
    landmarks.forEach((landmark, index) => {
      if (landmark.visibility > 0.5) {
        // Different colors for different body parts
        let color = '#ff0000'; // Default red

        if (index === 0) {
          color = '#ffff00'; // Yellow for nose (face reference)
        } else if (index >= 11 && index <= 16) {
          color = '#ff00ff'; // Magenta for arms/shoulders
        } else if (index >= 23 && index <= 28) {
          color = '#00ffff'; // Cyan for hips/legs
        }

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(landmark.x * width, landmark.y * height, 6, 0, 2 * Math.PI);
        ctx.fill();

        // Draw white border for visibility
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Draw timestamp
    ctx.fillStyle = '#00ff00';
    ctx.font = '12px monospace';
    ctx.fillText(`FPS: ${(1000 / 66.67).toFixed(1)}`, 10, 20);
    ctx.fillText(`Landmarks: ${landmarks.length}`, 10, 40);
  };

  return (
    <div className="w-full h-full flex items-center justify-center bg-[#0b141a] rounded-lg">
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        className="max-w-full max-h-full border border-gray-700 rounded-lg"
      />
    </div>
  );
};

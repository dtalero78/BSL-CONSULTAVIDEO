// Utility to format postural analysis metrics as text for medical records

interface PoseMetrics {
  posture: {
    trunkAngle: string;
    alignment: string;
  };
  joints: {
    leftElbow: string;
    rightElbow: string;
    leftKnee: string;
    rightKnee: string;
  };
  symmetry: {
    shoulders: string;
    shoulderDiff: string;
    hips: string;
    hipDiff: string;
  };
}

interface CapturedSnapshot {
  description: string;
  timestamp: number;
  metrics: PoseMetrics;
}

/**
 * Formatea los snapshots de análisis postural como texto para el campo de observaciones
 */
export function formatPosturalMetricsAsText(snapshots: CapturedSnapshot[]): string {
  if (!snapshots || snapshots.length === 0) {
    return '';
  }

  const lines: string[] = [];

  lines.push('=== ANÁLISIS POSTURAL ===');
  lines.push(`Fecha: ${new Date().toLocaleDateString('es-CO')}`);
  lines.push(`Total de ejercicios evaluados: ${snapshots.length}`);
  lines.push('');

  snapshots.forEach((snapshot, index) => {
    const date = new Date(snapshot.timestamp);
    const timeStr = date.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit'
    });

    lines.push(`${index + 1}. ${snapshot.description.toUpperCase()} (${timeStr})`);

    // Postura
    if (snapshot.metrics.posture) {
      lines.push(`   Postura:`);
      lines.push(`   - Ángulo del tronco: ${snapshot.metrics.posture.trunkAngle}°`);
      lines.push(`   - Alineación: ${snapshot.metrics.posture.alignment}`);
    }

    // Ángulos articulares
    if (snapshot.metrics.joints) {
      lines.push(`   Ángulos articulares:`);
      lines.push(`   - Codo izquierdo: ${snapshot.metrics.joints.leftElbow}°`);
      lines.push(`   - Codo derecho: ${snapshot.metrics.joints.rightElbow}°`);
      lines.push(`   - Rodilla izquierda: ${snapshot.metrics.joints.leftKnee}°`);
      lines.push(`   - Rodilla derecha: ${snapshot.metrics.joints.rightKnee}°`);
    }

    // Simetría
    if (snapshot.metrics.symmetry) {
      lines.push(`   Simetría corporal:`);
      lines.push(`   - Hombros: ${snapshot.metrics.symmetry.shoulders} (diferencia: ${snapshot.metrics.symmetry.shoulderDiff}%)`);
      lines.push(`   - Caderas: ${snapshot.metrics.symmetry.hips} (diferencia: ${snapshot.metrics.symmetry.hipDiff}%)`);
    }

    lines.push(''); // Línea en blanco entre ejercicios
  });

  lines.push('=== FIN ANÁLISIS POSTURAL ===');

  return lines.join('\n');
}

/**
 * Versión compacta del formato (para espacios limitados)
 */
export function formatPosturalMetricsCompact(snapshots: CapturedSnapshot[]): string {
  if (!snapshots || snapshots.length === 0) {
    return '';
  }

  const lines: string[] = [];

  lines.push(`ANÁLISIS POSTURAL (${snapshots.length} ejercicios):`);

  snapshots.forEach((snapshot, index) => {
    lines.push(`${index + 1}. ${snapshot.description}: Tronco ${snapshot.metrics.posture?.trunkAngle}°, Alineación ${snapshot.metrics.posture?.alignment}, Hombros ${snapshot.metrics.symmetry?.shoulders}`);
  });

  return lines.join('\n');
}

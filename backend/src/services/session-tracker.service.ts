import { Server as SocketIOServer } from 'socket.io';
import { videoProvider } from './video';
import postgresService from './postgres.service';

interface SessionParticipant {
  identity: string;
  role: 'doctor' | 'patient';
  connectedAt: Date;
  disconnectedAt?: Date;
}

interface VideoSession {
  roomName: string;
  participants: Map<string, SessionParticipant>;
  createdAt: Date;
  completedAt?: Date;
  patientDocumento?: string;
  medicoCode?: string;
  historiaId?: string;
  codEmpresa?: string;
  recordingEnabled: boolean;
}

class SessionTrackerService {
  private sessions: Map<string, VideoSession> = new Map();
  private io: SocketIOServer | null = null;

  constructor() {}

  /**
   * Inicializa el servicio con la instancia de Socket.io
   */
  initialize(io: SocketIOServer): void {
    this.io = io;
    console.log('[SessionTracker] Socket.io initialized');
  }

  /**
   * Registra que un participante se conectó a la sala
   */
  trackParticipantConnected(roomName: string, identity: string, role: 'doctor' | 'patient', documento?: string, medicoCode?: string, historiaId?: string): void {
    console.log(`[SessionTracker] Participant connected: ${identity} (${role}) to room ${roomName}, medicoCode: ${medicoCode}, historiaId: ${historiaId}`);

    if (!this.sessions.has(roomName)) {
      this.sessions.set(roomName, {
        roomName,
        participants: new Map(),
        createdAt: new Date(),
        patientDocumento: documento,
        medicoCode: medicoCode,
        recordingEnabled: false,
      });
    }

    const session = this.sessions.get(roomName)!;

    // Si es un paciente y tenemos el documento, guardarlo en la sesión
    if (role === 'patient' && documento) {
      session.patientDocumento = documento;
    }

    // Si tenemos medicoCode, guardarlo en la sesión
    if (medicoCode) {
      session.medicoCode = medicoCode;
    }

    // Si el doctor se conecta con historiaId, buscar codEmpresa y decidir grabación
    if (role === 'doctor' && historiaId) {
      session.historiaId = historiaId;
      this.setupRecordingIfNeeded(session, historiaId, identity);
    }

    session.participants.set(identity, {
      identity,
      role,
      connectedAt: new Date(),
    });

    console.log(`[SessionTracker] Current participants in ${roomName}: ${session.participants.size}`);

    // Grabación (Chime): arrancar la captura SOLO cuando ambos ya están
    // conectados. Si el Media Capture Pipeline se une mientras los clientes
    // establecen su video, satura la señalización y el video no se renderiza.
    // Idempotente (el servicio verifica que no exista ya una captura).
    if (session.participants.size >= 2) {
      videoProvider.startRecording(roomName)
        .catch((err: any) => console.error(`[SessionTracker] Error arrancando grabación: ${err.message}`));
    }

    // Emitir evento Socket.io cuando un paciente se conecta - SOLO a la Room del médico específico
    if (role === 'patient' && this.io && documento && session.medicoCode) {
      const roomToEmit = `doctor-${session.medicoCode}`;
      console.log(`[SessionTracker] Emitting patient-connected event to room: ${roomToEmit} for documento: ${documento}`);
      this.io.to(roomToEmit).emit('patient-connected', {
        documento,
        roomName,
        identity,
        connectedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Busca datos del paciente y activa grabación solo si el tipo de examen requiere
   * revisión de calidad (RECOMENDACIONES o POST-INCAPACIDAD). También guarda el
   * registro en video_sessions. La composición NO se crea acá (es lazy — ver
   * trackParticipantDisconnected y el módulo de calidad de bsl-plataforma-2).
   */
  private async setupRecordingIfNeeded(session: VideoSession, historiaId: string, doctorIdentity: string): Promise<void> {
    try {
      // Buscar datos del paciente en PostgreSQL
      const rows = await postgresService.query(
        `SELECT "numeroId", "primerNombre", "primerApellido", "codEmpresa", "tipoExamen" FROM "HistoriaClinica" WHERE "_id" = $1 LIMIT 1`,
        [historiaId]
      );

      if (!rows || rows.length === 0) {
        console.warn(`[SessionTracker] Historia clínica no encontrada: ${historiaId}`);
        return;
      }

      const patient = rows[0];
      session.codEmpresa = patient.codEmpresa;
      session.patientDocumento = patient.numeroId;

      // Grabar SOLO consultas cuyo tipoExamen sea RECOMENDACIONES o POST-INCAPACIDAD.
      // Match normalizado (ignora mayúsculas, espacios y guiones) para tolerar las
      // variantes que existen en la BD: "POST-INCAPACIDAD" / "PostIncapacidad" /
      // "Post Incapacidad", "RECOMENDACIONES" / "Recomendaciones".
      const tipoNorm = String(patient.tipoExamen || '').toLowerCase().replace(/[\s\-_]/g, '');
      const debeGrabar = tipoNorm === 'recomendaciones' || tipoNorm === 'postincapacidad';
      if (debeGrabar) {
        try {
          const enabled = await videoProvider.enableRecording(session.roomName);
          session.recordingEnabled = enabled;
          if (enabled) {
            console.log(`[SessionTracker] Recording enabled (${patient.tipoExamen}) in room ${session.roomName}`);
          } else {
            console.log(`[SessionTracker] Recording solicitado pero no soportado por el provider "${videoProvider.name}" en ${session.roomName}`);
          }
        } catch (err: any) {
          console.error(`[SessionTracker] Error enabling recording: ${err.message}`);
        }
      }

      // Guardar en video_sessions (room_sid = SID de Twilio o MeetingId de Chime)
      const roomInfo = await videoProvider.getRoom(session.roomName).catch(() => null);
      await postgresService.query(
        `INSERT INTO video_sessions (room_name, room_sid, historia_id, patient_documento, patient_name, doctor_name, cod_empresa, recording_enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          session.roomName,
          roomInfo?.id || null,
          historiaId,
          patient.numeroId,
          `${patient.primerNombre} ${patient.primerApellido}`.trim(),
          doctorIdentity,
          patient.codEmpresa,
          session.recordingEnabled,
        ]
      );
      console.log(`[SessionTracker] Video session saved for patient ${patient.numeroId} in room ${session.roomName}`);
    } catch (error: any) {
      console.error(`[SessionTracker] Error in setupRecordingIfNeeded: ${error.message}`);
    }
  }

  /**
   * Registra que un participante se desconectó de la sala
   */
  trackParticipantDisconnected(roomName: string, identity: string): void {
    console.log(`[SessionTracker] Participant disconnected: ${identity} from room ${roomName}`);

    const session = this.sessions.get(roomName);
    if (!session) {
      console.warn(`[SessionTracker] Session not found for room: ${roomName}`);
      return;
    }

    const participant = session.participants.get(identity);
    if (participant) {
      // El cliente puede reportar la desconexión dos veces (colgar + beforeunload).
      // Sin esta guarda se cerraba la sala, se emitían eventos y se generaba el
      // reporte por duplicado.
      if (participant.disconnectedAt) {
        console.log(`[SessionTracker] Desconexión duplicada de ${identity}, ignorada`);
        return;
      }
      participant.disconnectedAt = new Date();

      // Si el doctor se desconecta, cerrar la sala en Twilio para que nadie más pueda entrar.
      // Composición LAZY: NO se crea al terminar la llamada. Antes se componía toda consulta
      // grabada, pero ~99% nunca se evaluaban (413 composiciones/mes vs 2 evaluaciones). La
      // composición se crea on-demand desde el módulo de calidad al hacer clic en "Evaluar".
      // Los tracks grabados quedan guardados en Twilio y se pueden componer después.
      // OJO: esto es una desconexión, no un "colgar". El médico pudo recargar,
      // perder la red o cerrar la pestaña sin querer. Se cierra el meeting y se
      // guarda la grabación, pero `completed: false` deja la sala reutilizable:
      // marcarla como finalizada aquí dejaba al PACIENTE fuera de su propia
      // consulta —con el link ya enviado por WhatsApp— y obligaba a crear una
      // sala nueva. La sala sólo se da por terminada cuando el médico cuelga
      // (POST /rooms/:roomName/end desde el botón de colgar).
      if (participant.role === 'doctor') {
        // Si el paciente sigue conectado, NO se toca la reunión: borrarla lo
        // expulsaba en el acto ("me sale la alarma de que ingresan y cuando yo
        // entro ya no están"). El médico se reconecta a la MISMA reunión y la
        // consulta sigue. Sólo se limpia cuando ya no queda nadie.
        const quedaAlguien = Array.from(session.participants.values()).some(
          (p) => p.identity !== identity && !p.disconnectedAt
        );
        if (quedaAlguien) {
          console.log(`[SessionTracker] Médico salió de ${roomName} pero queda gente: la sala sigue viva`);
        } else {
          videoProvider.endRoom(roomName, { completed: false })
            .then(() => console.log(`[SessionTracker] Room ${roomName} cerrada, sala vacía (reingreso permitido)`))
            .catch((err: any) => console.error(`[SessionTracker] Error ending room ${roomName}:`, err.message));
        }
      }

      // Emitir evento Socket.io cuando un paciente se desconecta - SOLO a la Room del médico específico
      if (participant.role === 'patient' && this.io && session.patientDocumento && session.medicoCode) {
        const roomToEmit = `doctor-${session.medicoCode}`;
        console.log(`[SessionTracker] Emitting patient-disconnected event to room: ${roomToEmit} for documento: ${session.patientDocumento}`);
        this.io.to(roomToEmit).emit('patient-disconnected', {
          documento: session.patientDocumento,
          roomName,
          identity,
          disconnectedAt: new Date().toISOString(),
        });
      }
    }

    // Verificar si todos los participantes se desconectaron
    const allDisconnected = Array.from(session.participants.values()).every(
      (p) => p.disconnectedAt !== undefined
    );

    if (allDisconnected && session.participants.size >= 2) {
      session.completedAt = new Date();
      this.sessions.delete(roomName);
    }
  }

  /**
   * Obtiene el estado actual de todos los pacientes conectados
   * Retorna un array de objetos con documento, roomName, identity, connectedAt
   * @param medicoCode - Opcional: filtrar solo pacientes de este médico
   */
  getConnectedPatients(medicoCode?: string): Array<{ documento: string; roomName: string; identity: string; connectedAt: string }> {
    const connectedPatients: Array<{ documento: string; roomName: string; identity: string; connectedAt: string }> = [];

    for (const [roomName, session] of this.sessions.entries()) {
      // Si se proporciona medicoCode, filtrar solo las sesiones de ese médico
      if (medicoCode && session.medicoCode !== medicoCode) {
        continue;
      }

      for (const participant of session.participants.values()) {
        // Solo incluir pacientes que NO se han desconectado
        if (participant.role === 'patient' && !participant.disconnectedAt && session.patientDocumento) {
          connectedPatients.push({
            documento: session.patientDocumento,
            roomName,
            identity: participant.identity,
            connectedAt: participant.connectedAt.toISOString(),
          });
        }
      }
    }

    console.log(`[SessionTracker] getConnectedPatients (medicoCode: ${medicoCode}): Found ${connectedPatients.length} connected patients`);
    return connectedPatients;
  }

  /**
   * Limpia sesiones antiguas (mayores a 24 horas)
   */
  cleanOldSessions(): void {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const [roomName, session] of this.sessions.entries()) {
      if (session.createdAt.getTime() < oneDayAgo) {
        console.log(`[SessionTracker] Cleaning old session: ${roomName}`);
        this.sessions.delete(roomName);
      }
    }
  }
}

export const sessionTracker = new SessionTrackerService();

// Limpiar sesiones antiguas cada hora
setInterval(() => {
  sessionTracker.cleanOldSessions();
}, 60 * 60 * 1000);

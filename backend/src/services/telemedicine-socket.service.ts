import { Server, Socket } from 'socket.io';

interface TelemedicineSession {
  roomName: string;
  doctorSocketId: string;
  patientSocketId?: string;
  doctorIdentity: string;
  patientIdentity?: string;
  createdAt: Date;
  isActive: boolean;
}

interface PoseData {
  landmarks: any[];
  metrics: {
    posture: any;
    joints: any;
    symmetry: any;
  };
  timestamp: number;
}

class TelemedicineSocketService {
  private io: Server | null = null;
  private sessions: Map<string, TelemedicineSession> = new Map();

  initialize(io: Server) {
    this.io = io;
    console.log('[Telemedicine] Socket.io service initialized');

    // Namespace específico para telemedicina
    const telemedicineNamespace = io.of('/telemedicine');

    telemedicineNamespace.on('connection', (socket: Socket) => {
      console.log(`[Telemedicine] Client connected: ${socket.id}`);

      // Médico crea sesión de análisis
      socket.on('create-analysis-session', (data: { roomName: string; doctorIdentity: string }) => {
        this.handleCreateSession(socket, data);
      });

      // Paciente se une a sesión existente
      socket.on('join-analysis-session', (data: { roomName: string; patientIdentity: string }) => {
        this.handleJoinSession(socket, data);
      });

      // Paciente envía datos de pose
      socket.on('pose-data', (data: { roomName: string; poseData: PoseData }) => {
        this.handlePoseData(socket, data);
      });

      // Finalizar sesión
      socket.on('end-analysis-session', (data: { roomName: string }) => {
        this.handleEndSession(socket, data);
      });

      // Desconexión
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }

  private handleCreateSession(socket: Socket, data: { roomName: string; doctorIdentity: string }) {
    const { roomName, doctorIdentity } = data;

    console.log(`[Telemedicine] Creating session: ${roomName} by ${doctorIdentity}`);

    // Verificar si ya existe una sesión
    if (this.sessions.has(roomName)) {
      const existingSession = this.sessions.get(roomName)!;

      // Si la sesión existe pero está inactiva, reactivarla
      if (!existingSession.isActive) {
        existingSession.doctorSocketId = socket.id;
        existingSession.isActive = true;
        socket.join(roomName);

        socket.emit('session-created', {
          roomName,
          sessionCode: roomName,
          patientConnected: !!existingSession.patientSocketId,
        });
        return;
      }

      // Si está activa, informar error
      socket.emit('session-error', { message: 'Session already active' });
      return;
    }

    // Crear nueva sesión
    const session: TelemedicineSession = {
      roomName,
      doctorSocketId: socket.id,
      doctorIdentity,
      createdAt: new Date(),
      isActive: true,
    };

    this.sessions.set(roomName, session);
    socket.join(roomName);

    socket.emit('session-created', {
      roomName,
      sessionCode: roomName,
      patientConnected: false,
    });

    console.log(`[Telemedicine] Session created: ${roomName}`);
  }

  private handleJoinSession(socket: Socket, data: { roomName: string; patientIdentity: string }) {
    const { roomName, patientIdentity } = data;

    console.log(`[Telemedicine] Patient joining: ${roomName} as ${patientIdentity}`);

    const session = this.sessions.get(roomName);

    if (!session) {
      socket.emit('join-error', { message: 'Session not found' });
      return;
    }

    if (!session.isActive) {
      socket.emit('join-error', { message: 'Session not active' });
      return;
    }

    // Actualizar sesión con info del paciente
    session.patientSocketId = socket.id;
    session.patientIdentity = patientIdentity;

    socket.join(roomName);

    // Notificar al paciente que se unió exitosamente
    socket.emit('session-joined', {
      roomName,
      doctorIdentity: session.doctorIdentity,
    });

    // Notificar al médico que el paciente se conectó
    socket.to(roomName).emit('patient-connected', {
      patientIdentity,
    });

    console.log(`[Telemedicine] Patient ${patientIdentity} joined session ${roomName}`);
  }

  private handlePoseData(socket: Socket, data: { roomName: string; poseData: PoseData }) {
    const { roomName, poseData } = data;

    const session = this.sessions.get(roomName);

    if (!session || !session.isActive) {
      return;
    }

    // Reenviar datos solo al médico (doctor socket)
    socket.to(roomName).emit('pose-data-update', poseData);
  }

  private handleEndSession(_socket: Socket, data: { roomName: string }) {
    const { roomName } = data;

    console.log(`[Telemedicine] Ending session: ${roomName}`);

    const session = this.sessions.get(roomName);

    if (!session) {
      return;
    }

    // Marcar sesión como inactiva (no eliminar inmediatamente por si quieren reanudar)
    session.isActive = false;

    // Notificar a todos los participantes
    this.io?.of('/telemedicine').to(roomName).emit('session-ended', { roomName });

    console.log(`[Telemedicine] Session ${roomName} ended`);
  }

  private handleDisconnect(socket: Socket) {
    console.log(`[Telemedicine] Client disconnected: ${socket.id}`);

    // Buscar si este socket pertenece a alguna sesión activa
    for (const [roomName, session] of this.sessions.entries()) {
      if (session.doctorSocketId === socket.id || session.patientSocketId === socket.id) {
        const wasDoctor = session.doctorSocketId === socket.id;

        console.log(`[Telemedicine] ${wasDoctor ? 'Doctor' : 'Patient'} disconnected from ${roomName}`);

        // Si el médico se desconecta, finalizar la sesión
        if (wasDoctor) {
          session.isActive = false;
          this.io?.of('/telemedicine').to(roomName).emit('session-ended', { roomName });
        } else {
          // Si el paciente se desconecta, notificar al médico
          session.patientSocketId = undefined;
          session.patientIdentity = undefined;
          this.io?.of('/telemedicine').to(roomName).emit('patient-disconnected');
        }
      }
    }
  }

  // Cleanup de sesiones antiguas (> 24 horas)
  cleanupOldSessions() {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const [roomName, session] of this.sessions.entries()) {
      if (session.createdAt.getTime() < oneDayAgo && !session.isActive) {
        console.log(`[Telemedicine] Cleaning up old session: ${roomName}`);
        this.sessions.delete(roomName);
      }
    }
  }

  // Método para obtener info de sesión (para endpoints REST)
  getSession(roomName: string): TelemedicineSession | undefined {
    return this.sessions.get(roomName);
  }

  // Obtener todas las sesiones activas
  getActiveSessions(): TelemedicineSession[] {
    return Array.from(this.sessions.values()).filter(s => s.isActive);
  }
}

export const telemedicineSocketService = new TelemedicineSocketService();

// Cleanup cada hora
setInterval(() => {
  telemedicineSocketService.cleanupOldSessions();
}, 60 * 60 * 1000);

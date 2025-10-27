import axios from 'axios';
import { Server as SocketIOServer } from 'socket.io';

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
  patientDocumento?: string; // ID del documento del paciente
}

class SessionTrackerService {
  private sessions: Map<string, VideoSession> = new Map();
  private readonly ADMIN_PHONE = '573008021701';
  private readonly WHAPI_TOKEN = process.env.WHAPI_TOKEN || 'due3eWCwuBM2Xqd6cPujuTRqSbMb68lt';
  private readonly WHAPI_URL = 'https://gate.whapi.cloud/messages/text';
  private io: SocketIOServer | null = null;

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
  trackParticipantConnected(roomName: string, identity: string, role: 'doctor' | 'patient', documento?: string): void {
    console.log(`[SessionTracker] Participant connected: ${identity} (${role}) to room ${roomName}`);

    if (!this.sessions.has(roomName)) {
      this.sessions.set(roomName, {
        roomName,
        participants: new Map(),
        createdAt: new Date(),
        patientDocumento: documento,
      });
    }

    const session = this.sessions.get(roomName)!;

    // Si es un paciente y tenemos el documento, guardarlo en la sesión
    if (role === 'patient' && documento) {
      session.patientDocumento = documento;
    }

    session.participants.set(identity, {
      identity,
      role,
      connectedAt: new Date(),
    });

    console.log(`[SessionTracker] Current participants in ${roomName}: ${session.participants.size}`);

    // Emitir evento Socket.io cuando un paciente se conecta
    if (role === 'patient' && this.io && documento) {
      console.log(`[SessionTracker] Emitting patient-connected event for documento: ${documento}`);
      this.io.emit('patient-connected', {
        documento,
        roomName,
        identity,
        connectedAt: new Date().toISOString(),
      });
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
      participant.disconnectedAt = new Date();

      // Emitir evento Socket.io cuando un paciente se desconecta
      if (participant.role === 'patient' && this.io && session.patientDocumento) {
        console.log(`[SessionTracker] Emitting patient-disconnected event for documento: ${session.patientDocumento}`);
        this.io.emit('patient-disconnected', {
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
      console.log(`[SessionTracker] All participants disconnected from ${roomName}. Sending report...`);
      session.completedAt = new Date();
      this.sendSessionReport(session);
    }
  }

  /**
   * Envía el reporte de la sesión completada
   */
  private async sendSessionReport(session: VideoSession): Promise<void> {
    try {
      const doctor = Array.from(session.participants.values()).find((p) => p.role === 'doctor');
      const patient = Array.from(session.participants.values()).find((p) => p.role === 'patient');

      if (!doctor || !patient) {
        console.warn('[SessionTracker] Session incomplete: missing doctor or patient');
        return;
      }

      const duration = this.calculateDuration(session);
      const report = this.formatSessionReport(session, doctor, patient, duration);

      await this.sendWhatsAppMessage(report);

      console.log(`[SessionTracker] Report sent successfully for room ${session.roomName}`);

      // Limpiar la sesión después de enviar el reporte
      this.sessions.delete(session.roomName);
    } catch (error) {
      console.error('[SessionTracker] Error sending session report:', error);
    }
  }

  /**
   * Calcula la duración de la sesión
   */
  private calculateDuration(session: VideoSession): string {
    const participants = Array.from(session.participants.values());
    const earliestConnection = Math.min(...participants.map((p) => p.connectedAt.getTime()));
    const latestDisconnection = Math.max(
      ...participants.map((p) => p.disconnectedAt?.getTime() || 0)
    );

    const durationMs = latestDisconnection - earliestConnection;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);

    return `${minutes}m ${seconds}s`;
  }

  /**
   * Formatea el reporte de la sesión
   */
  private formatSessionReport(
    session: VideoSession,
    doctor: SessionParticipant,
    patient: SessionParticipant,
    duration: string
  ): string {
    const timestamp = new Date().toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    let report = `📹 *VIDEOLLAMADA COMPLETADA*\n`;
    report += `📅 ${timestamp}\n\n`;

    report += `🏥 *SALA*\n`;
    report += `• ID: ${session.roomName}\n`;
    report += `• Duración: ${duration}\n\n`;

    report += `⚕️ *DOCTOR*\n`;
    report += `• Código: ${doctor.identity.replace('Dr. ', '')}\n`;
    report += `• Conectado: ${doctor.connectedAt.toLocaleTimeString('es-CO')}\n`;
    report += `• Desconectado: ${doctor.disconnectedAt?.toLocaleTimeString('es-CO') || 'N/A'}\n\n`;

    report += `👤 *PACIENTE*\n`;
    report += `• Nombre: ${patient.identity}\n`;
    report += `• Conectado: ${patient.connectedAt.toLocaleTimeString('es-CO')}\n`;
    report += `• Desconectado: ${patient.disconnectedAt?.toLocaleTimeString('es-CO') || 'N/A'}\n\n`;

    report += `✅ Sesión finalizada correctamente`;

    return report;
  }

  /**
   * Envía mensaje por WhatsApp usando WHAPI
   */
  private async sendWhatsAppMessage(message: string): Promise<void> {
    if (!this.WHAPI_TOKEN) {
      console.error('[SessionTracker] WHAPI_TOKEN not configured');
      return;
    }

    try {
      const response = await axios.post(
        this.WHAPI_URL,
        {
          typing_time: 0,
          to: this.ADMIN_PHONE,
          body: message,
        },
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.WHAPI_TOKEN}`,
          },
        }
      );

      console.log('[SessionTracker] WhatsApp message sent:', response.data);
    } catch (error) {
      console.error('[SessionTracker] Error sending WhatsApp message:', error);
      throw error;
    }
  }

  /**
   * Obtiene el estado actual de todos los pacientes conectados
   * Retorna un array de objetos con documento, roomName, identity, connectedAt
   */
  getConnectedPatients(): Array<{ documento: string; roomName: string; identity: string; connectedAt: string }> {
    const connectedPatients: Array<{ documento: string; roomName: string; identity: string; connectedAt: string }> = [];

    for (const [roomName, session] of this.sessions.entries()) {
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

    console.log(`[SessionTracker] getConnectedPatients: Found ${connectedPatients.length} connected patients`);
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

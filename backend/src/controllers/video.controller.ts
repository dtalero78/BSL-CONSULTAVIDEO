import { Request, Response } from 'express';
import twilioService from '../services/twilio.service';
import { sessionTracker } from '../services/session-tracker.service';
import whatsappService from '../services/whatsapp.service';
import medicalHistoryService from '../services/medical-history.service';
import openaiService from '../services/openai.service';

class VideoController {
  /**
   * Generar token de acceso para una sala de video
   * POST /api/video/token
   * Body: { identity: string, roomName: string }
   */
  async generateToken(req: Request, res: Response): Promise<void> {
    try {
      const { identity, roomName } = req.body;

      if (!identity || !roomName) {
        res.status(400).json({
          error: 'Identity and roomName are required',
        });
        return;
      }

      const tokenData = twilioService.generateVideoToken({
        identity,
        roomName,
      });

      res.status(200).json({
        success: true,
        data: tokenData,
      });
    } catch (error) {
      console.error('Error generating token:', error);
      res.status(500).json({
        error: 'Failed to generate token',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Crear una nueva sala de video
   * POST /api/video/rooms
   * Body: { roomName: string, type?: 'group' | 'peer-to-peer' | 'group-small' }
   */
  async createRoom(req: Request, res: Response): Promise<void> {
    try {
      const { roomName, type } = req.body;

      if (!roomName) {
        res.status(400).json({
          error: 'roomName is required',
        });
        return;
      }

      const room = await twilioService.createRoom(roomName, type);

      res.status(201).json({
        success: true,
        data: room,
      });
    } catch (error) {
      console.error('Error creating room:', error);
      res.status(500).json({
        error: 'Failed to create room',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Obtener información de una sala
   * GET /api/video/rooms/:roomName
   */
  async getRoom(req: Request, res: Response): Promise<void> {
    try {
      const { roomName } = req.params;

      const room = await twilioService.getRoom(roomName);

      res.status(200).json({
        success: true,
        data: room,
      });
    } catch (error) {
      console.error('Error fetching room:', error);
      res.status(500).json({
        error: 'Failed to fetch room',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Finalizar una sala de video
   * POST /api/video/rooms/:roomName/end
   */
  async endRoom(req: Request, res: Response): Promise<void> {
    try {
      const { roomName } = req.params;

      const room = await twilioService.endRoom(roomName);

      res.status(200).json({
        success: true,
        data: room,
      });
    } catch (error) {
      console.error('Error ending room:', error);
      res.status(500).json({
        error: 'Failed to end room',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Listar participantes de una sala
   * GET /api/video/rooms/:roomName/participants
   */
  async listParticipants(req: Request, res: Response): Promise<void> {
    try {
      const { roomName } = req.params;

      const participants = await twilioService.listParticipants(roomName);

      res.status(200).json({
        success: true,
        data: participants,
      });
    } catch (error) {
      console.error('Error listing participants:', error);
      res.status(500).json({
        error: 'Failed to list participants',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Desconectar un participante
   * POST /api/video/rooms/:roomName/participants/:participantSid/disconnect
   */
  async disconnectParticipant(req: Request, res: Response): Promise<void> {
    try {
      const { roomName, participantSid } = req.params;

      const result = await twilioService.disconnectParticipant(
        roomName,
        participantSid
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error disconnecting participant:', error);
      res.status(500).json({
        error: 'Failed to disconnect participant',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Registrar que un participante se conectó
   * POST /api/video/events/participant-connected
   * Body: { roomName: string, identity: string, role: 'doctor' | 'patient' }
   */
  async trackParticipantConnected(req: Request, res: Response): Promise<void> {
    try {
      const { roomName, identity, role } = req.body;

      if (!roomName || !identity || !role) {
        res.status(400).json({
          error: 'roomName, identity, and role are required',
        });
        return;
      }

      if (role !== 'doctor' && role !== 'patient') {
        res.status(400).json({
          error: 'role must be either "doctor" or "patient"',
        });
        return;
      }

      sessionTracker.trackParticipantConnected(roomName, identity, role);

      res.status(200).json({
        success: true,
        message: 'Participant connection tracked',
      });
    } catch (error) {
      console.error('Error tracking participant connection:', error);
      res.status(500).json({
        error: 'Failed to track participant connection',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Registrar que un participante se desconectó
   * POST /api/video/events/participant-disconnected
   * Body: { roomName: string, identity: string }
   */
  async trackParticipantDisconnected(req: Request, res: Response): Promise<void> {
    try {
      const { roomName, identity } = req.body;

      if (!roomName || !identity) {
        res.status(400).json({
          error: 'roomName and identity are required',
        });
        return;
      }

      sessionTracker.trackParticipantDisconnected(roomName, identity);

      res.status(200).json({
        success: true,
        message: 'Participant disconnection tracked',
      });
    } catch (error) {
      console.error('Error tracking participant disconnection:', error);
      res.status(500).json({
        error: 'Failed to track participant disconnection',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Enviar mensaje de WhatsApp
   * POST /api/video/whatsapp/send
   * Body: { phone: string, message: string }
   */
  async sendWhatsApp(req: Request, res: Response): Promise<void> {
    try {
      const { phone, message } = req.body;

      if (!phone || !message) {
        res.status(400).json({
          error: 'phone and message are required',
        });
        return;
      }

      const result = await whatsappService.sendTextMessage(phone, message);

      if (result.success) {
        res.status(200).json({
          success: true,
          message: 'WhatsApp message sent successfully',
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error || 'Failed to send WhatsApp message',
        });
      }
    } catch (error) {
      console.error('Error sending WhatsApp:', error);
      res.status(500).json({
        error: 'Failed to send WhatsApp',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Obtener historia clínica de un paciente
   * GET /api/video/medical-history/:numeroId
   */
  async getMedicalHistory(req: Request, res: Response): Promise<void> {
    try {
      const { numeroId } = req.params;

      if (!numeroId) {
        res.status(400).json({ error: 'numeroId is required' });
        return;
      }

      const medicalHistory = await medicalHistoryService.getMedicalHistory(numeroId);

      if (!medicalHistory) {
        res.status(404).json({
          success: false,
          error: 'Medical history not found for this patient',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: medicalHistory,
      });
    } catch (error) {
      console.error('Error fetching medical history:', error);
      res.status(500).json({
        error: 'Failed to fetch medical history',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Actualizar historia clínica de un paciente
   * POST /api/video/medical-history
   */
  async updateMedicalHistory(req: Request, res: Response): Promise<void> {
    try {
      const payload = req.body;

      if (!payload.numeroId) {
        res.status(400).json({ error: 'numeroId is required' });
        return;
      }

      const result = await medicalHistoryService.updateMedicalHistory(payload);

      if (result.success) {
        res.status(200).json({
          success: true,
          message: 'Medical history updated successfully',
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error || 'Failed to update medical history',
        });
      }
    } catch (error) {
      console.error('Error updating medical history:', error);
      res.status(500).json({
        error: 'Failed to update medical history',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Generar sugerencias médicas con IA
   * POST /api/video/ai-suggestions
   * Body: { patientData: PatientData }
   */
  async generateAISuggestions(req: Request, res: Response): Promise<void> {
    try {
      const { patientData } = req.body;

      if (!patientData) {
        res.status(400).json({ error: 'patientData is required' });
        return;
      }

      const suggestions = await openaiService.generateMedicalRecommendations(patientData);

      res.status(200).json({
        success: true,
        data: {
          suggestions,
        },
      });
    } catch (error) {
      console.error('Error generating AI suggestions:', error);
      res.status(500).json({
        error: 'Failed to generate AI suggestions',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export default new VideoController();

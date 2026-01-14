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

      // Intentar crear la sala como peer-to-peer si no existe
      // Esto optimiza costos (~62% más barato que 'group')
      try {
        await twilioService.createRoom(roomName, 'peer-to-peer');
        console.log(`Room created as peer-to-peer: ${roomName}`);
      } catch (error: any) {
        // Si la sala ya existe, continuar (error code 53113)
        if (error.code === 53113) {
          console.log(`Room already exists: ${roomName}`);
        } else {
          // Otro error, pero no bloqueamos la generación del token
          console.warn(`Could not create room, will use existing: ${error.message}`);
        }
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
   * Body: { roomName: string, identity: string, role: 'doctor' | 'patient', documento?: string, medicoCode?: string }
   */
  async trackParticipantConnected(req: Request, res: Response): Promise<void> {
    try {
      const { roomName, identity, role, documento, medicoCode } = req.body;

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

      sessionTracker.trackParticipantConnected(roomName, identity, role, documento, medicoCode);

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
   * Enviar mensaje de WhatsApp usando template aprobado
   * POST /api/video/whatsapp/send
   * Body: { phone: string, roomNameWithParams: string, patientName: string, doctorCode: string }
   *
   * Usa el template aprobado de Twilio con variables:
   * Template: "Hola {{2}}. Te escribimos de BSL. Tienes una consulta médica programada con el Dr. {{3}}..."
   * Button URL: https://medico-bsl.com/patient/{{1}}
   */
  async sendWhatsApp(req: Request, res: Response): Promise<void> {
    try {
      const { phone, roomNameWithParams, patientName, doctorCode } = req.body;

      if (!phone || !roomNameWithParams || !patientName || !doctorCode) {
        res.status(400).json({
          error: 'phone, roomNameWithParams, patientName, and doctorCode are required',
        });
        return;
      }

      // Usar template aprobado con variables para pacientes
      const result = await whatsappService.sendTemplateMessage(
        phone,
        roomNameWithParams,
        patientName,
        doctorCode
      );

      if (result.success) {
        res.status(200).json({
          success: true,
          message: 'WhatsApp template sent successfully',
          messageSid: result.messageSid,
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error || 'Failed to send WhatsApp template',
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
   * Obtener historia clínica de un paciente por _id
   * GET /api/video/medical-history/:historiaId
   */
  async getMedicalHistory(req: Request, res: Response): Promise<void> {
    try {
      const { historiaId } = req.params;

      if (!historiaId) {
        res.status(400).json({ error: 'historiaId is required' });
        return;
      }

      const medicalHistory = await medicalHistoryService.getMedicalHistory(historiaId);

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
   * Actualizar historia clínica de un paciente por _id
   * POST /api/video/medical-history
   */
  async updateMedicalHistory(req: Request, res: Response): Promise<void> {
    try {
      const payload = req.body;
      console.log('📥 [updateMedicalHistory] Payload recibido:', JSON.stringify(payload, null, 2));

      if (!payload.historiaId) {
        console.error('❌ [updateMedicalHistory] historiaId no encontrado en payload');
        res.status(400).json({ error: 'historiaId is required' });
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

  /**
   * Obtener lista de pacientes actualmente conectados
   * GET /api/video/events/connected-patients?medicoCode=XXX
   */
  async getConnectedPatients(req: Request, res: Response): Promise<void> {
    try {
      const { medicoCode } = req.query;
      const connectedPatients = sessionTracker.getConnectedPatients(medicoCode as string | undefined);

      res.status(200).json({
        success: true,
        data: connectedPatients,
      });
    } catch (error) {
      console.error('Error fetching connected patients:', error);
      res.status(500).json({
        error: 'Failed to fetch connected patients',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export default new VideoController();

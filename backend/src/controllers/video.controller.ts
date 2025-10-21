import { Request, Response } from 'express';
import twilioService from '../services/twilio.service';

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
}

export default new VideoController();

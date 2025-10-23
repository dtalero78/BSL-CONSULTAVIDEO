import { Request, Response } from 'express';
import { telemedicineSocketService } from '../services/telemedicine-socket.service';

/**
 * Obtener información de una sesión de telemedicina
 */
export const getSession = (req: Request, res: Response): void => {
  try {
    const { roomName } = req.params;

    if (!roomName) {
      res.status(400).json({ error: 'Room name is required' });
      return;
    }

    const session = telemedicineSocketService.getSession(roomName);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.json({
      roomName: session.roomName,
      doctorIdentity: session.doctorIdentity,
      patientIdentity: session.patientIdentity,
      isActive: session.isActive,
      createdAt: session.createdAt,
      patientConnected: !!session.patientSocketId,
    });
  } catch (error) {
    console.error('[Telemedicine Controller] Error getting session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Obtener todas las sesiones activas
 */
export const getActiveSessions = (_req: Request, res: Response): void => {
  try {
    const sessions = telemedicineSocketService.getActiveSessions();

    res.json({
      count: sessions.length,
      sessions: sessions.map((session) => ({
        roomName: session.roomName,
        doctorIdentity: session.doctorIdentity,
        patientIdentity: session.patientIdentity,
        createdAt: session.createdAt,
        patientConnected: !!session.patientSocketId,
      })),
    });
  } catch (error) {
    console.error('[Telemedicine Controller] Error getting active sessions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Validar si una sesión existe y está activa
 */
export const validateSession = (req: Request, res: Response): void => {
  try {
    const { roomName } = req.params;

    if (!roomName) {
      res.status(400).json({ error: 'Room name is required' });
      return;
    }

    const session = telemedicineSocketService.getSession(roomName);

    if (!session) {
      res.json({ exists: false, isActive: false });
      return;
    }

    res.json({
      exists: true,
      isActive: session.isActive,
      patientConnected: !!session.patientSocketId,
    });
  } catch (error) {
    console.error('[Telemedicine Controller] Error validating session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

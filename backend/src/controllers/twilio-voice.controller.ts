import { Request, Response } from 'express';
import twilioVoiceService from '../services/twilio-voice.service';

export class TwilioVoiceController {
  /**
   * POST /api/twilio/voice-call
   * Realiza una llamada de voz usando Twilio
   */
  async makeVoiceCall(req: Request, res: Response): Promise<void> {
    try {
      const { phoneNumber, patientName } = req.body;

      if (!phoneNumber) {
        res.status(400).json({
          success: false,
          error: 'Phone number is required'
        });
        return;
      }

      const result = await twilioVoiceService.makeVoiceCall(phoneNumber, patientName || 'paciente');

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error('Error in makeVoiceCall controller:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error making voice call'
      });
    }
  }
}

export default new TwilioVoiceController();

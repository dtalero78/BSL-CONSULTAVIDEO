import { Request, Response } from 'express';
import twilioVoiceService from '../services/twilio-voice.service';

const VOICE_AUDIO_URL = 'https://medico-bsl.com/twilioVoz.mp3';

export class TwilioVoiceController {
  /**
   * GET|POST /api/twilio/voice
   * Webhook TwiML que reproduce el audio al recibir/realizar la llamada
   */
  voiceWebhook(_req: Request, res: Response): void {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${VOICE_AUDIO_URL}</Play>
</Response>`;

    res.set('Content-Type', 'text/xml');
    res.status(200).send(twiml);
  }

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

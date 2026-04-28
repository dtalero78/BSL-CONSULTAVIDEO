import { Router } from 'express';
import twilioVoiceController from '../controllers/twilio-voice.controller';

const router = Router();

// GET|POST /api/twilio/voice - TwiML webhook que reproduce twilioVoz.mp3
router.get('/voice', twilioVoiceController.voiceWebhook.bind(twilioVoiceController));
router.post('/voice', twilioVoiceController.voiceWebhook.bind(twilioVoiceController));

// POST /api/twilio/voice-call - Make a voice call
router.post('/voice-call', twilioVoiceController.makeVoiceCall.bind(twilioVoiceController));

export default router;

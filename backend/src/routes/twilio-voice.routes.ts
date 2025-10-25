import { Router } from 'express';
import twilioVoiceController from '../controllers/twilio-voice.controller';

const router = Router();

// POST /api/twilio/voice-call - Make a voice call
router.post('/voice-call', twilioVoiceController.makeVoiceCall.bind(twilioVoiceController));

export default router;

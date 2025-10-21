import dotenv from 'dotenv';

dotenv.config();

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  apiKeySid: string;
  apiKeySecret: string;
}

const twilioConfig: TwilioConfig = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_AUTH_TOKEN || '',
  apiKeySid: process.env.TWILIO_API_KEY_SID || '',
  apiKeySecret: process.env.TWILIO_API_KEY_SECRET || '',
};

// Validar que las credenciales estén presentes
const validateTwilioConfig = (): void => {
  const requiredFields: (keyof TwilioConfig)[] = [
    'accountSid',
    'authToken',
    'apiKeySid',
    'apiKeySecret',
  ];

  const missingFields = requiredFields.filter(
    (field) => !twilioConfig[field]
  );

  if (missingFields.length > 0) {
    throw new Error(
      `Missing Twilio configuration: ${missingFields.join(', ')}`
    );
  }
};

validateTwilioConfig();

export default twilioConfig;

import axios from 'axios';
import { normalizarTelefonoE164 } from '../helpers/phone.helper';

interface VoiceCallResponse {
  success: boolean;
  data?: any;
  error?: string;
  details?: any;
}

class TwilioVoiceService {
  private accountSid: string;
  private authToken: string;
  private twilioPhoneNumber: string;
  private baseUrl: string;

  constructor() {
    // Intentar usar variables específicas de VOICE primero, luego hacer fallback a las generales
    this.accountSid = process.env.TWILIO_VOICE_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID || '';
    this.authToken = process.env.TWILIO_VOICE_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN || '';
    this.twilioPhoneNumber = '+576015148805'; // Número de Twilio Voice
    this.baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Calls.json`;

    // Log para debugging (solo primeros/últimos caracteres por seguridad)
    console.log(`[TwilioVoice] Account SID: ${this.accountSid.substring(0, 8)}...${this.accountSid.substring(this.accountSid.length - 4)}`);
    console.log(`[TwilioVoice] Auth Token configured: ${this.authToken ? 'YES (***' + this.authToken.substring(this.authToken.length - 4) + ')' : 'NO'}`);

    if (!this.accountSid || !this.authToken) {
      console.warn('⚠️  Twilio Voice credentials not configured');
    }
  }

  /**
   * Realiza una llamada de voz usando Twilio
   * @param toNumber - Número en cualquier formato; se normaliza a E.164 internamente
   * @param nombrePaciente - Nombre del paciente para personalizar el mensaje
   * @returns Resultado de la llamada
   */
  async makeVoiceCall(toNumber: string, nombrePaciente: string = 'paciente'): Promise<VoiceCallResponse> {
    if (!this.accountSid || !this.authToken) {
      return {
        success: false,
        error: 'Twilio Voice credentials not configured'
      };
    }

    // El campo `To` de Twilio exige E.164 con `+`. Normalizamos acá (y no solo en el
    // frontend) porque este es el último punto antes de la API: si el caller manda
    // un internacional sin `+` (ej: 51965423527), Twilio responde 21211.
    const destino = normalizarTelefonoE164(toNumber);
    if (!destino) {
      return {
        success: false,
        error: `Número de destino inválido: ${toNumber}`
      };
    }

    try {
      console.log(`📞 Iniciando llamada a: ${destino}${destino !== toNumber ? ` (recibido: ${toNumber})` : ''}`);
      console.log(`📞 Desde número: ${this.twilioPhoneNumber}`);
      console.log(`📞 Using Account SID: ${this.accountSid.substring(0, 8)}...${this.accountSid.substring(this.accountSid.length - 4)}`);
      console.log(`📞 Using Auth Token: ***${this.authToken.substring(this.authToken.length - 4)}`);

      // Construir URL del webhook de voz (dominio propio de la instancia vía APP_URL)
      const baseUrl = process.env.APP_URL || 'https://medico-bsl.com';
      const webhookUrl = `${baseUrl}/api/twilio/voice?nombre=${encodeURIComponent(nombrePaciente)}`;
      console.log(`📞 URL de webhook: ${webhookUrl}`);

      // Credenciales Basic Auth
      const auth = {
        username: this.accountSid,
        password: this.authToken
      };

      // Parámetros de la llamada
      const params = new URLSearchParams();
      params.append('To', destino);
      params.append('From', this.twilioPhoneNumber);
      params.append('Url', webhookUrl);

      const response = await axios.post(this.baseUrl, params.toString(), {
        auth,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      console.log(`✅ Llamada iniciada exitosamente al número: ${destino}`);
      console.log(`📞 Call SID: ${response.data.sid}`);
      console.log(`📞 Status: ${response.data.status}`);

      return {
        success: true,
        data: response.data
      };
    } catch (error: any) {
      console.error(`❌ Error al realizar la llamada al número ${destino}:`, error.message);

      if (error.response) {
        console.error(`📊 Respuesta de Twilio (status ${error.response.status}):`, error.response.data);
        return {
          success: false,
          error: error.response.data.message || `Error ${error.response.status}`,
          details: error.response.data
        };
      }

      return {
        success: false,
        error: error.message || 'Error al realizar la llamada'
      };
    }
  }
}

export default new TwilioVoiceService();

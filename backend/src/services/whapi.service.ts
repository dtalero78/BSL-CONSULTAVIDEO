import axios from 'axios';

/**
 * Servicio para enviar mensajes de WhatsApp usando WHAPI API
 * Usado para alertas internas (OMEGA, etc.) que no requieren templates de Twilio
 */
class WhapiService {
  private readonly apiUrl = 'https://gate.whapi.cloud/messages/text';
  private readonly token: string;
  private readonly maxRetries = 3;
  private readonly timeoutMs = 30000;

  constructor() {
    this.token = process.env.WHAPI_TOKEN || '';

    if (!this.token) {
      console.warn('⚠️  WHAPI_TOKEN no configurado - servicio WHAPI no disponible');
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Envía un mensaje de texto por WhatsApp con reintentos automáticos
   * @param phone Número de teléfono SIN el prefijo + (ejemplo: 573001234567)
   * @param message Mensaje a enviar
   * @param attempt Número de intento actual (uso interno)
   */
  async sendTextMessage(
    phone: string,
    message: string,
    attempt: number = 1
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.token) {
      console.error('❌ WHAPI_TOKEN no está configurado');
      return { success: false, error: 'Token de WHAPI no configurado' };
    }

    const cleanPhone = phone.startsWith('+') ? phone.substring(1) : phone;

    try {
      console.log(`📱 [WHAPI] Enviando WhatsApp a: ${cleanPhone} (intento ${attempt}/${this.maxRetries})`);

      const response = await axios.post(
        this.apiUrl,
        { typing_time: 0, to: cleanPhone, body: message },
        {
          headers: {
            'accept': 'application/json',
            'authorization': `Bearer ${this.token}`,
            'content-type': 'application/json',
          },
          timeout: this.timeoutMs,
        }
      );

      console.log(`✅ [WHAPI] WhatsApp enviado exitosamente a ${cleanPhone}`);
      return { success: true };
    } catch (error: any) {
      const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
      const is5xxError = error.response?.status >= 500 && error.response?.status < 600;
      const shouldRetry = (isTimeout || is5xxError) && attempt < this.maxRetries;

      if (shouldRetry) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.warn(`⚠️  [WHAPI] Error en intento ${attempt}/${this.maxRetries}. Reintentando en ${backoffMs / 1000}s...`);
        await this.sleep(backoffMs);
        return this.sendTextMessage(phone, message, attempt + 1);
      }

      const errorMessage = error.response?.data?.message || error.message || 'Error desconocido';
      console.error(`❌ [WHAPI] Error enviando WhatsApp después de ${attempt} intentos:`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }
}

export default new WhapiService();

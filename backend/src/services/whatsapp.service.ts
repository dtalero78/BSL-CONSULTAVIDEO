import axios from 'axios';

/**
 * Servicio para enviar mensajes de WhatsApp usando WHAPI API
 */
class WhatsAppService {
  private readonly apiUrl = 'https://gate.whapi.cloud/messages/text';
  private readonly token: string;
  private readonly maxRetries = 3;
  private readonly timeoutMs = 30000; // 30 segundos

  constructor() {
    this.token = process.env.WHAPI_TOKEN || '';

    if (!this.token) {
      console.warn('⚠️  WHAPI_TOKEN no configurado - servicio de WhatsApp no disponible');
    }
  }

  /**
   * Espera un tiempo determinado (para backoff exponencial)
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Envía un mensaje de texto por WhatsApp con reintentos automáticos
   * @param phone Número de teléfono SIN el prefijo + (ejemplo: 573001234567)
   * @param message Mensaje a enviar
   * @param attempt Número de intento actual (uso interno)
   * @returns Resultado del envío
   */
  async sendTextMessage(
    phone: string,
    message: string,
    attempt: number = 1
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.token) {
      console.error('❌ WHAPI_TOKEN no está configurado');
      return {
        success: false,
        error: 'Token de WhatsApp no configurado'
      };
    }

    // Limpiar el número de teléfono (quitar + si existe)
    const cleanPhone = phone.startsWith('+') ? phone.substring(1) : phone;

    try {
      console.log(`📱 Enviando WhatsApp a: ${cleanPhone} (intento ${attempt}/${this.maxRetries})`);

      const response = await axios.post(
        this.apiUrl,
        {
          typing_time: 0,
          to: cleanPhone,
          body: message,
        },
        {
          headers: {
            'accept': 'application/json',
            'authorization': `Bearer ${this.token}`,
            'content-type': 'application/json',
          },
          timeout: this.timeoutMs,
        }
      );

      console.log(`✅ WhatsApp enviado exitosamente a ${cleanPhone}`);
      console.log('Respuesta WHAPI:', response.data);

      return { success: true };
    } catch (error: any) {
      const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
      const is5xxError = error.response?.status >= 500 && error.response?.status < 600;
      const shouldRetry = (isTimeout || is5xxError) && attempt < this.maxRetries;

      if (shouldRetry) {
        // Backoff exponencial: 2s, 4s, 8s
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.warn(
          `⚠️  Error en intento ${attempt}/${this.maxRetries}. ` +
          `Reintentando en ${backoffMs / 1000}s... ` +
          `(Razón: ${isTimeout ? 'Timeout' : `Error ${error.response?.status}`})`
        );

        await this.sleep(backoffMs);
        return this.sendTextMessage(phone, message, attempt + 1);
      }

      // Error final después de todos los reintentos
      const errorMessage = this.getErrorMessage(error);
      console.error(
        `❌ Error enviando WhatsApp después de ${attempt} intentos:`,
        errorMessage
      );

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Extrae un mensaje de error legible
   */
  private getErrorMessage(error: any): string {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return 'Timeout - El servicio de WhatsApp tardó demasiado en responder';
    }

    if (error.response?.status === 524) {
      return 'Error 524 - Timeout en el servidor de WhatsApp (Cloudflare)';
    }

    if (error.response?.data?.message) {
      return error.response.data.message;
    }

    if (error.message) {
      return error.message;
    }

    return 'Error desconocido al enviar WhatsApp';
  }
}

export default new WhatsAppService();

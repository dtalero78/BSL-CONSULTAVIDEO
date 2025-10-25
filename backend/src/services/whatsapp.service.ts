import axios from 'axios';

/**
 * Servicio para enviar mensajes de WhatsApp usando WHAPI API
 */
class WhatsAppService {
  private readonly apiUrl = 'https://gate.whapi.cloud/messages/text';
  private readonly token: string;

  constructor() {
    this.token = process.env.WHAPI_TOKEN || '';

    if (!this.token) {
      console.warn('⚠️  WHAPI_TOKEN no configurado - servicio de WhatsApp no disponible');
    }
  }

  /**
   * Envía un mensaje de texto por WhatsApp
   * @param phone Número de teléfono SIN el prefijo + (ejemplo: 573001234567)
   * @param message Mensaje a enviar
   * @returns Resultado del envío
   */
  async sendTextMessage(phone: string, message: string): Promise<{ success: boolean; error?: string }> {
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
      console.log(`📱 Enviando WhatsApp a: ${cleanPhone}`);

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
        }
      );

      console.log(`✅ WhatsApp enviado exitosamente a ${cleanPhone}`);
      console.log('Respuesta WHAPI:', response.data);

      return { success: true };
    } catch (error: any) {
      console.error('❌ Error enviando WhatsApp:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Error al enviar WhatsApp'
      };
    }
  }
}

export default new WhatsAppService();

import twilio from 'twilio';
import postgresService from './postgres.service';

interface TwilioCreds {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  templateSid: string;
}

/**
 * Servicio multi-tenant para enviar mensajes de WhatsApp usando Twilio.
 * Cada tenant tiene sus propias credenciales en tenants.credenciales.twilio.
 * Si el tenant es 'bsl' o no tiene credenciales, cae a env vars TWILIO_* (zero-regression).
 */
class WhatsAppService {
  private readonly statusCallbackUrl: string;
  private readonly maxRetries = 3;
  private readonly clientsCache = new Map<string, { client: twilio.Twilio; creds: TwilioCreds; t: number }>();
  private readonly CREDS_TTL = 60_000; // 1 min

  constructor() {
    this.statusCallbackUrl = process.env.WHATSAPP_STATUS_CALLBACK_URL || 'https://bsl-plataforma.com/api/whatsapp/status';
    console.log('✅ Twilio WhatsApp Service inicializado (multi-tenant)');
    console.log(`   Status Callback: ${this.statusCallbackUrl}`);
  }

  /**
   * Resuelve credenciales Twilio del tenant. Cache 60s.
   */
  private async getCreds(tenantId: string = 'bsl'): Promise<TwilioCreds | null> {
    const tid = tenantId || 'bsl';
    const cached = this.clientsCache.get(tid);
    if (cached && Date.now() - cached.t < this.CREDS_TTL) {
      return cached.creds;
    }

    let creds: TwilioCreds | null = null;

    if (tid !== 'bsl') {
      // Leer de tenants.credenciales.twilio
      const rows = await postgresService.query(
        "SELECT credenciales->'twilio' AS twilio FROM tenants WHERE id = $1 AND activo = true LIMIT 1",
        [tid]
      );
      if (rows && rows.length > 0 && rows[0].twilio && rows[0].twilio.account_sid && rows[0].twilio.auth_token) {
        const t = rows[0].twilio;
        creds = {
          accountSid: t.account_sid,
          authToken: t.auth_token,
          fromNumber: t.whatsapp_from || 'whatsapp:+573008021701',
          templateSid: (t.templates && t.templates.cita_calendario) || t.template_cita_calendario || process.env.TWILIO_WHATSAPP_TEMPLATE_SID || 'HXc8473cfd60cd378314355e17e736d24d',
        };
      }
    }

    if (!creds) {
      // Fallback a env vars (BSL default)
      const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
      const authToken = process.env.TWILIO_AUTH_TOKEN || '';
      if (!accountSid || !authToken) {
        console.warn(`⚠️  Sin credenciales Twilio para tenant ${tid}`);
        return null;
      }
      creds = {
        accountSid,
        authToken,
        fromNumber: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+3153369631',
        templateSid: process.env.TWILIO_WHATSAPP_TEMPLATE_SID || 'HXc8473cfd60cd378314355e17e736d24d',
      };
    }

    const client = twilio(creds.accountSid, creds.authToken);
    this.clientsCache.set(tid, { client, creds, t: Date.now() });
    return creds;
  }

  private async getClient(tenantId: string = 'bsl'): Promise<{ client: twilio.Twilio; creds: TwilioCreds } | null> {
    const creds = await this.getCreds(tenantId);
    if (!creds) return null;
    const cached = this.clientsCache.get(tenantId || 'bsl');
    return cached ? { client: cached.client, creds } : null;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private formatPhoneNumber(phone: string): string {
    let cleanPhone = phone.replace(/[\s\(\)\-\+]/g, '');
    if (cleanPhone.length === 10 && /^\d{10}$/.test(cleanPhone)) {
      return `whatsapp:57${cleanPhone}`;
    }
    if (cleanPhone.startsWith('57') && cleanPhone.length === 12) {
      return `whatsapp:${cleanPhone}`;
    }
    return `whatsapp:${cleanPhone}`;
  }

  /**
   * Envía template aprobado con variables. Usa credenciales del tenant.
   */
  async sendTemplateMessage(
    phone: string,
    roomNameWithParams: string,
    patientName: string,
    doctorCode: string,
    tenantId: string = 'bsl',
    attempt: number = 1
  ): Promise<{ success: boolean; error?: string; messageSid?: string }> {
    const clientData = await this.getClient(tenantId);
    if (!clientData) {
      return { success: false, error: 'Cliente de Twilio no configurado' };
    }
    const { client, creds } = clientData;
    const toNumber = this.formatPhoneNumber(phone);

    try {
      console.log(`📱 Enviando WhatsApp template (tenant=${tenantId}) a: ${toNumber} (intento ${attempt}/${this.maxRetries})`);

      const twilioMessage = await client.messages.create({
        from: creds.fromNumber,
        to: toNumber,
        contentSid: creds.templateSid,
        contentVariables: JSON.stringify({
          '1': roomNameWithParams,
          '2': patientName,
          '3': doctorCode,
        }),
        statusCallback: this.statusCallbackUrl,
      });

      console.log(`✅ WhatsApp template enviado (tenant=${tenantId}, sid=${twilioMessage.sid})`);
      return { success: true, messageSid: twilioMessage.sid };
    } catch (error: any) {
      const isRetryableError = this.isRetryableError(error);
      const shouldRetry = isRetryableError && attempt < this.maxRetries;

      if (shouldRetry) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.warn(`⚠️  Intento ${attempt}/${this.maxRetries} falló. Reintentando en ${backoffMs / 1000}s (${error.message})`);
        await this.sleep(backoffMs);
        return this.sendTemplateMessage(phone, roomNameWithParams, patientName, doctorCode, tenantId, attempt + 1);
      }

      const errorMessage = this.getErrorMessage(error);
      console.error(`❌ Error enviando WhatsApp template (tenant=${tenantId}): ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Envía mensaje de texto libre. Usa credenciales del tenant.
   */
  async sendTextMessage(
    phone: string,
    message: string,
    tenantId: string = 'bsl',
    attempt: number = 1
  ): Promise<{ success: boolean; error?: string; messageSid?: string }> {
    const clientData = await this.getClient(tenantId);
    if (!clientData) {
      return { success: false, error: 'Cliente de Twilio no configurado' };
    }
    const { client, creds } = clientData;
    const toNumber = this.formatPhoneNumber(phone);

    try {
      console.log(`📱 Enviando WhatsApp texto libre (tenant=${tenantId}) a: ${toNumber} (intento ${attempt}/${this.maxRetries})`);

      const twilioMessage = await client.messages.create({
        from: creds.fromNumber,
        to: toNumber,
        body: message,
        statusCallback: this.statusCallbackUrl,
      });

      console.log(`✅ WhatsApp enviado (tenant=${tenantId}, sid=${twilioMessage.sid})`);
      return { success: true, messageSid: twilioMessage.sid };
    } catch (error: any) {
      const isRetryableError = this.isRetryableError(error);
      const shouldRetry = isRetryableError && attempt < this.maxRetries;

      if (shouldRetry) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.warn(`⚠️  Intento ${attempt}/${this.maxRetries} falló. Reintentando en ${backoffMs / 1000}s (${error.message})`);
        await this.sleep(backoffMs);
        return this.sendTextMessage(phone, message, tenantId, attempt + 1);
      }

      const errorMessage = this.getErrorMessage(error);
      console.error(`❌ Error enviando WhatsApp (tenant=${tenantId}): ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  private isRetryableError(error: any): boolean {
    const retryableErrorCodes = [20429, 20500, 20503, 30001, 30002, 30003, 30004, 30005, 30006, 30007, 30008];
    if (error.code && retryableErrorCodes.includes(error.code)) return true;
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') return true;
    return false;
  }

  private getErrorMessage(error: any): string {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return 'Timeout - El servicio de Twilio tardó demasiado en responder';
    }
    if (error.code) return `Error ${error.code}: ${error.message || 'Error de Twilio'}`;
    if (error.message) return error.message;
    return 'Error desconocido al enviar WhatsApp';
  }

  /** Invalida cache de credenciales (para tests o cambios en BD) */
  invalidateCache(): void {
    this.clientsCache.clear();
  }
}

export default new WhatsAppService();

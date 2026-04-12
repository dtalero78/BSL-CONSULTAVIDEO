import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const EMAIL_FROM = process.env.SMTP_FROM || process.env.SMTP_USER;

class EmailService {
  /**
   * Enviar email con link de videollamada al paciente
   */
  async enviarEmailVideoConsulta({
    correo,
    nombrePaciente,
    doctorCode,
    videoCallUrl,
    tenantNombre,
  }: {
    correo: string;
    nombrePaciente: string;
    doctorCode: string;
    videoCallUrl: string;
    tenantNombre?: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (!correo || !EMAIL_FROM) {
      console.log('[EMAIL] No se envio email: correo o SMTP no configurado');
      return { success: false, error: 'Correo o SMTP no configurado' };
    }

    try {
      const brandName = tenantNombre || 'BSL Salud Ocupacional';
      const html = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
          <div style="background: #0D6EFD; padding: 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 22px;">${brandName}</h1>
          </div>
          <div style="padding: 32px 24px;">
            <h2 style="color: #181818; margin-top: 0;">Consulta Medica Virtual</h2>
            <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
              Hola <strong>${nombrePaciente}</strong>,
            </p>
            <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
              Tienes una consulta medica virtual programada con el <strong>Dr. ${doctorCode}</strong>.
            </p>
            <p style="color: #4B5563; font-size: 16px; line-height: 1.6;">
              Haz clic en el siguiente boton para ingresar a la videollamada:
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${videoCallUrl}" target="_blank"
                 style="background: #0D6EFD; color: #ffffff; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: 600; display: inline-block;">
                &#128249; Ingresar a Videollamada
              </a>
            </div>
            <p style="color: #9CA3AF; font-size: 13px; line-height: 1.6;">
              Si el boton no funciona, copia y pega este enlace en tu navegador:<br>
              <a href="${videoCallUrl}" style="color: #0D6EFD;">${videoCallUrl}</a>
            </p>
          </div>
          <div style="background: #F9FAFB; padding: 16px 24px; text-align: center; border-top: 1px solid #E5E7EB;">
            <p style="color: #9CA3AF; font-size: 12px; margin: 0;">${brandName}</p>
          </div>
        </div>
      `;

      const info = await transporter.sendMail({
        from: `"${brandName}" <${EMAIL_FROM}>`,
        to: correo,
        subject: `Consulta medica virtual - Dr. ${doctorCode}`,
        html,
      });

      console.log(`[EMAIL] Video consulta enviada a ${correo} (ID: ${info.messageId})`);
      return { success: true };
    } catch (err: any) {
      console.error(`[ERROR] Error enviando email video consulta a ${correo}:`, err.message);
      return { success: false, error: err.message };
    }
  }
}

export default new EmailService();

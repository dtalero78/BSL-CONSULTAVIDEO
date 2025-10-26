// backend/TWILIO.jsw
import { getSecret } from 'wix-secrets-backend';
import { fetch } from 'wix-fetch';

/**
 * Función para realizar una llamada de voz usando Twilio
 * @param {string} toNumber - Número de teléfono con prefijo +57XXXXXXXXXX
 * @param {string} nombrePaciente - Nombre del paciente para personalizar el mensaje
 * @returns {Promise<object>} - Resultado de la llamada
 */
export async function makeVoiceCall(toNumber, nombrePaciente = "paciente") {
    const accountSid = await getSecret("TWILIO_ACCOUNT_SID");
    const authToken = await getSecret("TWILIO_AUTH_TOKEN");
    const twilioPhoneNumber = '+576015148805'; // Tu número de Twilio

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;

    const params = new URLSearchParams();
    params.append('To', toNumber);
    params.append('From', twilioPhoneNumber);
    // URL que Twilio llamará para obtener las instrucciones de voz
    params.append('Url', `https://www.bsl.com.co/_functions/voice?nombre=${encodeURIComponent(nombrePaciente)}`);

    try {
        // Crear credenciales en base64 manualmente (sin usar Buffer)
        const credentials = btoa(`${accountSid}:${authToken}`);

        console.log(`📞 Iniciando llamada a: ${toNumber}`);
        console.log(`📞 Desde número: ${twilioPhoneNumber}`);
        console.log(`📞 URL de webhook: https://www.bsl.com.co/_functions/voice?nombre=${encodeURIComponent(nombrePaciente)}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                "Authorization": `Basic ${credentials}`,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: params.toString()
        });

        const data = await response.json();

        console.log(`📊 Respuesta de Twilio (status ${response.status}):`, data);

        // Verificar si hay errores en la respuesta
        if (data.error_code || data.code || response.status >= 400) {
            console.error(`❌ Error en respuesta de Twilio:`, {
                status: response.status,
                error_code: data.error_code,
                error_message: data.message,
                code: data.code
            });
            return {
                success: false,
                error: data.message || `Error ${response.status}`,
                details: data
            };
        }

        console.log(`✅ Llamada iniciada exitosamente al número: ${toNumber}`);
        console.log(`📞 Call SID: ${data.sid}`);
        console.log(`📞 Status: ${data.status}`);

        return { success: true, data };
    } catch (error) {
        console.error(`❌ Error al realizar la llamada al número ${toNumber}:`, error);
        return { success: false, error: error.toString() };
    }
}


import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Normalización de números telefónicos para el panel médico.
 *
 * Colombia es el país por defecto: un número nacional de 10 dígitos se asume colombiano.
 * Los números que ya traen indicativo internacional (con o sin `+`) se respetan.
 *
 * Debe mantenerse en sync con backend/src/helpers/phone.helper.ts.
 *
 * Historia: había dos implementaciones distintas en el frontend (MedicalPanelPage y
 * medical-panel.service), ambas con una whitelist de ~9 indicativos. Un número peruano
 * no matcheaba ninguno: la llamada salía sin `+` (Twilio 21211) y — peor — el WhatsApp
 * se derivaba con `phoneWithPlus.substring(1)`, que al no haber `+` cortaba un dígito real
 * y terminaba enviando el link de la consulta a un tercero.
 */

/** Normaliza a E.164 CON `+`. Formato que exigen Twilio Voice (`To`) y WhatsApp. */
export function toE164(celular: string | null | undefined): string | null {
  if (!celular) return null;

  const limpio = celular
    .toString()
    .replace(/^whatsapp:/i, '')
    .replace(/[^\d+]/g, '');

  const teniaMas = limpio.startsWith('+');
  const digitos = limpio.replace(/\+/g, '');
  if (!digitos) return null;

  // 1) Indicativo internacional explícito → se respeta.
  if (teniaMas) {
    const parsed = parsePhoneNumberFromString('+' + digitos);
    return parsed && parsed.isValid() ? parsed.number : '+' + digitos;
  }

  // 2) Colombia con indicativo pero sin `+`
  if (digitos.length === 12 && digitos.startsWith('57')) {
    const parsed = parsePhoneNumberFromString('+' + digitos);
    if (parsed && parsed.isValid()) return parsed.number;
  }

  // 3) Nacional colombiano de 10 dígitos (móvil 3XX, fijo 60X). Antes del intento
  //    internacional: 300/350/601 también son indicativos de otros países.
  if (digitos.length === 10) {
    const parsed = parsePhoneNumberFromString(digitos, 'CO');
    if (parsed && parsed.isValid()) return parsed.number;
  }

  // 4) Internacional sin `+`
  if (digitos.length >= 8) {
    const parsed = parsePhoneNumberFromString('+' + digitos);
    if (parsed && parsed.isValid()) return parsed.number;

    // México legacy: +52 1 XXXXXXXXXX → WhatsApp rechaza el `1`.
    if (digitos.startsWith('521') && digitos.length === 13) {
      const sinUno = parsePhoneNumberFromString('+52' + digitos.slice(3));
      if (sinUno && sinUno.isValid()) return sinUno.number;
    }

    if (parsed && parsed.isPossible()) return parsed.number;
  }

  // 5) Fallback: asumir colombiano.
  return '+57' + digitos;
}

/** Normaliza a E.164 SIN `+` (573001234567). Para la API de WhatsApp y links wa.me. */
export function toE164SinMas(celular: string | null | undefined): string | null {
  const e164 = toE164(celular);
  return e164 ? e164.replace(/^\+/, '') : null;
}

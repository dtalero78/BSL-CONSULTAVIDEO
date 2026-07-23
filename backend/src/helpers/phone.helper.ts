import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Helper para normalización de números de teléfono.
 *
 * Colombia es el país por defecto: un número nacional de 10 dígitos se asume colombiano.
 * Los números que ya traen indicativo internacional (con o sin `+`) se respetan.
 *
 * Debe mantenerse en sync con src/helpers/phone.js de BSL-PLATAFORMA2.
 *
 * Historia: antes esto era una whitelist manual de indicativos, y además había otras tres
 * versiones ad-hoc del mismo algoritmo (whatsapp.service, MedicalPanelPage, medical-panel.service).
 * Ninguna manejaba bien los internacionales: una llamada a un peruano salía como
 * `To=51965423527` (sin `+`, Twilio la rechaza) y el WhatsApp terminaba en +571965423527,
 * o sea en el teléfono de un tercero.
 */

/**
 * Normaliza un número de teléfono a E.164 CON `+`.
 * Es el formato que exigen Twilio Voice (`To`) y Twilio WhatsApp (`whatsapp:+...`).
 * @param celular Número en cualquier formato (+573001234567, whatsapp:+573001234567, 3001234567, ...)
 * @returns '+573001234567' | '+15394301312' | null
 */
export function normalizarTelefonoE164(celular: string | null | undefined): string | null {
  if (!celular) return null;

  const limpio = celular
    .toString()
    .replace(/^whatsapp:/i, '')
    .replace(/[^\d+]/g, '');

  const teniaMas = limpio.startsWith('+');
  const digitos = limpio.replace(/\+/g, '');
  if (!digitos) return null;

  // 1) Ya venía con indicativo internacional explícito → se respeta.
  if (teniaMas) {
    const parsed = parsePhoneNumberFromString('+' + digitos);
    return parsed && parsed.isValid() ? parsed.number : '+' + digitos;
  }

  // 2) Colombia con indicativo pero sin `+`: 57 + 10 dígitos
  if (digitos.length === 12 && digitos.startsWith('57')) {
    const parsed = parsePhoneNumberFromString('+' + digitos);
    if (parsed && parsed.isValid()) return parsed.number;
  }

  // 3) Nacional colombiano de 10 dígitos (móvil 3XX, fijo 60X). Va ANTES del intento
  //    internacional: 300/350/601 son también indicativos de otros países y acá gana Colombia.
  if (digitos.length === 10) {
    const parsed = parsePhoneNumberFromString(digitos, 'CO');
    if (parsed && parsed.isValid()) return parsed.number;
  }

  // 4) Internacional sin `+` (15394301312 → US, 51965423527 → PE).
  if (digitos.length >= 8) {
    const parsed = parsePhoneNumberFromString('+' + digitos);
    if (parsed && parsed.isValid()) return parsed.number;

    // México legacy: +52 1 XXXXXXXXXX. Hoy ese `1` sobra y WhatsApp lo rechaza.
    if (digitos.startsWith('521') && digitos.length === 13) {
      const sinUno = parsePhoneNumberFromString('+52' + digitos.slice(3));
      if (sinUno && sinUno.isValid()) return sinUno.number;
    }

    if (parsed && parsed.isPossible()) return parsed.number;
  }

  // 5) Fallback: asumir colombiano.
  return '+57' + digitos;
}

/**
 * Igual que `normalizarTelefonoE164` pero SIN el `+`.
 * Formato estándar para WHAPI y para los lookups por `celular` en BD: 573001234567.
 */
export function normalizarTelefonoSinMas(celular: string | null | undefined): string | null {
  const e164 = normalizarTelefonoE164(celular);
  return e164 ? e164.replace(/^\+/, '') : null;
}

/**
 * Formato listo para el campo `to` de Twilio WhatsApp: whatsapp:+57XXXXXXXXXX
 */
export function formatearParaWhatsApp(celular: string | null | undefined): string | null {
  if (!celular) return null;
  if (celular.toString().startsWith('whatsapp:')) return celular.toString();
  const e164 = normalizarTelefonoE164(celular);
  return e164 ? `whatsapp:${e164}` : null;
}

/**
 * @deprecated Usar `normalizarTelefonoSinMas`. Se conserva el nombre por compatibilidad
 * con el helper equivalente de BSL-PLATAFORMA2.
 */
export const normalizarTelefonoConPrefijo57 = normalizarTelefonoSinMas;

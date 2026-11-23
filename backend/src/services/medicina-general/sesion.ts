// ============================================================================
// Sesión del médico con PIN (medicina general). Partes puras, sin base de datos,
// para probarlas con jest. Tablas: medicos_pin y medicos_sesiones (migración 0018
// de BSL-PLATAFORMA2). Del token solo se guarda el sha256: si se filtra la tabla,
// las sesiones no se pueden usar.
// ============================================================================

import { createHash, randomBytes } from 'crypto';

export const MAX_INTENTOS = 5;
export const MINUTOS_BLOQUEO = 15;
export const HORAS_SESION = 12;

/** Token de sesión: 32 bytes aleatorios en base64url (43 caracteres). */
export function generarToken(): string {
  return randomBytes(32).toString('base64url');
}

/** sha256 en hexadecimal (64 caracteres), lo que se guarda en medicos_sesiones.token_hash. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** 'Bearer <token>' → token; null si no viene o no tiene forma de token. */
export function extraerBearer(cabecera: unknown): string | null {
  if (typeof cabecera !== 'string') return null;
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,200})\s*$/.exec(cabecera);
  return m ? m[1] : null;
}

/** Alias comparable: sin espacios a los lados y en mayúsculas ('sixta ' → 'SIXTA'). */
export function normalizarAlias(alias: unknown): string {
  return typeof alias === 'string' ? alias.trim().toUpperCase() : '';
}

/**
 * Resultado de un PIN equivocado: suma un intento; al llegar a MAX_INTENTOS se bloquea
 * MINUTOS_BLOQUEO y el contador vuelve a cero.
 */
export function registrarFallo(intentosPrevios: number): { intentos: number; bloquear: boolean } {
  const intentos = Math.max(0, intentosPrevios) + 1;
  return intentos >= MAX_INTENTOS ? { intentos: 0, bloquear: true } : { intentos, bloquear: false };
}

/** ¿Sigue bloqueado? (bloqueado_hasta en el futuro). */
export function estaBloqueado(bloqueadoHasta: Date | string | null | undefined, ahora: Date = new Date()): boolean {
  if (!bloqueadoHasta) return false;
  const hasta = new Date(bloqueadoHasta).getTime();
  return Number.isFinite(hasta) && hasta > ahora.getTime();
}

/**
 * IP para el registro (viene de cabeceras que pone quien llama): solo se guarda si parece
 * una IP y cabe en la columna (45). Lo demás se descarta, nunca hace fallar la petición.
 */
export function ipValida(ip: unknown): string | null {
  if (typeof ip !== 'string') return null;
  const limpia = ip.trim();
  return /^[0-9a-fA-F.:]{3,45}$/.test(limpia) ? limpia : null;
}

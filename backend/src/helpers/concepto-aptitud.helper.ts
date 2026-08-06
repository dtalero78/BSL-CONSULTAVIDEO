/**
 * Clasificación del concepto médico de aptitud laboral ("mdConceptoFinal").
 *
 * La BD tiene muchos vocabularios conviviendo: el "APTO" corto legacy, el histórico Wix
 * ("ELEGIBLE PARA EL CARGO SIN RECOMENDACIONES LABORALES"), las redacciones largas
 * "médico-laborales" del dropdown actual del panel médico, y texto libre. Cualquier match
 * por string exacto se rompe con esa variedad — por eso se clasifica por reglas.
 *
 * Debe mantenerse en sync con public/panel-empresas.html de BSL-PLATAFORMA2
 * (función esConceptoAptoSinAprobacion): mismo criterio de "apto pleno". Lo que allá libera
 * el certificado sin aprobación SST es exactamente lo que acá NO requiere revisión de SST.
 */

/** Normaliza: sin tildes, MAYÚSCULAS, espacios/saltos colapsados, sin punto(s) final(es). */
function normalizarConcepto(concepto: string): string {
  return concepto
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // sin tildes
    .toUpperCase()
    .replace(/\s+/g, ' ')   // colapsa espacios y saltos de línea
    .replace(/\.+\s*$/, '') // quita punto(s) final(es)
    .trim();
}

/**
 * "Apto pleno" = APTO/ELEGIBLE del cargo SIN restricciones y SIN recomendaciones.
 * Es el único grupo que libera el certificado sin aprobación SST (excepción OMEGA).
 * NO son apto pleno: NO APTO / NO ELEGIBLE, restricciones incompatibles, pendiente/aplazado,
 * "con restricciones" (temporales/permanentes), "con recomendaciones", "no presenta deterioro"
 * (egreso) y cualquier texto libre que no arranque en APTO/ELEGIBLE.
 */
export function esConceptoAptoPleno(concepto: string | null | undefined): boolean {
  if (!concepto) return false;
  const c = normalizarConcepto(concepto);
  if (/\bNO\s+(APTO|ELEGIBLE)/.test(c)) return false;
  if (c.includes('INCOMPATIBLE')) return false;
  if (c.includes('PENDIENTE') || c.includes('APLAZADO')) return false;
  if (c.includes('DETERIORO')) return false; // "NO PRESENTA DETERIORO..." (egreso, no aptitud de cargo)
  if (c.includes('RESTRICCION') && !c.includes('SIN RESTRICCION')) return false; // con restricciones
  if (c.includes('RECOMENDACION') && !c.includes('SIN RECOMENDACION')) return false; // con recomendaciones
  return /^(APTO|APTA|ELEGIBLE)\b/.test(c);
}

/**
 * ¿El concepto debe disparar la alerta de revisión de SST (OMEGA)?
 *
 * Regla: alertar en TODO lo que NO sea apto pleno (restricciones, con recomendaciones,
 * no apto/no elegible, incompatibles, pendiente/aplazado, texto libre), EXCEPTO el egreso
 * "NO PRESENTA DETERIORO FÍSICO POR ACTIVIDAD LABORAL" — que no es un hallazgo laboral y
 * generaría ruido.
 */
export function conceptoRequiereRevisionSst(concepto: string | null | undefined): boolean {
  if (!concepto) return false;
  if (esConceptoAptoPleno(concepto)) return false;
  if (normalizarConcepto(concepto).includes('DETERIORO')) return false; // egreso: no alerta
  return true;
}

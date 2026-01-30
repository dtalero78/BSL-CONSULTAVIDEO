/**
 * Helper para normalización de números de teléfono
 * Formato estándar: 57XXXXXXXXXX (sin +, sin whatsapp:)
 * Debe coincidir con el formato usado en BSL-PLATAFORMA2
 */

/**
 * Normaliza un número de teléfono al formato estándar
 * @param celular Número en cualquier formato (+573001234567, whatsapp:+573001234567, 3001234567, etc.)
 * @returns Número normalizado en formato 57XXXXXXXXXX (sin +)
 */
export function normalizarTelefonoConPrefijo57(celular: string | null | undefined): string | null {
  if (!celular) return null;

  // Limpiar prefijo whatsapp:, espacios, guiones, paréntesis y el signo +
  let telefono = celular
    .toString()
    .replace(/^whatsapp:/i, '')  // Quitar prefijo whatsapp:
    .replace(/[\s\-\(\)]/g, '')   // Quitar espacios, guiones, paréntesis
    .replace(/^\+/, '');          // Quitar el + del inicio

  // Si empieza con 57 y tiene longitud correcta (57 + 10 dígitos = 12)
  if (telefono.startsWith('57') && telefono.length === 12) {
    return telefono;
  }

  // Si empieza con otro prefijo internacional común (1, 34, 52, etc.)
  const prefijoInternacional = /^(1|7|20|27|30|31|32|33|34|36|39|40|41|43|44|45|46|47|48|49|51|52|53|54|55|56|58|60|61|62|63|64|65|66|81|82|84|86|90|91|92|93|94|95|98|212|213|216|218|220|221|222|223|224|225|226|227|228|229|230|231|232|233|234|235|236|237|238|239|240|241|242|243|244|245|246|247|248|249|250|251|252|253|254|255|256|257|258|260|261|262|263|264|265|266|267|268|269|290|291|297|298|299|350|351|352|353|354|355|356|357|358|359|370|371|372|373|374|375|376|377|378|380|381|382|383|385|386|387|389|420|421|423|500|501|502|503|504|505|506|507|508|509|590|591|592|593|594|595|596|597|598|599|670|672|673|674|675|676|677|678|679|680|681|682|683|685|686|687|688|689|690|691|692|850|852|853|855|856|880|886|960|961|962|963|964|965|966|967|968|970|971|972|973|974|975|976|977|992|993|994|995|996|998)\d+/;

  if (prefijoInternacional.test(telefono)) {
    // Es un número internacional, dejarlo tal cual (sin +)
    return telefono;
  }

  // Si tiene exactamente 10 dígitos, es un número colombiano sin prefijo
  if (telefono.length === 10 && /^\d{10}$/.test(telefono)) {
    return '57' + telefono;
  }

  // Si tiene 3 seguido de 9 dígitos (formato celular colombiano común)
  if (telefono.length === 10 && telefono.startsWith('3')) {
    return '57' + telefono;
  }

  // En cualquier otro caso, asumir que es colombiano y agregar 57
  return '57' + telefono;
}

/**
 * URL pública del certificado médico de una historia clínica.
 *
 * La genera BSL-UTILIDADES a partir del `_id` de HistoriaClinica (lee el registro
 * de PostgreSQL). Única fuente de verdad para el link que se envía por WhatsApp
 * (PARTICULAR / SANITHELP-JJ) y el que se reporta a integraciones (Maluwa360).
 */
const CERTIFICADO_BASE_URL = 'https://bsl-utilidades-yp78a.ondigitalocean.app/generar-certificado-desde-wix';

export function buildCertificadoUrl(historiaId: string): string {
  return `${CERTIFICADO_BASE_URL}/${historiaId}`;
}

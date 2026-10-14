import axios from 'axios';

/**
 * ihce.service — historia clínica nacional (IHCE, Res. 1888/2025) para el panel del médico.
 *
 * **Esta app no le habla al Ministerio.** Las credenciales OAuth, la suscripción del APIM y
 * el proxy con IP colombiana viven en PLATAFORMA2; duplicarlos acá significaría repartir
 * secretos entre dos despliegues para consultar lo mismo. Así que se le pide a esa app.
 *
 * Entra con `x-ihce-key` (una llave que solo abre las dos consultas de IHCE, de solo
 * lectura y ancladas a una orden) en vez del usuario y contraseña de un admin del tenant,
 * que es el patrón que usa el chat: si esta llave se filtra, el daño es mucho menor.
 *
 * El `x-tenant-id` va explícito, así que sirve cualquier host de PLATAFORMA2: el tenant no
 * se resuelve por dominio en este camino.
 *
 * Config (env):
 *   BSL_PLATAFORMA_URL   base de PLATAFORMA2 (ya la usa el proxy del chat)
 *   IHCE_SERVICE_KEY     la misma llave que tiene configurada PLATAFORMA2
 */

const BASE = (process.env.BSL_PLATAFORMA_URL || 'https://bsl-plataforma.com').replace(/\/+$/, '');
const KEY = process.env.IHCE_SERVICE_KEY || '';

/** Las consultas al bus del Ministerio tardan varios segundos; el sandbox, más. */
const TIMEOUT_MS = 45_000;

export class IhceNoConfigurado extends Error {
  constructor() {
    super('La consulta a la historia nacional no está configurada en este servidor');
    this.name = 'IhceNoConfigurado';
  }
}

function cliente() {
  if (!KEY) throw new IhceNoConfigurado();
  return axios.create({
    baseURL: `${BASE}/api/ihce`,
    timeout: TIMEOUT_MS,
    // Un 4xx de PLATAFORMA2 trae el motivo en el cuerpo y hay que poder mostrarlo
    // (ej.: "el médico no tiene documento cargado"), así que no se trata como excepción.
    validateStatus: () => true
  });
}

function cabeceras(tenantId: string) {
  return {
    'x-ihce-key': KEY,
    'x-tenant-id': tenantId,
    'x-ihce-origen': 'panel-video'
  };
}

export interface RespuestaIhce {
  status: number;
  data: any;
}

/** Listado de RDA del paciente de esa orden: antecedentes + encuentros clínicos. */
export async function consultarOrden(ordenId: string, tenantId: string): Promise<RespuestaIhce> {
  const r = await cliente().get(`/orden/${encodeURIComponent(ordenId)}`, { headers: cabeceras(tenantId) });
  return { status: r.status, data: r.data };
}

/**
 * Un documento, ya renderizado por PLATAFORMA2 (`?formato=html`).
 *
 * Se pide pintado y no el Bundle crudo a propósito: el renderizador vive en un solo lugar.
 * Traerse una copia acá la dejaría desincronizada la primera vez que el Ministerio agregue
 * una sección.
 */
export async function consultarDocumento(
  ordenId: string,
  compositionId: string,
  tenantId: string
): Promise<RespuestaIhce> {
  const r = await cliente().get(
    `/orden/${encodeURIComponent(ordenId)}/documento/${encodeURIComponent(compositionId)}?formato=html`,
    { headers: cabeceras(tenantId) }
  );
  return { status: r.status, data: r.data };
}

export default { consultarOrden, consultarDocumento, IhceNoConfigurado };

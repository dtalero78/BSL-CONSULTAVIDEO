// ============================================================================
// medicina-general.controller — historia de medicina general en la videoconsulta.
//
//   GET  /api/video/medicina-general/cie10?q=...          → typeahead CIE-10
//   GET  /api/video/medicina-general/:historiaId          → { orden, consulta }
//   PUT  /api/video/medicina-general/:historiaId          → guarda el borrador
//   POST /api/video/medicina-general/:historiaId/cerrar   → cierra (firma) la consulta
//
// El tenant sale del hostname, igual que GET /api/video/medical-history. Sin auth
// de ruta: coherente con el resto del panel de esta app.
//
// Nunca 502/503/504 (Cloudflare los reemplaza por su página): 400/404/409/500.
// ============================================================================

import { Request, Response } from 'express';
import medicinaGeneralService, { ErrorHttp, MedicinaGeneralService } from '../services/medicina-general.service';
import tenantService from '../services/tenant.service';

export type ResolverTenant = (req: Request) => Promise<string>;

const tenantPorHostname: ResolverTenant = async (req) => {
  const hostname = req.hostname || (req.headers.host || '').split(':')[0];
  const tenant = await tenantService.getByHostname(hostname);
  return tenant.id;
};

function responderError(res: Response, error: unknown, contexto: string): void {
  if (error instanceof ErrorHttp) {
    res.status(error.status).json({ error: error.message, ...(error.campo ? { campo: error.campo } : {}) });
    return;
  }
  console.error(`❌ [MedicinaGeneral] ${contexto}:`, (error as any)?.message ?? error);
  res.status(500).json({ error: 'Error interno al procesar la consulta de medicina general' });
}

export function crearControladorMedicinaGeneral(
  servicio: MedicinaGeneralService = medicinaGeneralService,
  resolverTenant: ResolverTenant = tenantPorHostname
) {
  return {
    buscarCie10: async (req: Request, res: Response): Promise<void> => {
      try {
        res.status(200).json(await servicio.buscarCie10(req.query.q));
      } catch (error) {
        responderError(res, error, 'buscarCie10');
      }
    },

    obtener: async (req: Request, res: Response): Promise<void> => {
      try {
        const tenantId = await resolverTenant(req);
        res.status(200).json(await servicio.obtener(req.params.historiaId, tenantId));
      } catch (error) {
        responderError(res, error, 'obtener');
      }
    },

    guardarBorrador: async (req: Request, res: Response): Promise<void> => {
      try {
        const tenantId = await resolverTenant(req);
        const consulta = await servicio.guardarBorrador(req.params.historiaId, tenantId, req.body);
        res.status(200).json({ consulta });
      } catch (error) {
        responderError(res, error, 'guardarBorrador');
      }
    },

    cerrar: async (req: Request, res: Response): Promise<void> => {
      try {
        const tenantId = await resolverTenant(req);
        const consulta = await servicio.cerrar(req.params.historiaId, tenantId, req.body, {
          endpoint: req.originalUrl,
          metodo: req.method,
          ip: String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null,
          userAgent: req.headers['user-agent'] || null,
        });
        console.log(`✅ [MedicinaGeneral] Consulta cerrada: ${tenantId}/${req.params.historiaId}`);
        res.status(200).json({ consulta });
      } catch (error) {
        responderError(res, error, 'cerrar');
      }
    },
  };
}

export default crearControladorMedicinaGeneral();

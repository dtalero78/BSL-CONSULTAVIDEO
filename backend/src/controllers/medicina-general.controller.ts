// ============================================================================
// medicina-general.controller — historia de medicina general en la videoconsulta.
//
//   GET  /api/video/medicina-general/cie10?q=...          → typeahead CIE-10 (abierto)
//   POST /api/video/medicina-general/sesion               → PIN del médico → token (12 h)
//   GET  /api/video/medicina-general/:historiaId          → { orden, consulta }
//   PUT  /api/video/medicina-general/:historiaId          → guarda el borrador
//   POST /api/video/medicina-general/:historiaId/cerrar   → cierra (firma) la consulta
//
// El tenant sale del hostname, igual que GET /api/video/medical-history. Las rutas de
// la consulta piden la sesión del médico (Authorization: Bearer <token>, ver
// `requerirSesion`) y solo dejan entrar al médico asignado a la orden.
//
// Nunca 502/503/504 (Cloudflare los reemplaza por su página).
// ============================================================================

import { NextFunction, Request, Response } from 'express';
import { extraerBearer } from '../services/medicina-general/sesion';
import medicinaGeneralService, { ErrorHttp, MedicinaGeneralService } from '../services/medicina-general.service';
import tenantService from '../services/tenant.service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Alias del médico de la sesión con PIN (lo pone requerirSesion). */
      medicoSesion?: string;
    }
  }
}

export type ResolverTenant = (req: Request) => Promise<string>;

/**
 * IP de quien llama (para el registro; el servicio descarta lo que no parezca una IP).
 * aws.medico-bsl.com va directo al balanceador de AWS (sin Cloudflare): la IP real es la ÚLTIMA de
 * x-forwarded-for, la que agrega el balanceador. Las anteriores las puede inventar el cliente.
 */
export function ipDe(req: Request): string | null {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((v) => v.trim()).filter(Boolean);
  return xff[xff.length - 1] || req.socket?.remoteAddress || null;
}

const tenantPorHostname: ResolverTenant = async (req) => {
  const hostname = req.hostname || (req.headers.host || '').split(':')[0];
  const tenant = await tenantService.getByHostname(hostname);
  return tenant.id;
};

function responderError(res: Response, error: unknown, contexto: string): void {
  if (error instanceof ErrorHttp) {
    res.status(error.status).json({
      error: error.message,
      ...(error.campo ? { campo: error.campo } : {}),
      ...(error.status === 429 ? { codigo: 'PIN_BLOQUEADO' } : {}),
    });
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
    /** POST /sesion { medico, pin } → { token, medico, expira_at }. */
    iniciarSesion: async (req: Request, res: Response): Promise<void> => {
      try {
        const tenantId = await resolverTenant(req);
        const { medico, pin } = (req.body ?? {}) as { medico?: unknown; pin?: unknown };
        const sesion = await servicio.iniciarSesion(tenantId, medico, pin, {
          ip: ipDe(req),
          userAgent: req.headers['user-agent'] || null,
        });
        console.log(`🔑 [MedicinaGeneral] Sesión abierta: ${tenantId}/${sesion.medico}`);
        res.status(200).json(sesion);
      } catch (error) {
        responderError(res, error, 'iniciarSesion');
      }
    },

    /** Middleware: exige una sesión vigente de esta IPS; si no, 401 SESION_REQUERIDA. */
    requerirSesion: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const token = extraerBearer(req.headers.authorization);
        const tenantId = await resolverTenant(req);
        const medico = token ? await servicio.medicoDeSesion(tenantId, token) : null;
        if (!medico) {
          res.status(401).json({ error: 'Ingresa con tu PIN para continuar', codigo: 'SESION_REQUERIDA' });
          return;
        }
        req.medicoSesion = medico;
        next();
      } catch (error) {
        responderError(res, error, 'requerirSesion');
      }
    },

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
        res.status(200).json(await servicio.obtener(req.params.historiaId, tenantId, req.medicoSesion ?? ''));
      } catch (error) {
        responderError(res, error, 'obtener');
      }
    },

    guardarBorrador: async (req: Request, res: Response): Promise<void> => {
      try {
        const tenantId = await resolverTenant(req);
        const consulta = await servicio.guardarBorrador(
          req.params.historiaId,
          tenantId,
          req.body,
          req.medicoSesion ?? ''
        );
        res.status(200).json({ consulta });
      } catch (error) {
        responderError(res, error, 'guardarBorrador');
      }
    },

    cerrar: async (req: Request, res: Response): Promise<void> => {
      try {
        const tenantId = await resolverTenant(req);
        const consulta = await servicio.cerrar(req.params.historiaId, tenantId, req.body, req.medicoSesion ?? '', {
          endpoint: req.originalUrl,
          metodo: req.method,
          // Solo para el registro, sin garantía (la cabecera la pone quien llama): el servicio
          // descarta lo que no parezca una IP para que nunca tumbe el cierre.
          ip: ipDe(req),
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

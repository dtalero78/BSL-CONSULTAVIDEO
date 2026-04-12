import { Router, Request, Response } from 'express';
import tenantService from '../services/tenant.service';

const router = Router();

/**
 * GET /api/tenant/config
 * Devuelve config de branding del tenant según el hostname del request.
 * Público (sin auth) — mismo patrón que PLATAFORMA2.
 */
router.get('/config', async (req: Request, res: Response) => {
  try {
    const hostname = req.hostname || (req.headers.host || '').split(':')[0];
    const tenant = await tenantService.getByHostname(hostname);
    res.json({
      success: true,
      tenant: {
        id: tenant.id,
        nombre: tenant.nombre,
        logo_url: tenant.logo_url,
        modulos_activos: tenant.modulos_activos,
      },
    });
  } catch (error) {
    console.error('[Tenant] Error obteniendo config:', error);
    res.json({ success: true, tenant: null });
  }
});

export default router;

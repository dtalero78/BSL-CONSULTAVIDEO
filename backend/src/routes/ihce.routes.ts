import { Router, Request, Response } from 'express';
import ihceService, { IhceNoConfigurado } from '../services/ihce.service';
import medicalPanelService from '../services/medical-panel.service';
import tenantService from '../services/tenant.service';

/**
 * /api/ihce — historia clínica nacional para el panel del médico.
 *
 * Es un proxy a PLATAFORMA2, que es quien habla con el Ministerio (ver ihce.service.ts).
 *
 * **El código del médico va en la ruta y se valida.** El resto del panel es abierto (el
 * médico "entra" con su código y las rutas no piden más), pero esto devuelve la historia
 * clínica de un paciente en toda la red nacional: dejarlo sin ninguna comprobación sería
 * un buscador abierto de historias clínicas. Se valida contra la tabla `medicos` del
 * tenant, igual que el login del panel.
 *
 * El tenant sale del hostname, y PLATAFORMA2 además exige que la orden sea de ese tenant.
 */

const router = Router();

async function tenantDe(req: Request): Promise<string> {
  const hostname = req.hostname || (req.headers.host || '').split(':')[0];
  const tenant = await tenantService.getByHostname(hostname);
  return tenant.id;
}

/** Devuelve el tenant si el código de médico es válido; si no, responde y devuelve null. */
async function exigirMedico(req: Request, res: Response): Promise<string | null> {
  const { medicoCode } = req.params;
  if (!medicoCode) {
    res.status(400).json({ success: false, error: 'Código de médico requerido' });
    return null;
  }
  const tenantId = await tenantDe(req);
  const existe = await medicalPanelService.medicoExists(medicoCode, tenantId);
  if (!existe) {
    res.status(403).json({ success: false, error: 'Código de médico no registrado' });
    return null;
  }
  return tenantId;
}

function responder(res: Response, r: { status: number; data: any }) {
  res.status(r.status).json(r.data);
}

function manejarError(res: Response, error: any, que: string) {
  if (error instanceof IhceNoConfigurado) {
    return res.status(501).json({ success: false, error: error.message });
  }
  console.error(`[IHCE] ${que}:`, error?.message || error);
  const esTimeout = error?.code === 'ECONNABORTED';
  return res.status(502).json({
    success: false,
    error: esTimeout
      ? 'El Ministerio no respondió a tiempo. Volvé a intentar.'
      : 'No se pudo consultar la historia nacional'
  });
}

/** GET /api/ihce/:medicoCode/orden/:ordenId — qué tiene el paciente en la red nacional */
router.get('/:medicoCode/orden/:ordenId', async (req: Request, res: Response) => {
  try {
    const tenantId = await exigirMedico(req, res);
    if (!tenantId) return;
    responder(res, await ihceService.consultarOrden(req.params.ordenId, tenantId));
  } catch (error: any) {
    manejarError(res, error, 'consultando la orden');
  }
});

/** GET /api/ihce/:medicoCode/orden/:ordenId/documento/:compositionId — un RDA, ya legible */
router.get('/:medicoCode/orden/:ordenId/documento/:compositionId', async (req: Request, res: Response) => {
  try {
    const tenantId = await exigirMedico(req, res);
    if (!tenantId) return;
    responder(res, await ihceService.consultarDocumento(
      req.params.ordenId, req.params.compositionId, tenantId
    ));
  } catch (error: any) {
    manejarError(res, error, 'descargando el documento');
  }
});

export default router;

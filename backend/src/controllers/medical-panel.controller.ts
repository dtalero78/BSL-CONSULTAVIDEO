import { Request, Response } from 'express';
import medicalPanelService from '../services/medical-panel.service';
import historiaClinicaPostgresService from '../services/historia-clinica-postgres.service';
import tenantService from '../services/tenant.service';

/** Resuelve el tenantId a partir del hostname del request */
async function getTenantId(req: Request): Promise<string> {
  const hostname = req.hostname || (req.headers.host || '').split(':')[0];
  const tenant = await tenantService.getByHostname(hostname);
  return tenant.id;
}

class MedicalPanelController {
  /**
   * Valida que el código de médico exista para el tenant actual
   */
  async validateMedico(req: Request, res: Response): Promise<void> {
    try {
      const { medicoCode } = req.params;

      if (!medicoCode) {
        res.status(400).json({ error: 'Código de médico requerido' });
        return;
      }

      const tenantId = await getTenantId(req);
      const exists = await medicalPanelService.medicoExists(medicoCode, tenantId);

      if (!exists) {
        res.status(404).json({ exists: false, error: 'Código de médico no registrado' });
        return;
      }

      res.json({ exists: true });
    } catch (error) {
      console.error('Error validando código de médico:', error);
      res.status(500).json({ error: 'Error validando código de médico' });
    }
  }

  /**
   * Obtiene estadísticas del día para un médico
   */
  async getDailyStats(req: Request, res: Response): Promise<void> {
    try {
      const { medicoCode } = req.params;

      if (!medicoCode) {
        res.status(400).json({ error: 'Código de médico requerido' });
        return;
      }

      const tenantId = await getTenantId(req);
      const stats = await medicalPanelService.getDailyStats(medicoCode, tenantId);
      res.json(stats);
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      res.status(500).json({ error: 'Error obteniendo estadísticas del día' });
    }
  }

  /**
   * Obtiene lista paginada de pacientes pendientes del día
   */
  async getPendingPatients(req: Request, res: Response): Promise<void> {
    try {
      const { medicoCode } = req.params;
      const page = parseInt(req.query.page as string) || 0;
      const pageSize = parseInt(req.query.pageSize as string) || 10;

      if (!medicoCode) {
        res.status(400).json({ error: 'Código de médico requerido' });
        return;
      }

      const tenantId = await getTenantId(req);
      const result = await medicalPanelService.getPendingPatients(medicoCode, page, pageSize, tenantId);
      res.json(result);
    } catch (error) {
      console.error('Error obteniendo pacientes pendientes:', error);
      res.status(500).json({ error: 'Error obteniendo lista de pacientes' });
    }
  }

  /**
   * Busca un paciente por documento de identidad
   */
  async searchPatientByDocument(req: Request, res: Response): Promise<void> {
    try {
      const { documento } = req.params;

      if (!documento) {
        res.status(400).json({ error: 'Documento de identidad o celular requerido' });
        return;
      }

      const tenantId = await getTenantId(req);
      const patient = await medicalPanelService.searchPatientByDocument(documento, tenantId);

      if (!patient) {
        res.status(404).json({ error: 'Paciente no encontrado' });
        return;
      }

      res.json(patient);
    } catch (error) {
      console.error('Error buscando paciente:', error);
      res.status(500).json({ error: 'Error buscando paciente' });
    }
  }

  /**
   * Marca un paciente como "No Contesta"
   */
  async markAsNoAnswer(req: Request, res: Response): Promise<void> {
    try {
      const { patientId } = req.params;

      if (!patientId) {
        res.status(400).json({ error: 'ID de paciente requerido' });
        return;
      }

      const tenantId = await getTenantId(req);
      const updated = await medicalPanelService.markPatientAsNoAnswer(patientId, tenantId);

      if (!updated) {
        res.status(404).json({ error: 'Paciente no encontrado' });
        return;
      }

      res.json({ success: true, message: 'Paciente marcado como "No Contesta"' });
    } catch (error) {
      console.error('Error marcando paciente:', error);
      res.status(500).json({ error: 'Error actualizando estado del paciente' });
    }
  }

  /**
   * Obtiene detalles completos de un paciente
   */
  async getPatientDetails(req: Request, res: Response): Promise<void> {
    try {
      const { documento } = req.params;

      if (!documento) {
        res.status(400).json({ error: 'Documento de identidad requerido' });
        return;
      }

      const tenantId = await getTenantId(req);
      const patientDetails = await medicalPanelService.getPatientDetails(documento, tenantId);

      if (!patientDetails) {
        res.status(404).json({ error: 'Paciente no encontrado' });
        return;
      }

      res.json(patientDetails);
    } catch (error) {
      console.error('Error obteniendo detalles del paciente:', error);
      res.status(500).json({ error: 'Error obteniendo detalles del paciente' });
    }
  }
  /**
   * Actualiza el campo aprobacion de una historia clínica (llamado desde link de WhatsApp)
   */
  async updateAprobacion(req: Request, res: Response): Promise<void> {
    try {
      const { historiaId, decision } = req.params;

      if (!historiaId || !decision) {
        res.status(400).send(this.buildResponseHtml('Error', 'Parámetros inválidos.', false));
        return;
      }

      const decisionUpper = decision.toUpperCase();
      if (decisionUpper !== 'APROBADO' && decisionUpper !== 'NO APROBADO') {
        res.status(400).send(this.buildResponseHtml('Error', 'Decisión no válida.', false));
        return;
      }

      const updated = await historiaClinicaPostgresService.updateAprobacion(historiaId, decisionUpper);

      if (!updated) {
        res.status(404).send(this.buildResponseHtml('No encontrado', 'No se encontró la historia clínica.', false));
        return;
      }

      const isAprobado = decisionUpper === 'APROBADO';
      res.send(this.buildResponseHtml(
        isAprobado ? 'Aprobado' : 'No Aprobado',
        `El paciente ha sido marcado como <strong>${decisionUpper}</strong> exitosamente.`,
        isAprobado
      ));
    } catch (error) {
      console.error('Error actualizando aprobación:', error);
      res.status(500).send(this.buildResponseHtml('Error', 'Error al actualizar la aprobación.', false));
    }
  }

  private buildResponseHtml(title: string, message: string, isSuccess: boolean): string {
    const color = isSuccess ? '#00a884' : '#e74c3c';
    const emoji = isSuccess ? '✅' : '❌';
    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title} - Panel Médico BSL</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #111b21; color: white; }
  .card { background: #1f2c34; border-radius: 16px; padding: 48px; text-align: center; max-width: 400px; box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
  .emoji { font-size: 64px; margin-bottom: 16px; }
  h1 { color: ${color}; margin: 0 0 12px; font-size: 24px; }
  p { color: #adb5bd; font-size: 16px; line-height: 1.5; }
  strong { color: ${color}; }
</style></head>
<body><div class="card"><div class="emoji">${emoji}</div><h1>${title}</h1><p>${message}</p></div></body></html>`;
  }
}

export default new MedicalPanelController();

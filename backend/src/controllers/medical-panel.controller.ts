import { Request, Response } from 'express';
import medicalPanelService from '../services/medical-panel.service';

class MedicalPanelController {
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

      const stats = await medicalPanelService.getDailyStats(medicoCode);
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

      const result = await medicalPanelService.getPendingPatients(medicoCode, page, pageSize);
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

      const patient = await medicalPanelService.searchPatientByDocument(documento);

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

      const updated = await medicalPanelService.markPatientAsNoAnswer(patientId);

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

      const patientDetails = await medicalPanelService.getPatientDetails(documento);

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
}

export default new MedicalPanelController();

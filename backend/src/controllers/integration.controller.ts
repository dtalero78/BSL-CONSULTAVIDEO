import { Request, Response } from 'express';
import integrationConsultasService from '../services/integration-consultas.service';
import { validarConsultaIntegracion } from '../helpers/integracion-maluwa.helper';

class IntegrationController {
  /**
   * Crear una consulta médica virtual desde una integración externa (Maluwa360).
   * POST /api/integration/consultas   (header X-Integration-Key)
   *
   * 201 { roomName, historiaId, patientUrl, doctorUrl }  → creada
   * 200 { ...mismo payload }                             → externalId ya existía (idempotente)
   * 400 { success:false, code:'VALIDATION_ERROR', error, details[] }
   * 422 { success:false, code:'MEDICO_NO_REGISTRADO', error }
   * 500 / 503                                            → reintentar con el mismo externalId
   */
  async crearConsulta(req: Request, res: Response): Promise<void> {
    try {
      const validacion = validarConsultaIntegracion(req.body);
      if (!validacion.ok) {
        res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          error: validacion.errores[0],
          details: validacion.errores,
        });
        return;
      }

      const resultado = await integrationConsultasService.crearConsulta(validacion.value);
      if (resultado.ok) {
        res.status(resultado.status).json(resultado.consulta);
        return;
      }
      res.status(resultado.status).json({ success: false, code: resultado.code, error: resultado.error });
    } catch (error) {
      console.error('❌ [integration] Error inesperado creando consulta:', error);
      res.status(500).json({
        success: false,
        code: 'INTERNAL_ERROR',
        error: 'Error interno creando la consulta. Reintente con el mismo externalId.',
      });
    }
  }
}

export default new IntegrationController();

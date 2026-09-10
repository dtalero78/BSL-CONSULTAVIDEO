// ============================================================================
// integration-key.middleware — Autenticación servicio-a-servicio para las
// integraciones B2B (hoy: Maluwa360).
//
// Header:  X-Integration-Key: <clave>
// Env:     MALUWA360_API_KEY
//
// Mismo espíritu que `requireInternalToken` (X-Internal-Token), pero:
//   - Comparación en tiempo constante (timingSafeEqual sobre digests SHA-256,
//     así tampoco se filtra la longitud de la clave).
//   - Falla CERRADO: si la variable no está configurada (o es demasiado corta
//     para ser una clave real) se rechaza SIEMPRE con 503. Un deploy mal
//     configurado nunca deja el endpoint abierto.
// ============================================================================

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { createHash, timingSafeEqual } from 'crypto';

export const INTEGRATION_KEY_HEADER = 'X-Integration-Key';

/** Longitud mínima aceptada para la clave configurada (openssl rand -hex 32 → 64). */
export const MIN_INTEGRATION_KEY_LENGTH = 32;

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function constantTimeEquals(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

/**
 * Factory: middleware que valida `X-Integration-Key` contra `process.env[envVarName]`.
 * La variable se lee en cada request (rotar la clave no requiere redeploy de código).
 */
export function createIntegrationKeyMiddleware(envVarName: string, integrationName: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const expected = (process.env[envVarName] || '').trim();

    if (expected.length < MIN_INTEGRATION_KEY_LENGTH) {
      console.error(
        `❌ [Auth] ${envVarName} no configurada (o con menos de ${MIN_INTEGRATION_KEY_LENGTH} caracteres): ` +
          `se rechaza el acceso a la integración ${integrationName}`
      );
      res.status(503).json({
        success: false,
        code: 'INTEGRATION_NOT_CONFIGURED',
        error: `La integración ${integrationName} no está habilitada en este ambiente.`,
      });
      return;
    }

    const provided = req.header(INTEGRATION_KEY_HEADER);
    if (!provided) {
      res.status(401).json({
        success: false,
        code: 'MISSING_INTEGRATION_KEY',
        error: `El header ${INTEGRATION_KEY_HEADER} es obligatorio.`,
      });
      return;
    }

    if (!constantTimeEquals(provided, expected)) {
      console.warn(`[Auth] ${INTEGRATION_KEY_HEADER} inválida para ${req.method} ${req.originalUrl}`);
      res.status(401).json({
        success: false,
        code: 'INVALID_INTEGRATION_KEY',
        error: `${INTEGRATION_KEY_HEADER} inválida.`,
      });
      return;
    }

    (req as any).integration = integrationName;
    next();
  };
}

/** Middleware de la integración Maluwa360 (`MALUWA360_API_KEY`). */
export const requireIntegrationKey = createIntegrationKeyMiddleware('MALUWA360_API_KEY', 'MALUWA360');

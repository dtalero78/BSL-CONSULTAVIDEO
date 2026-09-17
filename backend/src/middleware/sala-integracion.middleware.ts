import { Request, Response, NextFunction } from 'express';
import postgresService from '../services/postgres.service';

/**
 * Manda al médico a la sala de verdad cuando la consulta la creó una integración.
 *
 * El panel guarda el `roomName` en el estado de React cuando alguien toca
 * "Contactar", y "Atender" lo reutiliza; si esa pestaña no lo tiene, genera uno
 * nuevo. Funciona mientras la misma pestaña haga los dos pasos —el caso de
 * SIIGO y el de "crear sala"—, pero en una consulta creada por una integración
 * la sala nace en el servidor y ese navegador nunca la vio: el médico terminaba
 * en una habitación distinta a la del paciente y ninguno veía al otro.
 *
 * La URL que arma "Atender" sí trae `documento=<historiaId>`, y esa historia es
 * clave única en `integration_consultas`. Con eso se resuelve la sala correcta.
 *
 * Va deliberadamente sin dependencias: una sola consulta por índice único, para
 * poder llevarlo tal cual a la rama que se despliega en AWS, que es donde entra
 * el médico y que no tiene el resto del código de integración.
 *
 * Falla abierto a propósito: si la historia no vino de una integración, o si la
 * base no responde, sigue de largo y el comportamiento es el de siempre. Para
 * los demás flujos esto no cambia absolutamente nada.
 */
export async function redirigirASalaDeIntegracion(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const historiaId = String(req.query.documento ?? '').trim();
    if (!historiaId) return next();

    const filas = await postgresService.query(
      `SELECT room_name FROM integration_consultas WHERE historia_id = $1 LIMIT 1`,
      [historiaId]
    );
    // null = la base falló · sin filas = la historia no vino de una integración.
    if (!filas || filas.length === 0) return next();

    const salaReal = String(filas[0].room_name);
    if (!salaReal || salaReal === req.params.roomName) return next();

    const params = new URLSearchParams();
    for (const [clave, valor] of Object.entries(req.query)) {
      if (typeof valor === 'string') params.set(clave, valor);
    }

    console.log(
      `↪️  [integration] "Atender" pedía ${req.params.roomName} para la historia ${historiaId}; ` +
        `la sala de esa consulta es ${salaReal}. Redirigiendo.`
    );
    res.redirect(302, `/doctor/${salaReal}?${params.toString()}`);
  } catch (error) {
    console.error('Error resolviendo la sala de integración:', error);
    next();
  }
}

# Registrar TODAS las llamadas (para BODYTECH)

Guía para el agente que migra BODYTECH. Complementa
[TRANSCRIPCION-CALIDAD.md](TRANSCRIPCION-CALIDAD.md) y el
[MIGRATION-PLAYBOOK.md](MIGRATION-PLAYBOOK.md).

## El problema

BODYTECH solo guarda las llamadas **grabadas** (tabla `chime_recordings`). Las que no se
graban —de un solo participante, o tipos de examen que no se graban— **no quedan en ninguna
tabla**, así que no se pueden contar ni reportar. BSL sí las guarda, en `video_sessions`.

Se nota al contar: en BSL el conteo de un día da **todas** las llamadas; en BODYTECH solo salen
las grabadas (p. ej. el 24-jul: BSL 128 llamadas / 122 grabadas; BODYTECH solo 66 grabadas y el
total real es desconocido).

## Objetivo

Persistir **una fila por consulta, se grabe o no.**

## Cómo lo hace BSL (patrón a copiar)

En `session-tracker`, cuando el **médico** se conecta con el id de la orden
(`trackParticipantConnected` con `role='doctor'` + `historiaId`) se ejecuta un `INSERT`
**incondicional**, independiente de la decisión de grabar:

```sql
INSERT INTO video_sessions
  (room_name, room_sid, historia_id, patient_documento, patient_name,
   doctor_name, cod_empresa, recording_enabled)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
```

- `room_sid` = el `MeetingId` de Chime (en Twilio era el SID).
- `recording_enabled` = **solo un flag**; NO condiciona el insert.
- La tabla tiene además `created_at TIMESTAMPTZ DEFAULT NOW()`.

Punto exacto en BSL: `backend/src/services/session-tracker.service.ts` →
`trackParticipantConnected` (rama `role === 'doctor' && historiaId`) → `setupRecordingIfNeeded`,
que primero decide si graba y **luego inserta la fila para toda consulta**.

## Qué debe hacer BODYTECH

1. **Crear una tabla de sesiones** (puede llamarla igual, `video_sessions`) con:
   `room_name`, `meeting_id`, `orden_id` (el id de su consulta), `paciente_documento`,
   `paciente_nombre`, `medico`, **`sede`** (en BODYTECH es sede, no `cod_empresa`),
   `recording_enabled`, `created_at TIMESTAMPTZ DEFAULT NOW()`.
2. **Insertar la fila en su `session-tracker`**, en el mismo punto: cuando el médico entra con el
   id de la orden. **Clave: hacerlo SIEMPRE, no solo cuando arranca la grabación** — ese es
   justo el dato que hoy se pierde.
3. **Revisar cómo Calidad enlaza hoy orden → grabación** (BODYTECH ya tiene
   `consulta_evaluaciones`). La nueva tabla debe llevar el vínculo `orden_id ↔ room_name` para no
   romper lo que ya funciona.

## Opcional pero recomendado (reportes de costo por minuto)

Agregar `ended_at` y actualizarlo cuando termina la llamada (`endRoom` / desconexión del médico).
Con `created_at` + `ended_at` se obtiene **duración por consulta** → minutos exactos por sede.
Hoy el costo por empresa se estima a ojo (por conteo de grabaciones); con esto sería exacto.

## Cómo verificar

Que este conteo devuelva **todas** las llamadas del día, no solo las grabadas:

```sql
SELECT COUNT(DISTINCT room_name) FROM video_sessions
WHERE (created_at AT TIME ZONE 'America/Bogota')::date = CURRENT_DATE;
```

Prueba con dos personas: una consulta **sin grabación** (tipo de examen que no graba, o cuelga
antes del 2º participante) debe aparecer igual en `video_sessions`.

-- ════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Crear tabla integration_consultas
-- ════════════════════════════════════════════════════════════════════════════
-- Consultas creadas por integraciones externas (hoy: Maluwa360) vía
-- POST /api/integration/consultas. Sirve para:
--   1. Idempotencia: (source, external_id) único → repetir el externalId
--      devuelve la misma consulta sin crear nada nuevo.
--   2. Vínculo historia clínica ↔ consulta externa (historia_id único).
--   3. Evidencia del consentimiento y del acudiente (pacientes menores).
--   4. Outbox del webhook de resultado hacia la integración (columnas webhook_*),
--      con reintentos y backoff (integration-webhook.service.ts).
--
-- Idempotente: se puede ejecutar más de una vez sin error.

CREATE TABLE IF NOT EXISTS integration_consultas (
    id SERIAL PRIMARY KEY,
    source VARCHAR(50) NOT NULL,                  -- 'MALUWA360'
    external_id VARCHAR(255) NOT NULL,            -- id de la consulta en la plataforma externa
    historia_id VARCHAR(255) NOT NULL,            -- "HistoriaClinica"."_id"
    room_name VARCHAR(128) NOT NULL,
    tenant_id VARCHAR(50) NOT NULL DEFAULT 'bsl',
    patient_url TEXT NOT NULL,
    doctor_url TEXT NOT NULL,
    tipo VARCHAR(50),                             -- VALORACION_GENERAL | OCUPACIONAL_PERIODICO
    medico VARCHAR(100),
    institucion JSONB,                            -- { nombre, dane }
    acudiente JSONB,                              -- { nombre, documento, celular, parentesco }
    consentimiento JSONB NOT NULL,                -- { version, otorgadoEn, medio }

    -- Outbox del webhook de resultado
    webhook_status VARCHAR(20) NOT NULL DEFAULT 'none',   -- none | pending | sent | dead
    webhook_payload JSONB,
    webhook_seq INTEGER NOT NULL DEFAULT 0,               -- versión del payload encolado
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    last_status_code INTEGER,
    webhook_sent_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_integration_consultas_source_external UNIQUE (source, external_id),
    CONSTRAINT uq_integration_consultas_historia UNIQUE (historia_id),
    CONSTRAINT ck_integration_consultas_webhook_status
        CHECK (webhook_status IN ('none', 'pending', 'sent', 'dead'))
);

-- Worker del outbox: filas pendientes ordenadas por próximo intento.
CREATE INDEX IF NOT EXISTS idx_integration_consultas_outbox
    ON integration_consultas (next_attempt_at)
    WHERE webhook_status = 'pending';

COMMENT ON TABLE integration_consultas IS 'Consultas creadas por integraciones externas (Maluwa360): idempotencia, consentimiento y outbox del webhook de resultado';
COMMENT ON COLUMN integration_consultas.external_id IS 'Id de la consulta en la plataforma externa (clave de idempotencia junto con source)';
COMMENT ON COLUMN integration_consultas.webhook_seq IS 'Se incrementa en cada encolado; evita que un envío viejo en vuelo pise un pending más reciente';

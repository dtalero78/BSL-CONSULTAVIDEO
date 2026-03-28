-- ════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Crear tabla video_sessions
-- ════════════════════════════════════════════════════════════════════════════
-- Almacena la relación entre salas de Twilio, pacientes y composiciones
-- para facilitar la búsqueda de grabaciones por cédula o historia clínica.

CREATE TABLE IF NOT EXISTS video_sessions (
    id SERIAL PRIMARY KEY,
    room_name VARCHAR(100) NOT NULL,
    room_sid VARCHAR(50),
    historia_id VARCHAR(255),
    patient_documento VARCHAR(50),
    patient_name VARCHAR(200),
    doctor_name VARCHAR(200),
    cod_empresa VARCHAR(50),
    composition_sid VARCHAR(50),
    recording_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_sessions_patient_documento ON video_sessions(patient_documento);
CREATE INDEX IF NOT EXISTS idx_video_sessions_room_name ON video_sessions(room_name);
CREATE INDEX IF NOT EXISTS idx_video_sessions_historia_id ON video_sessions(historia_id);

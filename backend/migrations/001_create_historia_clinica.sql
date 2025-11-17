-- ════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Crear tabla HistoriaClinica en PostgreSQL
-- ════════════════════════════════════════════════════════════════════════════
--
-- Esta tabla replica la estructura de HistoriaClinica de Wix
-- Permite guardar datos de forma redundante en PostgreSQL para:
-- 1. Backup y recuperación
-- 2. Consultas más rápidas
-- 3. Reportes y análisis
--

-- Eliminar tabla si existe (CUIDADO: solo para desarrollo)
DROP TABLE IF EXISTS "HistoriaClinica" CASCADE;

-- Crear tabla HistoriaClinica
CREATE TABLE "HistoriaClinica" (
    -- ════════════════════════════════════════════════════════════════
    -- CAMPOS DE SISTEMA
    -- ════════════════════════════════════════════════════════════════
    "_id" VARCHAR(255) PRIMARY KEY,              -- ID de Wix (UUID)
    "_createdDate" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "_updatedDate" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- ════════════════════════════════════════════════════════════════
    -- DATOS DE IDENTIFICACIÓN DEL PACIENTE
    -- ════════════════════════════════════════════════════════════════
    "numeroId" VARCHAR(50) NOT NULL,             -- Documento de identidad
    "primerNombre" VARCHAR(100) NOT NULL,
    "segundoNombre" VARCHAR(100),
    "primerApellido" VARCHAR(100) NOT NULL,
    "segundoApellido" VARCHAR(100),
    "celular" VARCHAR(20) NOT NULL,

    -- ════════════════════════════════════════════════════════════════
    -- DATOS DEMOGRÁFICOS (vienen de tabla FORMULARIO en Wix)
    -- ════════════════════════════════════════════════════════════════
    "email" VARCHAR(255),
    "fechaNacimiento" DATE,
    "edad" INTEGER,
    "genero" VARCHAR(10),                        -- M/F
    "estadoCivil" VARCHAR(50),
    "hijos" VARCHAR(100),
    "ejercicio" VARCHAR(100),

    -- ════════════════════════════════════════════════════════════════
    -- DATOS DE EMPRESA/OCUPACIÓN
    -- ════════════════════════════════════════════════════════════════
    "codEmpresa" VARCHAR(100),                   -- Código de empresa
    "empresa" VARCHAR(255),                      -- Nombre de empresa
    "cargo" VARCHAR(255),                        -- Cargo del paciente
    "tipoExamen" VARCHAR(255),                   -- Tipo de examen

    -- ════════════════════════════════════════════════════════════════
    -- ANTECEDENTES Y ENCUESTAS (vienen de tabla FORMULARIO en Wix)
    -- ════════════════════════════════════════════════════════════════
    "encuestaSalud" TEXT,
    "antecedentesFamiliares" TEXT,
    "empresa1" VARCHAR(255),                     -- Empresa anterior

    -- ════════════════════════════════════════════════════════════════
    -- CAMPOS MÉDICOS EDITABLES (completados durante videollamada)
    -- ════════════════════════════════════════════════════════════════
    "mdAntecedentes" TEXT,                       -- Antecedentes médicos
    "mdObsParaMiDocYa" TEXT,                     -- Observaciones privadas
    "mdObservacionesCertificado" TEXT,           -- Observaciones certificado
    "mdRecomendacionesMedicasAdicionales" TEXT,  -- Recomendaciones médicas
    "mdConceptoFinal" TEXT,                      -- Concepto final
    "mdDx1" VARCHAR(50),                         -- Diagnóstico principal
    "mdDx2" VARCHAR(50),                         -- Diagnóstico secundario
    "talla" VARCHAR(10),                         -- Altura en cm
    "peso" VARCHAR(10),                          -- Peso en kg
    "motivoConsulta" TEXT,                       -- Motivo de consulta
    "diagnostico" TEXT,                          -- Diagnóstico general
    "tratamiento" TEXT,                          -- Tratamiento recomendado

    -- ════════════════════════════════════════════════════════════════
    -- FECHAS Y ESTADO
    -- ════════════════════════════════════════════════════════════════
    "fechaAtencion" TIMESTAMP WITH TIME ZONE,    -- Fecha programada
    "fechaConsulta" TIMESTAMP WITH TIME ZONE,    -- Fecha completada (copia de _updatedDate)
    "atendido" VARCHAR(20),                      -- Estado: "" o "ATENDIDO"
    "pvEstado" VARCHAR(50),                      -- Estado especial: "No Contesta", etc.
    "medico" VARCHAR(100)                        -- Código del médico asignado
);

-- ════════════════════════════════════════════════════════════════════════════
-- ÍNDICES PARA MEJORAR RENDIMIENTO
-- ════════════════════════════════════════════════════════════════════════════

-- Índice por documento (búsqueda frecuente)
CREATE INDEX "idx_historia_numeroId" ON "HistoriaClinica" ("numeroId");

-- Índice por celular (búsqueda frecuente)
CREATE INDEX "idx_historia_celular" ON "HistoriaClinica" ("celular");

-- Índice por médico (filtro frecuente)
CREATE INDEX "idx_historia_medico" ON "HistoriaClinica" ("medico");

-- Índice por fecha de atención (búsqueda de citas programadas)
CREATE INDEX "idx_historia_fechaAtencion" ON "HistoriaClinica" ("fechaAtencion");

-- Índice por fecha de consulta (búsqueda de consultas completadas)
CREATE INDEX "idx_historia_fechaConsulta" ON "HistoriaClinica" ("fechaConsulta");

-- Índice por estado atendido (filtro frecuente)
CREATE INDEX "idx_historia_atendido" ON "HistoriaClinica" ("atendido");

-- Índice compuesto para consultas de estadísticas del día
CREATE INDEX "idx_historia_medico_fechaAtencion" ON "HistoriaClinica" ("medico", "fechaAtencion");

-- Índice compuesto para pacientes pendientes
CREATE INDEX "idx_historia_medico_atendido" ON "HistoriaClinica" ("medico", "atendido", "fechaAtencion");

-- ════════════════════════════════════════════════════════════════════════════
-- TRIGGER PARA ACTUALIZAR _updatedDate AUTOMÁTICAMENTE
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_date()
RETURNS TRIGGER AS $$
BEGIN
    NEW."_updatedDate" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_historia_clinica_updated_date
    BEFORE UPDATE ON "HistoriaClinica"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_date();

-- ════════════════════════════════════════════════════════════════════════════
-- COMENTARIOS EN LA TABLA
-- ════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE "HistoriaClinica" IS 'Tabla que replica HistoriaClinica de Wix para backup y consultas rápidas';
COMMENT ON COLUMN "HistoriaClinica"."_id" IS 'ID único de Wix (UUID)';
COMMENT ON COLUMN "HistoriaClinica"."numeroId" IS 'Documento de identidad del paciente';
COMMENT ON COLUMN "HistoriaClinica"."fechaConsulta" IS 'Fecha cuando se completó la videollamada (copia de _updatedDate)';
COMMENT ON COLUMN "HistoriaClinica"."atendido" IS 'Estado de atención: vacío o ATENDIDO';
COMMENT ON COLUMN "HistoriaClinica"."medico" IS 'Código del médico asignado (ej: SIXTA, RESERVA)';

# Migración de Wix a PostgreSQL como Base de Datos Principal

## Resumen

Esta guía documenta el proceso de migración del panel médico para usar **PostgreSQL como base de datos principal** en lugar de Wix. Wix queda como backup secundario.

## Arquitectura Anterior

```
┌─────────────────┐
│  Panel Médico   │
│  (React/Node)   │
└────────┬────────┘
         │ HTTP (axios)
         ▼
┌─────────────────┐
│  Wix Functions  │
│  /_functions/*  │
└────────┬────────┘
         │ wixData.query()
         ▼
┌─────────────────┐
│   Wix Database  │
│ HistoriaClinica │
└─────────────────┘
```

**Problemas:**
- Doble latencia (Backend → Wix → Wix DB)
- Dependencia de disponibilidad de Wix
- Límites de rate en endpoints de Wix

## Arquitectura Nueva

```
┌─────────────────┐
│  Panel Médico   │
│  (React/Node)   │
└────────┬────────┘
         │ Query directo (pg)
         ▼
┌─────────────────┐
│   PostgreSQL    │  ← PRINCIPAL
│ (Digital Ocean) │
└─────────────────┘
         │
         │ Backup async
         ▼
┌─────────────────┐
│   Wix Database  │  ← BACKUP
└─────────────────┘
```

## Paso 1: Configurar PostgreSQL

### 1.1 Crear tabla HistoriaClinica

```sql
CREATE TABLE "HistoriaClinica" (
    "_id" VARCHAR(255) PRIMARY KEY,
    "_createdDate" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "_updatedDate" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Datos del paciente
    "numeroId" VARCHAR(50) NOT NULL,
    "primerNombre" VARCHAR(100) NOT NULL,
    "segundoNombre" VARCHAR(100),
    "primerApellido" VARCHAR(100) NOT NULL,
    "segundoApellido" VARCHAR(100),
    "celular" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255),

    -- Datos de empresa
    "codEmpresa" VARCHAR(100),
    "empresa" VARCHAR(255),
    "cargo" VARCHAR(255),
    "tipoExamen" VARCHAR(255),

    -- Campos médicos
    "mdAntecedentes" TEXT,
    "mdObsParaMiDocYa" TEXT,
    "mdObservacionesCertificado" TEXT,
    "mdRecomendacionesMedicasAdicionales" TEXT,
    "mdConceptoFinal" TEXT,
    "mdDx1" TEXT,
    "mdDx2" TEXT,
    "talla" VARCHAR(10),
    "peso" VARCHAR(10),
    "motivoConsulta" TEXT,
    "diagnostico" TEXT,
    "tratamiento" TEXT,

    -- Fechas y estado
    "fechaAtencion" TIMESTAMP WITH TIME ZONE,
    "fechaConsulta" TIMESTAMP WITH TIME ZONE,
    "atendido" VARCHAR(20),
    "pvEstado" VARCHAR(50),
    "medico" VARCHAR(100),
    "ciudad" VARCHAR(100)
);

-- Índices para rendimiento
CREATE INDEX "idx_historia_numeroId" ON "HistoriaClinica" ("numeroId");
CREATE INDEX "idx_historia_medico" ON "HistoriaClinica" ("medico");
CREATE INDEX "idx_historia_fechaAtencion" ON "HistoriaClinica" ("fechaAtencion");
CREATE INDEX "idx_historia_fechaConsulta" ON "HistoriaClinica" ("fechaConsulta");
CREATE INDEX "idx_historia_medico_fechaAtencion" ON "HistoriaClinica" ("medico", "fechaAtencion");
```

### 1.2 Crear servicio de conexión PostgreSQL

**Archivo:** `backend/src/services/postgres.service.ts`

```typescript
import { Pool, PoolClient } from 'pg';

class PostgresService {
  private pool: Pool | null = null;

  constructor() {
    this.initializePool();
  }

  private initializePool(): void {
    this.pool = new Pool({
      user: process.env.POSTGRES_USER || 'doadmin',
      password: process.env.POSTGRES_PASSWORD,
      host: process.env.POSTGRES_HOST,
      port: parseInt(process.env.POSTGRES_PORT || '25060'),
      database: process.env.POSTGRES_DATABASE || 'defaultdb',
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  async query(text: string, params?: any[]): Promise<any[] | null> {
    const client = await this.pool?.connect();
    if (!client) return null;

    try {
      const result = await client.query(text, params);
      return result.rows;
    } finally {
      client.release();
    }
  }
}

export default new PostgresService();
```

## Paso 2: Migrar el Servicio del Panel Médico

### 2.1 Antes (llamando a Wix)

```typescript
import axios from 'axios';

class MedicalPanelService {
  private wixClient = axios.create({
    baseURL: 'https://www.tudominio.com/_functions',
  });

  async getPendingPatients(medicoCode: string, page: number = 0) {
    const response = await this.wixClient.get('/pacientesPendientes', {
      params: { medicoCode, page }
    });
    return response.data;
  }
}
```

### 2.2 Después (consultando PostgreSQL)

```typescript
import postgresService from './postgres.service';

class MedicalPanelService {
  async getPendingPatients(medicoCode: string, page: number = 0, pageSize: number = 10) {
    // Calcular inicio y fin del día en Colombia (UTC-5)
    const now = new Date();
    const colombiaTime = new Date(now.getTime() - (5 * 60 * 60 * 1000));
    const year = colombiaTime.getUTCFullYear();
    const month = colombiaTime.getUTCMonth();
    const day = colombiaTime.getUTCDate();

    const startOfDay = new Date(Date.UTC(year, month, day, 5, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(year, month, day + 1, 4, 59, 59, 999));

    const offset = page * pageSize;

    const result = await postgresService.query(
      `SELECT "_id", "numeroId", "primerNombre", "primerApellido", "celular",
              "fechaAtencion", "atendido", "pvEstado", "codEmpresa", "medico"
       FROM "HistoriaClinica"
       WHERE "medico" = $1
       AND "fechaAtencion" >= $2
       AND "fechaAtencion" <= $3
       AND "fechaConsulta" IS NULL
       ORDER BY "fechaAtencion" ASC
       LIMIT $4 OFFSET $5`,
      [medicoCode, startOfDay, endOfDay, pageSize, offset]
    );

    return result?.map(row => ({
      _id: row._id,
      nombres: `${row.primerNombre} ${row.primerApellido}`,
      numeroId: row.numeroId,
      celular: row.celular,
      fechaAtencion: row.fechaAtencion,
      estado: row.atendido || 'Pendiente',
      empresaListado: row.codEmpresa || 'SIN EMPRESA'
    })) || [];
  }
}
```

## Paso 3: Queries Principales

### Estadísticas del día

```typescript
async getDailyStats(medicoCode: string) {
  const [programados, atendidos, restantes] = await Promise.all([
    postgresService.query(
      `SELECT COUNT(*) FROM "HistoriaClinica"
       WHERE "medico" = $1 AND "fechaAtencion" BETWEEN $2 AND $3`,
      [medicoCode, startOfDay, endOfDay]
    ),
    postgresService.query(
      `SELECT COUNT(*) FROM "HistoriaClinica"
       WHERE "medico" = $1 AND "fechaConsulta" BETWEEN $2 AND $3`,
      [medicoCode, startOfDay, endOfDay]
    ),
    postgresService.query(
      `SELECT COUNT(*) FROM "HistoriaClinica"
       WHERE "medico" = $1 AND "fechaAtencion" BETWEEN $2 AND $3
       AND "fechaConsulta" IS NULL`,
      [medicoCode, startOfDay, endOfDay]
    )
  ]);

  return {
    programadosHoy: parseInt(programados?.[0]?.count || '0'),
    atendidosHoy: parseInt(atendidos?.[0]?.count || '0'),
    restantesHoy: parseInt(restantes?.[0]?.count || '0')
  };
}
```

### Buscar paciente por documento

```typescript
async searchPatientByDocument(searchTerm: string) {
  const result = await postgresService.query(
    `SELECT * FROM "HistoriaClinica"
     WHERE "numeroId" = $1 OR "celular" = $1
     ORDER BY "fechaAtencion" DESC
     LIMIT 1`,
    [searchTerm]
  );

  return result?.[0] || null;
}
```

### Marcar como "No Contesta"

```typescript
async markPatientAsNoAnswer(patientId: string) {
  const result = await postgresService.query(
    `UPDATE "HistoriaClinica"
     SET "pvEstado" = 'No Contesta', "medico" = 'RESERVA'
     WHERE "_id" = $1
     RETURNING "_id"`,
    [patientId]
  );

  return result !== null && result.length > 0;
}
```

## Paso 4: Variables de Entorno

Agregar al `.env` del backend:

```bash
# PostgreSQL (Digital Ocean)
POSTGRES_HOST=tu-cluster.db.ondigitalocean.com
POSTGRES_PORT=25060
POSTGRES_USER=doadmin
POSTGRES_PASSWORD=tu_password_seguro
POSTGRES_DATABASE=defaultdb
```

## Paso 5: Manejo de Zona Horaria

Colombia está en UTC-5. Para queries por día:

```typescript
// Convertir hora actual a Colombia
const now = new Date();
const colombiaTime = new Date(now.getTime() - (5 * 60 * 60 * 1000));

// Obtener inicio del día en UTC
const year = colombiaTime.getUTCFullYear();
const month = colombiaTime.getUTCMonth();
const day = colombiaTime.getUTCDate();

// 00:00 Colombia = 05:00 UTC
const startOfDay = new Date(Date.UTC(year, month, day, 5, 0, 0, 0));

// 23:59:59 Colombia = 04:59:59 UTC del día siguiente
const endOfDay = new Date(Date.UTC(year, month, day + 1, 4, 59, 59, 999));
```

## Paso 6: Sincronización de Datos

Si ya tienes datos en Wix, necesitas sincronizarlos a PostgreSQL:

1. Exportar datos de Wix (CSV o API)
2. Importar a PostgreSQL con mismo `_id`
3. Verificar conteo de registros

```sql
-- Verificar registros
SELECT COUNT(*) FROM "HistoriaClinica";
SELECT medico, COUNT(*) FROM "HistoriaClinica" GROUP BY medico;
```

## Beneficios de la Migración

| Aspecto | Antes (Wix) | Después (PostgreSQL) |
|---------|-------------|----------------------|
| Latencia | ~500-1000ms | ~50-100ms |
| Control | Limitado | Total |
| Queries | API REST | SQL directo |
| Escalabilidad | Limitada | Alta |
| Costo | Incluido en Wix | $15/mes (DO) |

## Consideraciones

1. **Backup**: Mantener Wix sincronizado como backup
2. **Monitoreo**: Configurar alertas de conexión PostgreSQL
3. **Índices**: Crear índices para queries frecuentes
4. **Pool**: Configurar pool de conexiones apropiadamente

## Rollback

Si necesitas volver a Wix, solo cambia el import:

```typescript
// Revertir a Wix
import axios from 'axios';

// En lugar de
import postgresService from './postgres.service';
```

---

**Fecha de migración:** Diciembre 2025
**Autor:** BSL Consulta Video Team
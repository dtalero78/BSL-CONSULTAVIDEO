# Migraciones de Base de Datos PostgreSQL

Este directorio contiene las migraciones SQL para la base de datos PostgreSQL de Digital Ocean.

## Ejecutar Migración Inicial

### Opción 1: Desde tu máquina local (recomendado para primera vez)

1. Instala PostgreSQL client en tu máquina:
   ```bash
   # macOS
   brew install postgresql

   # Ubuntu/Debian
   sudo apt-get install postgresql-client
   ```

2. Conéctate a la base de datos:
   ```bash
   psql "postgresql://[USUARIO]:[PASSWORD]@[HOST]:25060/defaultdb?sslmode=require"
   ```

   (Solicita las credenciales al administrador)

3. Ejecuta la migración:
   ```sql
   \i backend/migrations/001_create_historia_clinica.sql
   ```

   O desde la terminal directamente:
   ```bash
   psql "postgresql://[USUARIO]:[PASSWORD]@[HOST]:25060/defaultdb?sslmode=require" < backend/migrations/001_create_historia_clinica.sql
   ```

### Opción 2: Desde Digital Ocean Console

1. Ve a https://cloud.digitalocean.com/databases
2. Selecciona la base de datos `bslpostgres`
3. Ve a la pestaña "Console"
4. Copia y pega el contenido de `001_create_historia_clinica.sql`
5. Ejecuta

### Opción 3: Usando un cliente GUI (DBeaver, pgAdmin, etc.)

1. Descarga e instala [DBeaver](https://dbeaver.io/) o [pgAdmin](https://www.pgadmin.org/)
2. Crea nueva conexión (solicita credenciales al administrador):
   - Host: `[HOST]`
   - Port: `25060`
   - Database: `defaultdb`
   - Username: `[USUARIO]`
   - Password: `[PASSWORD]`
   - SSL Mode: `require`
3. Abre `001_create_historia_clinica.sql` y ejecuta

## Verificar que la Tabla se Creó Correctamente

```sql
-- Verificar que la tabla existe
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'HistoriaClinica';

-- Ver estructura de la tabla
\d "HistoriaClinica"

-- Contar registros (debería ser 0 inicialmente)
SELECT COUNT(*) FROM "HistoriaClinica";
```

## Migraciones

| Archivo | Descripción | Estado |
|---------|-------------|--------|
| `001_create_historia_clinica.sql` | Crea tabla HistoriaClinica con 46 campos | ⏳ Pendiente |

## Notas Importantes

1. **Backup de Wix es la fuente principal**: PostgreSQL es solo un backup secundario
2. **La tabla usa comillas dobles** para nombres porque replica exactamente Wix
3. **Trigger automático**: `_updatedDate` se actualiza automáticamente en cada UPDATE
4. **Índices optimizados**: Para consultas frecuentes por médico, fecha, documento
5. **SSL obligatorio**: Digital Ocean requiere SSL para todas las conexiones

## Sincronización Automática

Una vez la tabla esté creada, el backend sincronizará automáticamente:

1. Cuando un médico guarda historia clínica → Guarda en Wix Y PostgreSQL
2. Si Wix falla → Error (Wix es principal)
3. Si PostgreSQL falla → Solo log de warning (no interrumpe el flujo)

Ver código en: `backend/src/services/medical-history.service.ts` (líneas 123-165)

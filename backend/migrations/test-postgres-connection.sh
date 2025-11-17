#!/bin/bash

# Script para probar conexión y verificar tabla HistoriaClinica en PostgreSQL
# Uso: ./test-postgres-connection.sh

echo "🔍 Verificando conexión a PostgreSQL..."
echo ""

# Solicitar credenciales
read -p "Usuario PostgreSQL (default: doadmin): " POSTGRES_USER
POSTGRES_USER=${POSTGRES_USER:-doadmin}

read -sp "Password PostgreSQL: " POSTGRES_PASSWORD
echo ""

read -p "Host PostgreSQL (default: bslpostgres-do-user-19197755-0.k.db.ondigitalocean.com): " POSTGRES_HOST
POSTGRES_HOST=${POSTGRES_HOST:-bslpostgres-do-user-19197755-0.k.db.ondigitalocean.com}

POSTGRES_PORT=25060
POSTGRES_DB=defaultdb

# Construir connection string
CONNECTION_STRING="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}?sslmode=require"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 1: Verificar conexión básica"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
psql "${CONNECTION_STRING}" -c "SELECT version();" 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Conexión exitosa"
else
    echo "❌ Error de conexión"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 2: Verificar si existe la tabla HistoriaClinica"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
psql "${CONNECTION_STRING}" -c "
SELECT
    table_name,
    table_schema
FROM information_schema.tables
WHERE table_name = 'HistoriaClinica'
  AND table_schema = 'public';
" 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Consulta ejecutada"
else
    echo "❌ Error al consultar tablas"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 3: Ver estructura de la tabla (si existe)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
psql "${CONNECTION_STRING}" -c "\d \"HistoriaClinica\"" 2>&1

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 4: Contar registros existentes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
psql "${CONNECTION_STRING}" -c "SELECT COUNT(*) as total_registros FROM \"HistoriaClinica\";" 2>&1

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 5: Insertar registro de prueba"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TEST_ID="test-$(date +%s)"
psql "${CONNECTION_STRING}" -c "
INSERT INTO \"HistoriaClinica\" (
    \"_id\", \"numeroId\", \"primerNombre\", \"primerApellido\", \"celular\", \"atendido\"
) VALUES (
    '${TEST_ID}',
    'TEST123',
    'Juan',
    'Pérez',
    '3001234567',
    'PRUEBA'
)
RETURNING \"_id\", \"primerNombre\", \"primerApellido\", \"_createdDate\";
" 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Registro de prueba insertado con ID: ${TEST_ID}"
else
    echo "❌ Error al insertar registro de prueba"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 6: Verificar que el registro se guardó"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
psql "${CONNECTION_STRING}" -c "
SELECT
    \"_id\",
    \"numeroId\",
    \"primerNombre\",
    \"primerApellido\",
    \"_createdDate\",
    \"_updatedDate\"
FROM \"HistoriaClinica\"
WHERE \"_id\" = '${TEST_ID}';
" 2>&1

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 7: Limpiar registro de prueba"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
psql "${CONNECTION_STRING}" -c "DELETE FROM \"HistoriaClinica\" WHERE \"_id\" = '${TEST_ID}';" 2>&1

echo ""
echo "✅ Pruebas completadas"
echo ""

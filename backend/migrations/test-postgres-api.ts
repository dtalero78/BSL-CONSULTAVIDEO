import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

interface TestResult {
  test: string;
  success: boolean;
  message: string;
  data?: any;
}

const results: TestResult[] = [];

async function runTests() {
  console.log('🔍 Iniciando pruebas de PostgreSQL...\n');

  // Configurar pool de conexiones
  const pool = new Pool({
    user: process.env.POSTGRES_USER || 'doadmin',
    password: process.env.POSTGRES_PASSWORD,
    host: process.env.POSTGRES_HOST || 'bslpostgres-do-user-19197755-0.k.db.ondigitalocean.com',
    port: parseInt(process.env.POSTGRES_PORT || '25060'),
    database: process.env.POSTGRES_DATABASE || 'defaultdb',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    // TEST 1: Verificar conexión
    console.log('━'.repeat(70));
    console.log('TEST 1: Verificar conexión básica');
    console.log('━'.repeat(70));
    try {
      const client = await pool.connect();
      const versionResult = await client.query('SELECT version()');
      client.release();

      console.log('✅ Conexión exitosa');
      console.log('Versión:', versionResult.rows[0].version.substring(0, 50) + '...');
      results.push({ test: 'Conexión', success: true, message: 'Conexión establecida' });
    } catch (error: any) {
      console.log('❌ Error de conexión:', error.message);
      results.push({ test: 'Conexión', success: false, message: error.message });
      throw error; // No continuar si no hay conexión
    }

    // TEST 2: Verificar si existe la tabla
    console.log('\n' + '━'.repeat(70));
    console.log('TEST 2: Verificar si existe la tabla HistoriaClinica');
    console.log('━'.repeat(70));
    try {
      const tableCheck = await pool.query(`
        SELECT table_name, table_schema
        FROM information_schema.tables
        WHERE table_name = 'HistoriaClinica'
          AND table_schema = 'public'
      `);

      if (tableCheck.rows.length > 0) {
        console.log('✅ Tabla HistoriaClinica existe');
        console.log('Schema:', tableCheck.rows[0].table_schema);
        results.push({ test: 'Tabla existe', success: true, message: 'Tabla encontrada', data: tableCheck.rows });
      } else {
        console.log('❌ Tabla HistoriaClinica NO existe');
        console.log('⚠️  Necesitas ejecutar la migración: 001_create_historia_clinica.sql');
        results.push({ test: 'Tabla existe', success: false, message: 'Tabla no encontrada' });
      }
    } catch (error: any) {
      console.log('❌ Error verificando tabla:', error.message);
      results.push({ test: 'Tabla existe', success: false, message: error.message });
    }

    // TEST 3: Contar columnas
    console.log('\n' + '━'.repeat(70));
    console.log('TEST 3: Verificar estructura de la tabla');
    console.log('━'.repeat(70));
    try {
      const columnCheck = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'HistoriaClinica'
          AND table_schema = 'public'
        ORDER BY ordinal_position
      `);

      if (columnCheck.rows.length > 0) {
        console.log(`✅ Tabla tiene ${columnCheck.rows.length} columnas`);
        console.log('Primeras 10 columnas:');
        columnCheck.rows.slice(0, 10).forEach((col) => {
          console.log(`  - ${col.column_name}: ${col.data_type}`);
        });
        results.push({ test: 'Estructura tabla', success: true, message: `${columnCheck.rows.length} columnas`, data: columnCheck.rows });
      } else {
        console.log('⚠️  No se pudieron obtener columnas (tabla no existe)');
        results.push({ test: 'Estructura tabla', success: false, message: 'No se encontraron columnas' });
      }
    } catch (error: any) {
      console.log('❌ Error obteniendo estructura:', error.message);
      results.push({ test: 'Estructura tabla', success: false, message: error.message });
    }

    // TEST 4: Contar registros
    console.log('\n' + '━'.repeat(70));
    console.log('TEST 4: Contar registros existentes');
    console.log('━'.repeat(70));
    try {
      const countResult = await pool.query('SELECT COUNT(*) as total FROM "HistoriaClinica"');
      console.log(`✅ Total de registros: ${countResult.rows[0].total}`);
      results.push({ test: 'Contar registros', success: true, message: `${countResult.rows[0].total} registros`, data: countResult.rows });
    } catch (error: any) {
      console.log('❌ Error contando registros:', error.message);
      results.push({ test: 'Contar registros', success: false, message: error.message });
    }

    // TEST 5: Insertar registro de prueba
    console.log('\n' + '━'.repeat(70));
    console.log('TEST 5: Insertar registro de prueba');
    console.log('━'.repeat(70));
    const testId = `test-${Date.now()}`;
    try {
      const insertResult = await pool.query(`
        INSERT INTO "HistoriaClinica" (
          "_id", "numeroId", "primerNombre", "primerApellido", "celular", "atendido"
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING "_id", "primerNombre", "primerApellido", "_createdDate"
      `, [testId, 'TEST123', 'Juan', 'Pérez', '3001234567', 'PRUEBA']);

      console.log('✅ Registro de prueba insertado:');
      console.log('  ID:', insertResult.rows[0]._id);
      console.log('  Nombre:', insertResult.rows[0].primerNombre, insertResult.rows[0].primerApellido);
      console.log('  Fecha creación:', insertResult.rows[0]._createdDate);
      results.push({ test: 'Insertar registro', success: true, message: 'Registro insertado', data: insertResult.rows });
    } catch (error: any) {
      console.log('❌ Error insertando registro:', error.message);
      results.push({ test: 'Insertar registro', success: false, message: error.message });
    }

    // TEST 6: Leer el registro insertado
    console.log('\n' + '━'.repeat(70));
    console.log('TEST 6: Leer registro insertado');
    console.log('━'.repeat(70));
    try {
      const selectResult = await pool.query(`
        SELECT "_id", "numeroId", "primerNombre", "primerApellido", "_createdDate", "_updatedDate"
        FROM "HistoriaClinica"
        WHERE "_id" = $1
      `, [testId]);

      if (selectResult.rows.length > 0) {
        console.log('✅ Registro encontrado:');
        console.log(JSON.stringify(selectResult.rows[0], null, 2));
        results.push({ test: 'Leer registro', success: true, message: 'Registro leído', data: selectResult.rows });
      } else {
        console.log('❌ No se encontró el registro insertado');
        results.push({ test: 'Leer registro', success: false, message: 'Registro no encontrado' });
      }
    } catch (error: any) {
      console.log('❌ Error leyendo registro:', error.message);
      results.push({ test: 'Leer registro', success: false, message: error.message });
    }

    // TEST 7: Limpiar registro de prueba
    console.log('\n' + '━'.repeat(70));
    console.log('TEST 7: Limpiar registro de prueba');
    console.log('━'.repeat(70));
    try {
      const deleteResult = await pool.query(`
        DELETE FROM "HistoriaClinica" WHERE "_id" = $1
      `, [testId]);

      console.log(`✅ Registro de prueba eliminado (${deleteResult.rowCount} filas)`);
      results.push({ test: 'Eliminar registro', success: true, message: 'Registro eliminado' });
    } catch (error: any) {
      console.log('❌ Error eliminando registro:', error.message);
      results.push({ test: 'Eliminar registro', success: false, message: error.message });
    }

  } catch (error: any) {
    console.error('\n❌ Error fatal:', error.message);
  } finally {
    await pool.end();
  }

  // Resumen
  console.log('\n' + '═'.repeat(70));
  console.log('RESUMEN DE PRUEBAS');
  console.log('═'.repeat(70));
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`✅ Exitosas: ${passed}`);
  console.log(`❌ Fallidas: ${failed}`);
  console.log('\nDetalle:');
  results.forEach((r, i) => {
    const icon = r.success ? '✅' : '❌';
    console.log(`  ${i + 1}. ${icon} ${r.test}: ${r.message}`);
  });

  if (failed === 0) {
    console.log('\n🎉 ¡Todas las pruebas pasaron! PostgreSQL está funcionando correctamente.');
  } else {
    console.log('\n⚠️  Hay problemas que necesitan atención.');
  }
}

runTests().catch(console.error);

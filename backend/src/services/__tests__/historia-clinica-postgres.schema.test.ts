// ============================================================================
// crearPendiente() vs el esquema REAL de producción de "HistoriaClinica".
//
// El fixture es una copia de information_schema de producción (la tabla la
// define BSL-PLATAFORMA2; migrations/001 de este repo está desactualizada).
// Si el INSERT usa una columna que no existe en producción, este test falla.
// ============================================================================

jest.mock('../postgres.service', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import fs from 'fs';
import path from 'path';
import historiaClinicaPostgresService, { HistoriaPendienteData } from '../historia-clinica-postgres.service';

interface ColumnaProd {
  tipo: string;
  nullable: boolean;
  tieneDefault: boolean;
}

function cargarEsquemaProd(): Map<string, ColumnaProd> {
  const tsv = fs.readFileSync(path.join(__dirname, 'fixtures', 'historia-clinica.columnas-prod.tsv'), 'utf8');
  const columnas = new Map<string, ColumnaProd>();
  for (const linea of tsv.split('\n')) {
    if (!linea.trim() || linea.startsWith('#') || linea.startsWith('column_name\t')) continue;
    const [nombre, tipo, isNullable, def = ''] = linea.split('\t');
    columnas.set(nombre, { tipo, nullable: isNullable === 'YES', tieneDefault: def.trim() !== '' });
  }
  return columnas;
}

const ESQUEMA = cargarEsquemaProd();

function datos(overrides: Partial<HistoriaPendienteData> = {}): HistoriaPendienteData {
  return {
    _id: '1f0e8a52-0000-4000-8000-000000000001',
    numeroId: '1020304050',
    primerNombre: 'Ana',
    segundoNombre: null,
    primerApellido: 'Pérez',
    segundoApellido: null,
    celular: '573001234567',
    fechaNacimiento: '2017-03-01',
    codEmpresa: 'MALUWA360',
    empresa: 'IE Rural El Carmen',
    tipoExamen: 'Valoración General',
    medico: 'MEDICO1',
    motivoConsulta: 'Jornada de salud MALUWA360',
    tenantId: 'bsl',
    ...overrides,
  };
}

/** Ejecuta crearPendiente con un cliente falso y devuelve columnas → valor insertado. */
async function capturarInsert(d: HistoriaPendienteData = datos()) {
  const query = jest.fn(async () => ({ rows: [{ _id: d._id }] }));
  const ok = await historiaClinicaPostgresService.crearPendiente(d, { query } as any);
  expect(ok).toBe(true);
  const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];

  const m = /INSERT INTO "HistoriaClinica"\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)\s*ON CONFLICT/.exec(sql);
  if (!m) throw new Error(`SQL inesperado: ${sql}`);
  const columnas = m[1].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const expresiones = m[2].split(',').map((v) => v.trim());
  const valores = new Map<string, unknown>();
  columnas.forEach((c, i) => {
    const ph = /^\$(\d+)$/.exec(expresiones[i]);
    valores.set(c, ph ? params[Number(ph[1]) - 1] : expresiones[i]);
  });
  return { sql, params, columnas, expresiones, valores };
}

describe('crearPendiente vs esquema de producción de HistoriaClinica', () => {
  it('el fixture tiene las 218 columnas de producción', () => {
    expect(ESQUEMA.size).toBe(218);
    expect(ESQUEMA.get('fecha_nacimiento')?.tipo).toBe('date');
    expect(ESQUEMA.has('fechaNacimiento')).toBe(false);
    expect(ESQUEMA.has('edad')).toBe(false);
  });

  it('todas las columnas del INSERT existen en producción', async () => {
    const { columnas } = await capturarInsert();
    const inexistentes = columnas.filter((c) => !ESQUEMA.has(c));
    expect(inexistentes).toEqual([]);
  });

  it('lista exacta de columnas del INSERT (cambiarla exige revisar este test)', async () => {
    const { columnas, expresiones, params } = await capturarInsert();
    expect(columnas).toEqual([
      '_id', 'numeroId', 'primerNombre', 'segundoNombre', 'primerApellido', 'segundoApellido',
      'celular', 'fecha_nacimiento', 'codEmpresa', 'empresa', 'tipoExamen', 'medico',
      'motivoConsulta', 'atendido', 'fechaAtencion', 'fechaConsulta', 'tenant_id',
    ]);
    expect(expresiones).toHaveLength(columnas.length);
    const placeholders = expresiones.filter((e) => /^\$\d+$/.test(e)).length;
    expect(params).toHaveLength(placeholders);
  });

  it('cubre todas las columnas NOT NULL sin default, con valor no vacío', async () => {
    const obligatorias = [...ESQUEMA.entries()].filter(([, c]) => !c.nullable && !c.tieneDefault).map(([n]) => n);
    expect(obligatorias.sort()).toEqual(['_id', 'celular', 'numeroId', 'primerApellido', 'primerNombre']);
    const { valores } = await capturarInsert();
    for (const col of obligatorias) {
      expect(valores.has(col)).toBe(true);
      expect(String(valores.get(col) ?? '').trim()).not.toBe('');
    }
  });

  it('valores clave: fecha_nacimiento (date), pendiente sin fechaConsulta, tenant explícito', async () => {
    const { valores } = await capturarInsert();
    expect(valores.get('fecha_nacimiento')).toBe('2017-03-01');
    expect(valores.get('atendido')).toBe("'PENDIENTE'");
    expect(valores.get('fechaAtencion')).toBe('NOW()');
    expect(valores.get('fechaConsulta')).toBe('NULL'); // si no, el panel la contaría como atendida
    expect(valores.get('tenant_id')).toBe('bsl');
    expect(valores.get('celular')).toBe('573001234567');
  });

  it.each(['celular', 'numeroId', 'primerNombre', 'primerApellido'] as const)(
    'rechaza %s vacío ANTES de ir a la BD',
    async (campo) => {
      const query = jest.fn();
      await expect(
        historiaClinicaPostgresService.crearPendiente(datos({ [campo]: '  ' }), { query } as any)
      ).rejects.toThrow(new RegExp(`NOT NULL.*${campo}`));
      expect(query).not.toHaveBeenCalled();
    }
  );
});

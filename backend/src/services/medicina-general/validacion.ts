// ============================================================================
// Validación y normalización de la consulta de medicina general.
//
// Funciones puras (sin base de datos) para que se puedan probar con jest. Los
// rangos de los signos vitales y las formas de los JSON son los de la migración
// 0018_medicina_general.sql de BSL-PLATAFORMA2: si cambian allá, cambian acá.
//
// Lo único que NO se resuelve aquí es la descripción de cada diagnóstico: se
// copia de la tabla cie10 en el servicio, nunca de lo que mande el navegador
// (el RDA exige el literal oficial carácter por carácter).
// ============================================================================

export const TIPO_EXAMEN_MEDICINA_GENERAL = 'Medicina general';

/** ¿La orden es de medicina general? Tolera mayúsculas y espacios sobrantes. */
export function esMedicinaGeneral(tipoExamen: unknown): boolean {
  return (
    typeof tipoExamen === 'string' &&
    tipoExamen.trim().toLowerCase() === TIPO_EXAMEN_MEDICINA_GENERAL.toLowerCase()
  );
}

export const MAX_TEXTO = 20000;
export const MAX_DIAGNOSTICOS = 10;
export const MAX_FORMULA = 20;
export const MAX_ORDENES = 20;

/** Error de validación: se responde 400 con { error, campo }. */
export class ErrorValidacion extends Error {
  constructor(mensaje: string, public readonly campo: string) {
    super(mensaje);
    this.name = 'ErrorValidacion';
  }
}

export type TipoDiagnostico = 'principal' | 'relacionado';
export type ClaseDiagnostico = 'impresion' | 'confirmado_nuevo' | 'confirmado_repetido';
export type TipoOrden = 'laboratorio' | 'imagen' | 'remision' | 'otro';
export type OrigenIncapacidad = 'enfermedad_general' | 'accidente_trabajo' | 'enfermedad_laboral';

/** Diagnóstico tal como llega validado (sin descripción: la pone el servicio). */
export interface DiagnosticoEntrada {
  codigo: string;
  tipo: TipoDiagnostico;
  clase: ClaseDiagnostico;
}

export interface Diagnostico extends DiagnosticoEntrada {
  descripcion: string;
}

export interface ItemFormula {
  medicamento: string;
  concentracion: string | null;
  forma: string | null;
  dosis: string;
  via: string;
  frecuencia: string;
  duracion_dias: number;
  cantidad: string;
  indicaciones: string | null;
}

export interface ItemOrden {
  tipo: TipoOrden;
  descripcion: string;
  indicaciones: string | null;
}

export interface Incapacidad {
  dias: number;
  desde: string;
  hasta: string;
  origen: OrigenIncapacidad;
  diagnostico: string;
}

export const CAMPOS_TEXTO = [
  'motivo_consulta',
  'enfermedad_actual',
  'antecedentes',
  'revision_sistemas',
  'examen_fisico',
  'analisis',
  'plan_manejo',
  'recomendaciones',
] as const;
export type CampoTexto = (typeof CAMPOS_TEXTO)[number];

/** Rangos de los CHECK de la migración. `decimales` 0 = SMALLINT. */
export const SIGNOS_VITALES = {
  ta_sistolica: { min: 40, max: 300, decimales: 0 },
  ta_diastolica: { min: 20, max: 200, decimales: 0 },
  frecuencia_cardiaca: { min: 20, max: 250, decimales: 0 },
  frecuencia_respiratoria: { min: 4, max: 80, decimales: 0 },
  temperatura: { min: 30, max: 45, decimales: 1 },
  saturacion: { min: 50, max: 100, decimales: 0 },
  peso_kg: { min: 0.5, max: 400, decimales: 1 },
  talla_cm: { min: 30, max: 250, decimales: 1 },
} as const;
export type SignoVital = keyof typeof SIGNOS_VITALES;
export const CAMPOS_SIGNOS = Object.keys(SIGNOS_VITALES) as SignoVital[];

/** La consulta validada y lista para guardar (diagnósticos aún sin descripción). */
export type ConsultaValidada = { [K in CampoTexto]: string | null } & {
  [K in SignoVital]: number | null;
} & {
  medico: string | null;
  diagnosticos: DiagnosticoEntrada[];
  formula: ItemFormula[];
  ordenes: ItemOrden[];
  incapacidad: Incapacidad | null;
};

const TIPOS_DX: readonly TipoDiagnostico[] = ['principal', 'relacionado'];
const CLASES_DX: readonly ClaseDiagnostico[] = ['impresion', 'confirmado_nuevo', 'confirmado_repetido'];
const TIPOS_ORDEN: readonly TipoOrden[] = ['laboratorio', 'imagen', 'remision', 'otro'];
const ORIGENES: readonly OrigenIncapacidad[] = ['enfermedad_general', 'accidente_trabajo', 'enfermedad_laboral'];

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Texto opcional: '' o solo espacios → null. Máximo MAX_TEXTO caracteres. */
export function textoOpcional(valor: unknown, campo: string, max: number = MAX_TEXTO): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') throw new ErrorValidacion(`El campo ${campo} debe ser texto`, campo);
  if (valor.length > max) {
    throw new ErrorValidacion(`El campo ${campo} supera los ${max} caracteres`, campo);
  }
  return valor.trim() === '' ? null : valor;
}

/** Texto obligatorio dentro de un ítem (fórmula, órdenes). Acepta números (p. ej. cantidad). */
function textoRequerido(valor: unknown, campo: string): string {
  const v = typeof valor === 'number' && Number.isFinite(valor) ? String(valor) : valor;
  const t = textoOpcional(v, campo);
  if (t === null) throw new ErrorValidacion(`El campo ${campo} es obligatorio`, campo);
  return t.trim();
}

/** Número opcional dentro de un rango. Acepta número o texto numérico ('36,5' también). */
export function numeroEnRango(
  valor: unknown,
  campo: string,
  min: number,
  max: number,
  decimales: number
): number | null {
  if (valor === undefined || valor === null) return null;
  let n: number;
  if (typeof valor === 'number') {
    n = valor;
  } else if (typeof valor === 'string') {
    const limpio = valor.trim().replace(',', '.');
    if (limpio === '') return null;
    if (!/^-?\d+(\.\d+)?$/.test(limpio)) {
      throw new ErrorValidacion(`El campo ${campo} debe ser un número`, campo);
    }
    n = Number(limpio);
  } else {
    throw new ErrorValidacion(`El campo ${campo} debe ser un número`, campo);
  }
  if (!Number.isFinite(n)) throw new ErrorValidacion(`El campo ${campo} debe ser un número`, campo);
  if (decimales === 0 && !Number.isInteger(n)) {
    throw new ErrorValidacion(`El campo ${campo} debe ser un número entero`, campo);
  }
  const factor = 10 ** decimales;
  const redondeado = Math.round(n * factor) / factor;
  if (redondeado < min || redondeado > max) {
    throw new ErrorValidacion(`El campo ${campo} debe estar entre ${min} y ${max}`, campo);
  }
  return redondeado;
}

/** Entero obligatorio en [min, max] (días de tratamiento o de incapacidad). */
function enteroRequerido(valor: unknown, campo: string, min: number, max: number): number {
  const n = numeroEnRango(valor, campo, min, max, 0);
  if (n === null) throw new ErrorValidacion(`El campo ${campo} es obligatorio`, campo);
  return n;
}

/** Código CIE-10 normalizado: mayúsculas, sin puntos ni espacios ('j02.9' → 'J029'). */
export function normalizarCodigoCie10(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  return valor.replace(/[.\s]/g, '').toUpperCase();
}

function enumeracion<T extends string>(valor: unknown, permitidos: readonly T[], campo: string): T {
  if (typeof valor === 'string' && (permitidos as readonly string[]).includes(valor)) return valor as T;
  throw new ErrorValidacion(`El campo ${campo} debe ser uno de: ${permitidos.join(', ')}`, campo);
}

function lista(valor: unknown, campo: string, max: number): unknown[] {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor)) throw new ErrorValidacion(`El campo ${campo} debe ser una lista`, campo);
  if (valor.length > max) {
    throw new ErrorValidacion(`El campo ${campo} admite máximo ${max} elementos`, campo);
  }
  return valor;
}

export function validarDiagnosticos(valor: unknown): DiagnosticoEntrada[] {
  const items = lista(valor, 'diagnosticos', MAX_DIAGNOSTICOS);
  const vistos = new Set<string>();
  let principales = 0;
  return items.map((item, i) => {
    const base = `diagnosticos[${i}]`;
    if (!esObjeto(item)) throw new ErrorValidacion('Cada diagnóstico debe ser un objeto', base);
    const codigo = normalizarCodigoCie10(item.codigo);
    if (!/^[A-Z][0-9A-Z]{2,9}$/.test(codigo)) {
      throw new ErrorValidacion('Código CIE-10 inválido', `${base}.codigo`);
    }
    if (vistos.has(codigo)) {
      throw new ErrorValidacion(`El diagnóstico ${codigo} está repetido`, `${base}.codigo`);
    }
    vistos.add(codigo);
    const tipo = enumeracion(item.tipo, TIPOS_DX, `${base}.tipo`);
    if (tipo === 'principal' && ++principales > 1) {
      throw new ErrorValidacion('Solo puede haber un diagnóstico principal', `${base}.tipo`);
    }
    const clase = enumeracion(item.clase, CLASES_DX, `${base}.clase`);
    return { codigo, tipo, clase };
  });
}

export function validarFormula(valor: unknown): ItemFormula[] {
  const items = lista(valor, 'formula', MAX_FORMULA);
  return items.map((item, i) => {
    const base = `formula[${i}]`;
    if (!esObjeto(item)) throw new ErrorValidacion('Cada medicamento debe ser un objeto', base);
    return {
      medicamento: textoRequerido(item.medicamento, `${base}.medicamento`),
      concentracion: textoOpcional(item.concentracion, `${base}.concentracion`),
      forma: textoOpcional(item.forma, `${base}.forma`),
      dosis: textoRequerido(item.dosis, `${base}.dosis`),
      via: textoRequerido(item.via, `${base}.via`),
      frecuencia: textoRequerido(item.frecuencia, `${base}.frecuencia`),
      duracion_dias: enteroRequerido(item.duracion_dias, `${base}.duracion_dias`, 1, 365),
      cantidad: textoRequerido(item.cantidad, `${base}.cantidad`),
      indicaciones: textoOpcional(item.indicaciones, `${base}.indicaciones`),
    };
  });
}

export function validarOrdenes(valor: unknown): ItemOrden[] {
  const items = lista(valor, 'ordenes', MAX_ORDENES);
  return items.map((item, i) => {
    const base = `ordenes[${i}]`;
    if (!esObjeto(item)) throw new ErrorValidacion('Cada orden debe ser un objeto', base);
    return {
      tipo: enumeracion(item.tipo, TIPOS_ORDEN, `${base}.tipo`),
      descripcion: textoRequerido(item.descripcion, `${base}.descripcion`),
      indicaciones: textoOpcional(item.indicaciones, `${base}.indicaciones`),
    };
  });
}

/** 'YYYY-MM-DD' válido en el calendario → milisegundos UTC; si no, null. */
function fechaIsoUtc(valor: unknown): number | null {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const [a, m, d] = valor.split('-').map(Number);
  const ms = Date.UTC(a, m - 1, d);
  const f = new Date(ms);
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return ms;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Hoy en Colombia como 'YYYY-MM-DD' (producción corre en UTC). */
export function hoyColombia(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

/** Último día de la incapacidad: desde + dias - 1 (aritmética en UTC, sin zona horaria). */
export function calcularHasta(desde: string, dias: number): string {
  const ms = fechaIsoUtc(desde);
  if (ms === null) throw new ErrorValidacion('Fecha inválida (formato AAAA-MM-DD)', 'incapacidad.desde');
  return new Date(ms + (dias - 1) * 86400000).toISOString().slice(0, 10);
}

export function validarIncapacidad(valor: unknown, diagnosticos: DiagnosticoEntrada[]): Incapacidad | null {
  if (valor === undefined || valor === null) return null;
  if (!esObjeto(valor)) throw new ErrorValidacion('La incapacidad debe ser un objeto', 'incapacidad');
  const dias = enteroRequerido(valor.dias, 'incapacidad.dias', 1, 180);
  if (fechaIsoUtc(valor.desde) === null) {
    throw new ErrorValidacion('Fecha de inicio inválida (formato AAAA-MM-DD)', 'incapacidad.desde');
  }
  const desde = valor.desde as string;
  // Decreto 1427/2022: la incapacidad no se expide con retroactividad (salvo urgencias, hasta 3
  // días). Margen: de 3 días antes a 30 días después de hoy en Colombia.
  const hoy = fechaIsoUtc(hoyColombia());
  const inicio = fechaIsoUtc(desde) as number;
  if (hoy !== null && (inicio < hoy - 3 * DIA_MS || inicio > hoy + 30 * DIA_MS)) {
    throw new ErrorValidacion('La incapacidad debe empezar entre 3 días antes y 30 días después de hoy', 'incapacidad.desde');
  }
  const origen = enumeracion(valor.origen, ORIGENES, 'incapacidad.origen');
  const diagnostico = normalizarCodigoCie10(valor.diagnostico);
  if (!diagnosticos.some((d) => d.codigo === diagnostico)) {
    throw new ErrorValidacion(
      'El diagnóstico de la incapacidad debe ser uno de los diagnósticos de la consulta',
      'incapacidad.diagnostico'
    );
  }
  // `hasta` siempre lo calcula el servidor: lo que mande el navegador se ignora.
  return { dias, desde, hasta: calcularHasta(desde, dias), origen, diagnostico };
}

/** Valida y normaliza el cuerpo de PUT (borrador) y POST /cerrar. Lanza ErrorValidacion. */
export function validarConsulta(cuerpo: unknown): ConsultaValidada {
  if (!esObjeto(cuerpo)) throw new ErrorValidacion('El cuerpo debe ser un objeto JSON', 'cuerpo');

  const textos = {} as { [K in CampoTexto]: string | null };
  for (const campo of CAMPOS_TEXTO) textos[campo] = textoOpcional(cuerpo[campo], campo);

  const signos = {} as { [K in SignoVital]: number | null };
  for (const campo of CAMPOS_SIGNOS) {
    const r = SIGNOS_VITALES[campo];
    signos[campo] = numeroEnRango(cuerpo[campo], campo, r.min, r.max, r.decimales);
  }

  const medicoTexto = textoOpcional(cuerpo.medico, 'medico', 200);
  const diagnosticos = validarDiagnosticos(cuerpo.diagnosticos);

  return {
    ...textos,
    ...signos,
    medico: medicoTexto === null ? null : medicoTexto.trim(),
    diagnosticos,
    formula: validarFormula(cuerpo.formula),
    ordenes: validarOrdenes(cuerpo.ordenes),
    incapacidad: validarIncapacidad(cuerpo.incapacidad, diagnosticos),
  };
}

/** Requisitos extra para cerrar (firmar) la consulta. Lanza ErrorValidacion. */
export function validarCierre(consulta: ConsultaValidada): void {
  const obligatorios: Array<[CampoTexto, string]> = [
    ['motivo_consulta', 'el motivo de consulta'],
    ['enfermedad_actual', 'la enfermedad actual'],
    ['antecedentes', 'los antecedentes'],
    ['revision_sistemas', 'la revisión por sistemas'],
    ['examen_fisico', 'el examen físico'],
    ['plan_manejo', 'el plan de manejo'],
  ];
  for (const [campo, nombre] of obligatorios) {
    if (!consulta[campo]) throw new ErrorValidacion(`Para cerrar la consulta falta ${nombre}`, campo);
  }
  const principales = consulta.diagnosticos.filter((d) => d.tipo === 'principal').length;
  if (principales !== 1) {
    throw new ErrorValidacion('Para cerrar la consulta debe haber exactamente un diagnóstico principal', 'diagnosticos');
  }
}

/** Escapa los comodines de LIKE (% _ \). */
function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Minúsculas y sin tildes (igual que el translate() de la búsqueda en SQL). */
export function quitarTildes(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export interface BusquedaCie10 {
  /** Patrón LIKE para el prefijo del código ('J02%'), o null si la búsqueda no parece un código. */
  prefijoCodigo: string | null;
  /** Patrones LIKE ('%palabra%') que deben estar TODOS en la descripción. */
  palabras: string[];
}

/** Prepara la búsqueda del typeahead. null si no hay nada que buscar. */
export function prepararBusquedaCie10(q: unknown): BusquedaCie10 | null {
  if (typeof q !== 'string') return null;
  const texto = q.trim().slice(0, 100);
  if (texto === '') return null;

  const codigo = texto.replace(/[.\s]/g, '').toUpperCase();
  const prefijoCodigo = /^[A-Z0-9]+$/.test(codigo) ? `${escaparLike(codigo)}%` : null;

  const palabras = quitarTildes(texto)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((p) => `%${escaparLike(p)}%`);

  return { prefijoCodigo, palabras };
}

/**
 * Integración Maluwa360 → BSL (POST /api/integration/consultas).
 *
 * Funciones puras (sin IO) para:
 *   - Validar el payload de creación de consultas (consentimiento SIEMPRE obligatorio;
 *     acudiente obligatorio si el paciente es menor de 18 años).
 *   - Construir patientUrl / doctorUrl con los mismos parámetros que el botón
 *     "Crear sala" del panel (MedicalPanelPage.handleCrearSala).
 *   - Mapear el Concepto Final (mdConceptoFinal) al vocabulario de Maluwa360.
 *
 * Contrato: maluwa360/docs/INTEGRACION-BSL.md
 */
import { esConceptoAptoPleno, normalizarConcepto } from './concepto-aptitud.helper';

/** Origen de la integración. También es el codEmpresa de las historias que crea. */
export const MALUWA360_SOURCE = 'MALUWA360';

export const EDAD_MAYORIA = 18;

export const TIPOS_CONSULTA_INTEGRACION = ['VALORACION_GENERAL', 'OCUPACIONAL_PERIODICO'] as const;
export type TipoConsultaIntegracion = (typeof TIPOS_CONSULTA_INTEGRACION)[number];

/** tipo (Maluwa360) → HistoriaClinica.tipoExamen (valores que ya usa BSL: 'Periódico', 'Ingreso', ...). */
export const TIPO_EXAMEN_POR_TIPO: Record<TipoConsultaIntegracion, string> = {
  VALORACION_GENERAL: 'Valoración General',
  OCUPACIONAL_PERIODICO: 'Periódico',
};

export interface ConsultaIntegracionInput {
  externalId: string;
  tipo: TipoConsultaIntegracion;
  medico: string;
  institucion: { nombre: string | null; dane: string | null } | null;
  paciente: {
    tipoDocumento: string;
    documento: string;
    primerNombre: string;
    segundoNombre: string | null;
    primerApellido: string;
    segundoApellido: string | null;
    fechaNacimiento: string; // AAAA-MM-DD
    celular: string | null;
  };
  acudiente: {
    nombre: string | null;
    documento: string | null;
    celular: string | null;
    parentesco: string | null;
  } | null;
  consentimiento: { version: string; otorgadoEn: string; medio: string };
  notificar: boolean;
  // Derivados
  edad: number;
  esMenor: boolean;
  /** Celular de contacto normalizado sin '+' (57XXXXXXXXXX): el del acudiente si es menor. */
  celularContacto: string;
}

export type ResultadoValidacion =
  | { ok: true; value: ConsultaIntegracionInput }
  | { ok: false; errores: string[] };

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function leerTexto(
  obj: Obj | null,
  campo: string,
  ruta: string,
  errores: string[],
  opts: { requerido: boolean; max: number; mensajeRequerido?: string }
): string | null {
  const v = obj ? obj[campo] : undefined;
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
    if (opts.requerido) errores.push(opts.mensajeRequerido || `${ruta} es obligatorio.`);
    return null;
  }
  if (typeof v !== 'string' && typeof v !== 'number') {
    errores.push(`${ruta} debe ser texto.`);
    return null;
  }
  const s = String(v).trim();
  if (s.length > opts.max) {
    errores.push(`${ruta} no puede superar ${opts.max} caracteres.`);
    return null;
  }
  return s;
}

/** true si `s` es AAAA-MM-DD y corresponde a una fecha real del calendario. */
export function esFechaIsoValida(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Edad en años cumplidos a la fecha actual de Colombia (UTC-5, sin horario de verano). */
export function calcularEdad(fechaNacimiento: string, now: Date = new Date()): number {
  const [y, m, d] = fechaNacimiento.split('-').map(Number);
  const bogota = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const hoyY = bogota.getUTCFullYear();
  const hoyM = bogota.getUTCMonth() + 1;
  const hoyD = bogota.getUTCDate();
  let edad = hoyY - y;
  if (hoyM < m || (hoyM === m && hoyD < d)) edad--;
  return edad;
}

/**
 * Normaliza un celular a dígitos con indicativo, sin '+' (57XXXXXXXXXX).
 * Devuelve null si no parece un celular válido.
 */
export function normalizarCelularContacto(raw: string): string | null {
  if (!/^[+\d\s().-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`; // celular colombiano sin indicativo
  if (digits.length >= 11 && digits.length <= 15) return digits; // ya trae indicativo (57… u otro país)
  return null;
}

/**
 * Valida y normaliza el body de POST /api/integration/consultas.
 * Devuelve TODOS los errores encontrados (el primero es el más relevante).
 */
export function validarConsultaIntegracion(body: unknown, now: Date = new Date()): ResultadoValidacion {
  if (!isObj(body)) {
    return { ok: false, errores: ['El cuerpo de la petición debe ser un objeto JSON.'] };
  }
  const errores: string[] = [];

  // ---- Datos de la consulta ----
  const externalId = leerTexto(body, 'externalId', 'externalId', errores, { requerido: true, max: 255 });

  let tipo: TipoConsultaIntegracion | null = null;
  const tipoRaw = leerTexto(body, 'tipo', 'tipo', errores, { requerido: true, max: 50 });
  if (tipoRaw) {
    const up = tipoRaw.toUpperCase();
    if ((TIPOS_CONSULTA_INTEGRACION as readonly string[]).includes(up)) {
      tipo = up as TipoConsultaIntegracion;
    } else {
      errores.push(`tipo debe ser uno de: ${TIPOS_CONSULTA_INTEGRACION.join(', ')}.`);
    }
  }

  const medico = leerTexto(body, 'medico', 'medico', errores, {
    requerido: true,
    max: 100,
    mensajeRequerido: 'medico es obligatorio (código del médico asignado a la jornada).',
  });

  const empresa = leerTexto(body, 'empresa', 'empresa', errores, { requerido: false, max: 100 });
  if (empresa && empresa.toUpperCase() !== MALUWA360_SOURCE) {
    errores.push(`empresa, si se envía, debe ser "${MALUWA360_SOURCE}".`);
  }

  let institucion: ConsultaIntegracionInput['institucion'] = null;
  if (body.institucion !== undefined && body.institucion !== null) {
    if (!isObj(body.institucion)) {
      errores.push('institucion debe ser un objeto { nombre, dane }.');
    } else {
      institucion = {
        nombre: leerTexto(body.institucion, 'nombre', 'institucion.nombre', errores, { requerido: false, max: 255 }),
        dane: leerTexto(body.institucion, 'dane', 'institucion.dane', errores, { requerido: false, max: 30 }),
      };
    }
  }

  // ---- Paciente ----
  const pac = isObj(body.paciente) ? body.paciente : null;
  if (!pac) errores.push('paciente es obligatorio.');

  const tipoDocumento = pac
    ? leerTexto(pac, 'tipoDocumento', 'paciente.tipoDocumento', errores, { requerido: true, max: 10 })
    : null;
  const documento = pac
    ? leerTexto(pac, 'documento', 'paciente.documento', errores, { requerido: true, max: 50 })
    : null;
  if (documento && !/^[A-Za-z0-9-]{3,30}$/.test(documento)) {
    errores.push('paciente.documento solo admite letras, números y guiones (entre 3 y 30 caracteres).');
  }
  const primerNombre = pac
    ? leerTexto(pac, 'primerNombre', 'paciente.primerNombre', errores, { requerido: true, max: 100 })
    : null;
  const segundoNombre = pac
    ? leerTexto(pac, 'segundoNombre', 'paciente.segundoNombre', errores, { requerido: false, max: 100 })
    : null;
  const primerApellido = pac
    ? leerTexto(pac, 'primerApellido', 'paciente.primerApellido', errores, { requerido: true, max: 100 })
    : null;
  const segundoApellido = pac
    ? leerTexto(pac, 'segundoApellido', 'paciente.segundoApellido', errores, { requerido: false, max: 100 })
    : null;
  const celularPaciente = pac
    ? leerTexto(pac, 'celular', 'paciente.celular', errores, { requerido: false, max: 30 })
    : null;

  const fechaNacimiento = pac
    ? leerTexto(pac, 'fechaNacimiento', 'paciente.fechaNacimiento', errores, {
        requerido: true,
        max: 40,
        mensajeRequerido: 'paciente.fechaNacimiento es obligatoria (formato AAAA-MM-DD).',
      })
    : null;
  let edad: number | null = null;
  if (fechaNacimiento) {
    if (!esFechaIsoValida(fechaNacimiento)) {
      errores.push('paciente.fechaNacimiento debe tener formato AAAA-MM-DD y ser una fecha válida.');
    } else {
      const e = calcularEdad(fechaNacimiento, now);
      if (e < 0) errores.push('paciente.fechaNacimiento no puede ser una fecha futura.');
      else if (e > 120) errores.push('paciente.fechaNacimiento no es válida (edad mayor a 120 años).');
      else edad = e;
    }
  }
  const esMenor = edad !== null && edad < EDAD_MAYORIA;

  // ---- Acudiente (obligatorio si es menor) ----
  let acudiente: ConsultaIntegracionInput['acudiente'] = null;
  const acuRaw = body.acudiente;
  if (acuRaw !== undefined && acuRaw !== null && !isObj(acuRaw)) {
    errores.push('acudiente debe ser un objeto { nombre, documento, celular, parentesco }.');
  } else if (esMenor && !isObj(acuRaw)) {
    errores.push(
      `El paciente es menor de edad (${edad} años): el acudiente es obligatorio ` +
        '(acudiente.nombre, acudiente.documento, acudiente.celular y acudiente.parentesco).'
    );
  } else if (isObj(acuRaw)) {
    const campo = (c: string, max: number): string | null =>
      leerTexto(acuRaw, c, `acudiente.${c}`, errores, {
        requerido: esMenor,
        max,
        mensajeRequerido: `acudiente.${c} es obligatorio porque el paciente es menor de edad (${edad} años).`,
      });
    acudiente = {
      nombre: campo('nombre', 200),
      documento: campo('documento', 50),
      celular: campo('celular', 30),
      parentesco: campo('parentesco', 50),
    };
  }

  // ---- Celular de contacto: el del acudiente si es menor ----
  let celularContacto: string | null = null;
  if (edad !== null) {
    const fuente = esMenor ? acudiente?.celular : celularPaciente || acudiente?.celular;
    const rutaFuente = esMenor || !celularPaciente ? 'acudiente.celular' : 'paciente.celular';
    if (fuente) {
      celularContacto = normalizarCelularContacto(fuente);
      if (!celularContacto) errores.push(`${rutaFuente} no es un número de celular válido.`);
    } else if (!esMenor) {
      errores.push('Se requiere un celular de contacto: paciente.celular o acudiente.celular.');
    }
  }

  // ---- Consentimiento (SIEMPRE obligatorio) ----
  let consentimiento: ConsultaIntegracionInput['consentimiento'] | null = null;
  const cons = body.consentimiento;
  if (!isObj(cons)) {
    errores.push('consentimiento es obligatorio: { version, otorgadoEn, medio }.');
  } else {
    const version = leerTexto(cons, 'version', 'consentimiento.version', errores, { requerido: true, max: 50 });
    const otorgadoEn = leerTexto(cons, 'otorgadoEn', 'consentimiento.otorgadoEn', errores, { requerido: true, max: 40 });
    const medio = leerTexto(cons, 'medio', 'consentimiento.medio', errores, { requerido: true, max: 50 });
    let otorgadoValido = false;
    if (otorgadoEn) {
      const t = Date.parse(otorgadoEn);
      if (!/^\d{4}-\d{2}-\d{2}T/.test(otorgadoEn) || Number.isNaN(t)) {
        errores.push('consentimiento.otorgadoEn debe ser fecha-hora ISO 8601 (ej: 2026-09-01T10:00:00-05:00).');
      } else if (t > now.getTime() + 10 * 60 * 1000) {
        errores.push('consentimiento.otorgadoEn no puede estar en el futuro.');
      } else {
        otorgadoValido = true;
      }
    }
    if (version && otorgadoEn && medio && otorgadoValido) consentimiento = { version, otorgadoEn, medio };
  }

  // ---- notificar (default false) ----
  let notificar = false;
  if (body.notificar !== undefined && body.notificar !== null) {
    if (typeof body.notificar !== 'boolean') errores.push('notificar debe ser booleano.');
    else notificar = body.notificar;
  }

  if (
    errores.length > 0 ||
    !externalId || !tipo || !medico || !tipoDocumento || !documento || !primerNombre || !primerApellido ||
    !fechaNacimiento || edad === null || !celularContacto || !consentimiento
  ) {
    return { ok: false, errores: errores.length > 0 ? errores : ['Payload inválido.'] };
  }

  return {
    ok: true,
    value: {
      externalId,
      tipo,
      medico,
      institucion,
      paciente: {
        tipoDocumento: tipoDocumento.toUpperCase(),
        documento,
        primerNombre,
        segundoNombre,
        primerApellido,
        segundoApellido,
        fechaNacimiento,
        celular: celularPaciente,
      },
      acudiente,
      consentimiento,
      notificar,
      edad,
      esMenor,
      celularContacto,
    },
  };
}

/** Nombre que se muestra en la sala / WhatsApp (igual que "Crear sala": nombre completo corto). */
export function nombreVisiblePaciente(input: ConsultaIntegracionInput): string {
  return `${input.paciente.primerNombre} ${input.paciente.primerApellido}`.trim();
}

/** Contexto para el médico en el panel (columna motivoConsulta de HistoriaClinica). */
export function construirMotivoConsulta(input: ConsultaIntegracionInput): string {
  const partes = [`Jornada de salud ${MALUWA360_SOURCE} (${input.tipo})`];
  if (input.institucion?.nombre) {
    partes.push(
      `Institución: ${input.institucion.nombre}` + (input.institucion.dane ? ` (DANE ${input.institucion.dane})` : '')
    );
  }
  if (input.esMenor && input.acudiente) {
    const a = input.acudiente;
    partes.push(
      `Menor de edad (${input.edad} años). Acudiente: ${a.nombre} (${a.parentesco}), doc. ${a.documento}, cel. ${a.celular}`
    );
  }
  const c = input.consentimiento;
  partes.push(`Consentimiento ${c.version} (${c.medio}) otorgado ${c.otorgadoEn}`);
  return `${partes.join('. ')}.`;
}

/**
 * patientUrl / doctorUrl con los MISMOS parámetros que el botón "Crear sala" del panel
 * (frontend MedicalPanelPage.handleCrearSala). `suelta=1` solo actúa en el frontend
 * como respaldo si la historia no carga; aquí la historia ya existe.
 */
export function construirUrlsConsulta(p: {
  baseUrl: string;
  roomName: string;
  historiaId: string;
  medico: string;
  nombrePaciente: string;
  empresa: string;
  celular: string; // sin '+'
}): { patientUrl: string; doctorUrl: string; roomNameWithParams: string } {
  const base = p.baseUrl.replace(/\/+$/, '');
  const patientParams = new URLSearchParams({
    nombre: p.nombrePaciente,
    documento: p.historiaId,
    doctor: p.medico,
    empresa: p.empresa,
    suelta: '1',
  });
  const roomNameWithParams = `${p.roomName}?${patientParams.toString()}`;
  const doctorParams = new URLSearchParams({
    doctor: p.medico,
    documento: p.historiaId,
    paciente: p.nombrePaciente,
    empresa: p.empresa,
    celular: `+${p.celular}`,
    suelta: '1',
  });
  return {
    patientUrl: `${base}/patient/${roomNameWithParams}`,
    doctorUrl: `${base}/doctor/${p.roomName}?${doctorParams.toString()}`,
    roomNameWithParams,
  };
}

export type ConceptoMaluwa = 'APTO' | 'APTO_CON_RECOMENDACIONES' | 'REMISION';

/**
 * mdConceptoFinal (texto del dropdown del panel médico, o legacy) → vocabulario Maluwa360.
 *
 *   APTO                      ← apto pleno (APTO/ELEGIBLE sin restricciones ni recomendaciones;
 *                               mismo criterio que esConceptoAptoPleno).
 *   APTO_CON_RECOMENDACIONES  ← APTO... CON RECOMENDACIONES (sin restricciones), incluido
 *                               "APTO CON RECOMENDACIONES Y AJUSTES RAZONABLES...".
 *   REMISION                  ← "CONCEPTO PENDIENTE POR VALORACIÓN MÉDICA COMPLEMENTARIA" o
 *                               cualquier texto que hable de remisión.
 *   (valor crudo)             ← todo lo demás: CON RESTRICCIONES (temporales/permanentes),
 *                               RESTRICCIONES INCOMPATIBLES, NO APTO, NO PRESENTA DETERIORO, texto libre.
 */
export function mapearConceptoMaluwa(concepto: string | null | undefined): ConceptoMaluwa | string | null {
  if (!concepto || !concepto.trim()) return null;
  if (esConceptoAptoPleno(concepto)) return 'APTO';

  const c = normalizarConcepto(concepto);
  if (/REMISION|REMITID|REMITIR|\bREMITE\b/.test(c) || (c.includes('PENDIENTE') && c.includes('VALORACION'))) {
    return 'REMISION';
  }

  const empiezaApto = /^(APTO|APTA|ELEGIBLE)\b/.test(c);
  const conRecomendaciones = c.includes('RECOMENDACION') && !c.includes('SIN RECOMENDACION');
  const conRestricciones = c.includes('RESTRICCION') && !c.includes('SIN RESTRICCION');
  if (empiezaApto && conRecomendaciones && !conRestricciones) return 'APTO_CON_RECOMENDACIONES';

  return concepto.trim();
}

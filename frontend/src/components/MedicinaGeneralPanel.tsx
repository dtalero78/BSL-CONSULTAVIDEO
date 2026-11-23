import { useCallback, useEffect, useRef, useState } from 'react';
import apiService, {
  type Cie10,
  type ClaseDiagnostico,
  type ConsultaMedicinaGeneral,
  type ConsultaMedicinaGeneralPayload,
  type DiagnosticoMG,
  type IncapacidadMG,
  type ItemOrdenMG,
  type OrdenMedicinaGeneral,
  type TipoDiagnostico,
} from '../services/api.service';

// ============================================================================
// Historia de MEDICINA GENERAL (órdenes con tipoExamen 'Medicina general', hoy
// las teleconsultas de Grupo MOK / ORIONT). Reemplaza al formulario ocupacional
// dentro de MedicalHistoryPanel. Se guarda sola como borrador (PUT, 2 s después
// del último cambio y al salir de un campo) y al "Cerrar consulta" queda firmada:
// desde ahí el panel es de solo lectura (lo impone también la base de datos).
// ============================================================================

interface Props {
  historiaId: string;
  /** Alias del médico asignado a la orden (lo sabe MedicalHistoryPanel). Si falta, se escribe. */
  medicoAsignado?: string;
}

// --- Sesión con PIN: el token se guarda por médico en sessionStorage (muere al cerrar la pestaña) ---
interface SesionGuardada {
  token: string;
  medico: string;
  expira_at: string;
}

const claveSesion = (alias: string) => `mg-sesion:${alias.trim().toUpperCase()}`;

function leerSesion(alias: string | undefined): SesionGuardada | null {
  if (!alias || !alias.trim()) return null;
  try {
    const s = JSON.parse(sessionStorage.getItem(claveSesion(alias)) || 'null') as SesionGuardada | null;
    // Margen de un minuto para no mandar un token a punto de vencer.
    return s?.token && new Date(s.expira_at).getTime() > Date.now() + 60000 ? s : null;
  } catch {
    return null;
  }
}

function guardarSesion(s: SesionGuardada): void {
  try {
    sessionStorage.setItem(claveSesion(s.medico), JSON.stringify(s));
  } catch {
    /* sin almacenamiento: la sesión vive solo en memoria */
  }
}

function borrarSesion(alias: string | undefined): void {
  if (!alias) return;
  try {
    sessionStorage.removeItem(claveSesion(alias));
  } catch {
    /* nada que borrar */
  }
}

interface FilaFormula {
  medicamento: string;
  concentracion: string;
  forma: string;
  dosis: string;
  via: string;
  frecuencia: string;
  duracion_dias: string;
  cantidad: string;
  indicaciones: string;
}

interface FilaOrden {
  tipo: ItemOrdenMG['tipo'];
  descripcion: string;
  indicaciones: string;
}

interface FormIncapacidad {
  activa: boolean;
  dias: string;
  desde: string;
  origen: IncapacidadMG['origen'];
  diagnostico: string;
}

const TEXTOS = [
  'motivo_consulta',
  'enfermedad_actual',
  'antecedentes',
  'revision_sistemas',
  'examen_fisico',
  'analisis',
  'plan_manejo',
  'recomendaciones',
] as const;
type CampoTexto = (typeof TEXTOS)[number];

const SIGNOS = [
  'ta_sistolica',
  'ta_diastolica',
  'frecuencia_cardiaca',
  'frecuencia_respiratoria',
  'temperatura',
  'saturacion',
  'peso_kg',
  'talla_cm',
] as const;
type CampoSigno = (typeof SIGNOS)[number];

type Form = { [K in CampoTexto]: string } & { [K in CampoSigno]: string } & {
  diagnosticos: DiagnosticoMG[];
  formula: FilaFormula[];
  ordenes: FilaOrden[];
  incapacidad: FormIncapacidad;
};

const ETIQUETA_SIGNO: Record<CampoSigno, string> = {
  ta_sistolica: 'TA sistólica (mmHg)',
  ta_diastolica: 'TA diastólica (mmHg)',
  frecuencia_cardiaca: 'FC (lpm)',
  frecuencia_respiratoria: 'FR (rpm)',
  temperatura: 'Temperatura (°C)',
  saturacion: 'SatO₂ (%)',
  peso_kg: 'Peso (kg)',
  talla_cm: 'Talla (cm)',
};

const ETIQUETA_CLASE: Record<ClaseDiagnostico, string> = {
  impresion: 'Impresión diagnóstica',
  confirmado_nuevo: 'Confirmado nuevo',
  confirmado_repetido: 'Confirmado repetido',
};

const ETIQUETA_TIPO_ORDEN: Record<ItemOrdenMG['tipo'], string> = {
  laboratorio: 'Laboratorio',
  imagen: 'Imagen',
  remision: 'Remisión',
  otro: 'Otro',
};

const ETIQUETA_ORIGEN: Record<IncapacidadMG['origen'], string> = {
  enfermedad_general: 'Enfermedad general',
  accidente_trabajo: 'Accidente de trabajo',
  enfermedad_laboral: 'Enfermedad laboral',
};

const inputCls =
  'w-full bg-[#1f2c34] text-white text-sm px-2 py-1.5 rounded border border-gray-600 focus:border-[#00a884] focus:outline-none';
const errorCls = ' !border-red-500 ring-1 ring-red-500/40';
const seccionCls = 'bg-[#2a3942] rounded-lg p-3';
const tituloCls = 'text-sm font-semibold mb-2 text-[#00a884]';
const labelCls = 'block text-xs text-gray-400 mb-1';

// --- Fechas: siempre la fecha de Colombia, sin depender de la zona del navegador ---
const hoyColombia = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

const horaColombia = (fecha: Date = new Date()): string =>
  fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });

const fechaHoraColombia = (iso: string): string =>
  new Date(iso).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Edad en años cumplidos a partir de 'YYYY-MM-DD'. */
function calcularEdad(fechaNacimiento: string | null): number | null {
  if (!fechaNacimiento || !/^\d{4}-\d{2}-\d{2}/.test(fechaNacimiento)) return null;
  const [a, m, d] = fechaNacimiento.slice(0, 10).split('-').map(Number);
  const [ha, hm, hd] = hoyColombia().split('-').map(Number);
  let edad = ha - a;
  if (hm < m || (hm === m && hd < d)) edad -= 1;
  return edad >= 0 && edad < 130 ? edad : null;
}

/** Último día de la incapacidad (desde + días − 1). El servidor lo recalcula igual. */
function calcularHasta(desde: string, dias: string): string | null {
  const n = Number(dias);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !Number.isInteger(n) || n < 1 || n > 180) return null;
  const [a, m, d] = desde.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d) + (n - 1) * 86400000).toISOString().slice(0, 10);
}

const filaFormulaVacia = (): FilaFormula => ({
  medicamento: '',
  concentracion: '',
  forma: '',
  dosis: '',
  via: '',
  frecuencia: '',
  duracion_dias: '',
  cantidad: '',
  indicaciones: '',
});

const filaOrdenVacia = (): FilaOrden => ({ tipo: 'laboratorio', descripcion: '', indicaciones: '' });

const OBLIGATORIOS_FORMULA: Array<keyof FilaFormula> = [
  'medicamento',
  'dosis',
  'via',
  'frecuencia',
  'duracion_dias',
  'cantidad',
];

const filaVacia = (fila: object): boolean =>
  Object.entries(fila).every(([k, v]) => k === 'tipo' || String(v ?? '').trim() === '');
const formulaCompleta = (f: FilaFormula): boolean => OBLIGATORIOS_FORMULA.every((k) => f[k].trim() !== '');
const ordenCompleta = (o: FilaOrden): boolean => o.descripcion.trim() !== '';
const incapacidadCompleta = (i: FormIncapacidad): boolean =>
  calcularHasta(i.desde, i.dias) !== null && i.diagnostico !== '';

function formDesde(orden: OrdenMedicinaGeneral, consulta: ConsultaMedicinaGeneral | null): Form {
  const texto = (k: CampoTexto): string => (consulta?.[k] ?? '') as string;
  const signo = (k: CampoSigno): string => (consulta?.[k] == null ? '' : String(consulta[k]));
  const form = {} as Form;
  for (const k of TEXTOS) form[k] = texto(k);
  for (const k of SIGNOS) form[k] = signo(k);
  // Sin borrador todavía: el motivo viene de la orden (lo escribió el paciente al agendar).
  if (!consulta) form.motivo_consulta = orden.motivoConsulta || '';
  form.diagnosticos = consulta?.diagnosticos ?? [];
  form.formula = (consulta?.formula ?? []).map((f) => ({
    medicamento: f.medicamento ?? '',
    concentracion: f.concentracion ?? '',
    forma: f.forma ?? '',
    dosis: f.dosis ?? '',
    via: f.via ?? '',
    frecuencia: f.frecuencia ?? '',
    duracion_dias: f.duracion_dias == null ? '' : String(f.duracion_dias),
    cantidad: f.cantidad ?? '',
    indicaciones: f.indicaciones ?? '',
  }));
  form.ordenes = (consulta?.ordenes ?? []).map((o) => ({
    tipo: o.tipo,
    descripcion: o.descripcion ?? '',
    indicaciones: o.indicaciones ?? '',
  }));
  const inc = consulta?.incapacidad;
  form.incapacidad = inc
    ? { activa: true, dias: String(inc.dias), desde: inc.desde, origen: inc.origen, diagnostico: inc.diagnostico }
    : { activa: false, dias: '', desde: hoyColombia(), origen: 'enfermedad_general', diagnostico: '' };
  return form;
}

// Rangos de los CHECK de la migración (el servidor valida lo mismo).
const RANGO_SIGNO: Record<CampoSigno, { min: number; max: number; entero: boolean }> = {
  ta_sistolica: { min: 40, max: 300, entero: true },
  ta_diastolica: { min: 20, max: 200, entero: true },
  frecuencia_cardiaca: { min: 20, max: 250, entero: true },
  frecuencia_respiratoria: { min: 4, max: 80, entero: true },
  temperatura: { min: 30, max: 45, entero: false },
  saturacion: { min: 50, max: 100, entero: true },
  peso_kg: { min: 0.5, max: 400, entero: false },
  talla_cm: { min: 30, max: 250, entero: false },
};

/** Vacío cuenta como válido (los signos son opcionales). */
function signoValido(k: CampoSigno, valor: string): boolean {
  const v = valor.trim().replace(',', '.');
  if (v === '') return true;
  if (!/^\d+(\.\d+)?$/.test(v)) return false;
  const n = Number(v);
  const r = RANGO_SIGNO[k];
  return (!r.entero || Number.isInteger(n)) && n >= r.min && n <= r.max;
}

const duracionValida = (v: string): boolean => /^\d+$/.test(v.trim()) && Number(v) >= 1 && Number(v) <= 365;

/** Posición en pantalla de cada fila enviada (el servidor numera sobre lo enviado). */
interface MapaFilas {
  formula: number[];
  ordenes: number[];
}

/**
 * Cuerpo para el servidor. En el borrador (estricto = false) no se mandan las filas a
 * medio llenar ni los valores inválidos (signos fuera de rango, duración no válida), para
 * que un solo campo mal escrito no impida guardar todo lo demás; al cerrar se manda todo
 * y el servidor exige que esté completo y correcto.
 */
function construirPayload(
  f: Form,
  medico: string | null,
  estricto: boolean
): { payload: ConsultaMedicinaGeneralPayload; mapa: MapaFilas } {
  const payload = { medico } as ConsultaMedicinaGeneralPayload;
  for (const k of TEXTOS) payload[k] = f[k];
  for (const k of SIGNOS) {
    const v = f[k].trim();
    payload[k] = v === '' || (!estricto && !signoValido(k, v)) ? null : v;
  }
  payload.diagnosticos = f.diagnosticos.map(({ codigo, tipo, clase }) => ({ codigo, tipo, clase }));

  const mapa: MapaFilas = { formula: [], ordenes: [] };
  payload.formula = [];
  f.formula.forEach((r, i) => {
    if (filaVacia(r) || (!estricto && !(formulaCompleta(r) && duracionValida(r.duracion_dias)))) return;
    mapa.formula.push(i);
    payload.formula.push({
      ...r,
      concentracion: r.concentracion || null,
      forma: r.forma || null,
      indicaciones: r.indicaciones || null,
    });
  });
  payload.ordenes = [];
  f.ordenes.forEach((r, i) => {
    if (filaVacia(r) || (!estricto && !ordenCompleta(r))) return;
    mapa.ordenes.push(i);
    payload.ordenes.push({ ...r, indicaciones: r.indicaciones || null });
  });
  const inc = f.incapacidad;
  payload.incapacidad =
    inc.activa && (estricto || incapacidadCompleta(inc))
      ? { dias: inc.dias, desde: inc.desde, origen: inc.origen, diagnostico: inc.diagnostico }
      : null;
  return { payload, mapa };
}

/** 'formula[0].dosis' del servidor → índice de la fila en pantalla. */
function campoEnPantalla(campo: string | undefined, mapa: MapaFilas): string | undefined {
  if (!campo) return campo;
  return campo.replace(/^(formula|ordenes)\[(\d+)\]/, (todo, grupo: 'formula' | 'ordenes', i: string) => {
    const real = mapa[grupo][Number(i)];
    return real === undefined ? todo : `${grupo}[${real}]`;
  });
}

type EstadoGuardado =
  | { tipo: 'nada' }
  | { tipo: 'guardando' }
  | { tipo: 'guardado'; hora: string }
  | { tipo: 'error'; mensaje: string; campo?: string };

const NOMBRE_CAMPO: Record<string, string> = {
  motivo_consulta: 'motivo de consulta',
  enfermedad_actual: 'enfermedad actual',
  revision_sistemas: 'revisión por sistemas',
  examen_fisico: 'examen físico',
  analisis: 'análisis',
  plan_manejo: 'plan de manejo',
  duracion_dias: 'duración (días)',
  via: 'vía',
  descripcion: 'descripción',
  concentracion: 'concentración',
  dias: 'días',
  diagnostico: 'diagnóstico',
  ...ETIQUETA_SIGNO,
};

/** 'formula[0].dosis' → 'Fórmula, medicamento 1: dosis' (para que el médico entienda el error). */
function nombreLegible(campo: string): string {
  const m = /^(formula|ordenes|diagnosticos)\[(\d+)\]\.(\w+)$/.exec(campo);
  if (m) {
    const grupo = { formula: 'Fórmula, medicamento', ordenes: 'Órdenes, fila', diagnosticos: 'Diagnóstico' }[m[1]];
    return `${grupo} ${Number(m[2]) + 1}: ${NOMBRE_CAMPO[m[3]] ?? m[3]}`;
  }
  const inc = /^incapacidad\.(\w+)$/.exec(campo);
  if (inc) return `Incapacidad: ${NOMBRE_CAMPO[inc[1]] ?? inc[1]}`;
  return NOMBRE_CAMPO[campo] ?? campo;
}

function leerError(
  err: any,
  porDefecto: string,
  mapa: MapaFilas = { formula: [], ordenes: [] }
): { mensaje: string; campo?: string; status?: number; sinSesion: boolean } {
  const data = err?.response?.data;
  const crudo: string = (data && typeof data.error === 'string' && data.error) || porDefecto;
  const campoServidor: string | undefined = typeof data?.campo === 'string' ? data.campo : undefined;
  const campo = campoEnPantalla(campoServidor, mapa);
  return {
    mensaje:
      campoServidor && campo
        ? crudo.replace(`El campo ${campoServidor}`, `El campo «${nombreLegible(campo)}»`)
        : crudo,
    campo,
    status: err?.response?.status,
    // La sesión no existe o venció: hay que volver a pedir el PIN.
    sinSesion: err?.response?.status === 401 && data?.codigo === 'SESION_REQUERIDA',
  };
}

export const MedicinaGeneralPanel = ({ historiaId, medicoAsignado }: Props) => {
  const [sesion, setSesion] = useState<SesionGuardada | null>(() => leerSesion(medicoAsignado));
  const tokenRef = useRef<string | null>(sesion?.token ?? null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [orden, setOrden] = useState<OrdenMedicinaGeneral | null>(null);
  const [consultaCerrada, setConsultaCerrada] = useState<ConsultaMedicinaGeneral | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [estado, setEstado] = useState<EstadoGuardado>({ tipo: 'nada' });
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [errorCierre, setErrorCierre] = useState<{ mensaje: string; campo?: string } | null>(null);

  // Refs para el autoguardado: el temporizador y las promesas leen siempre lo último.
  const formRef = useRef<Form | null>(null);
  const ordenRef = useRef<OrdenMedicinaGeneral | null>(null);
  const sucioRef = useRef(false);
  const guardandoRef = useRef(false);
  const pendienteRef = useRef(false);
  const cerradaRef = useRef(false);
  // Mientras se cierra, el formulario no acepta cambios: lo escrito después no iría en el cierre.
  const cerrandoRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sesionRef = useRef<SesionGuardada | null>(sesion);

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      setErrorCarga(null);
      if (!tokenRef.current) return;
      const { orden: o, consulta } = await apiService.getMedicinaGeneral(historiaId, tokenRef.current);
      setOrden(o);
      ordenRef.current = o;
      const f = formDesde(o, consulta);
      setForm(f);
      formRef.current = f;
      sucioRef.current = false;
      cerradaRef.current = Boolean(consulta?.cerrada_at);
      setConsultaCerrada(consulta?.cerrada_at ? consulta : null);
    } catch (err) {
      const e = leerError(err, 'No se pudo cargar la consulta de medicina general');
      if (e.sinSesion) perderSesion();
      else setErrorCarga(e.mensaje);
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historiaId]);

  /** El token ya no sirve: se pide el PIN otra vez. Lo escrito sigue en memoria (formRef). */
  function perderSesion() {
    borrarSesion(sesionRef.current?.medico);
    tokenRef.current = null;
    sesionRef.current = null;
    setSesion(null);
  }

  const guardar = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!sucioRef.current || cerradaRef.current || cerrandoRef.current || !formRef.current || !tokenRef.current) return;
    if (guardandoRef.current) {
      pendienteRef.current = true;
      return;
    }
    guardandoRef.current = true;
    sucioRef.current = false;
    setEstado({ tipo: 'guardando' });
    const { payload, mapa } = construirPayload(formRef.current, ordenRef.current?.medico ?? null, false);
    try {
      await apiService.guardarMedicinaGeneral(historiaId, payload, tokenRef.current);
      setEstado({ tipo: 'guardado', hora: horaColombia() });
    } catch (err) {
      sucioRef.current = true;
      const e = leerError(err, 'No se pudo guardar el borrador', mapa);
      if (e.sinSesion) {
        // Se guarda apenas el médico vuelva a ingresar el PIN (sucioRef sigue en true).
        setEstado({ tipo: 'error', mensaje: 'La sesión venció: ingresa tu PIN para seguir guardando' });
        perderSesion();
        return;
      }
      setEstado({ tipo: 'error', mensaje: e.mensaje, campo: e.campo });
      // 409: la consulta ya quedó cerrada (otra pestaña): se recarga en solo lectura.
      if (e.status === 409) {
        sucioRef.current = false;
        void cargar();
      }
    } finally {
      guardandoRef.current = false;
      if (pendienteRef.current) {
        pendienteRef.current = false;
        void guardar();
      }
    }
  }, [historiaId, cargar]);

  // Sin sesión no se carga nada: se muestra el ingreso con PIN.
  useEffect(() => {
    if (tokenRef.current) void cargar();
    else setCargando(false);
  }, [cargar]);

  /** Tras ingresar el PIN: si la consulta ya estaba en pantalla se reintenta lo pendiente; si no, se carga. */
  const alIniciarSesion = (s: SesionGuardada) => {
    guardarSesion(s);
    tokenRef.current = s.token;
    sesionRef.current = s;
    setSesion(s);
    if (formRef.current) {
      if (sucioRef.current) void guardar();
    } else {
      void cargar();
    }
  };

  // Al desmontar (fin de la llamada, cambio de paciente) se guarda lo pendiente.
  useEffect(
    () => () => {
      if (sucioRef.current) void guardar();
    },
    [guardar]
  );

  /** Toda edición pasa por aquí: actualiza el formulario y programa el autoguardado. */
  const editar = (fn: (f: Form) => Form) => {
    if (cerradaRef.current || cerrandoRef.current || !formRef.current) return;
    const nuevo = fn(formRef.current);
    formRef.current = nuevo;
    setForm(nuevo);
    sucioRef.current = true;
    setErrorCierre(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void guardar(), 2000);
  };

  const alSalirDeCampo = () => {
    if (sucioRef.current) void guardar();
  };

  const cerrarConsulta = async () => {
    if (!formRef.current || cerrandoRef.current || !tokenRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    cerrandoRef.current = true;
    setCerrando(true);
    setErrorCierre(null);
    // Si hay un borrador en camino, se espera a que termine (hasta 10 s): así no llega después del
    // cierre con un "ya está cerrada" que confunde. El cierre manda todo el formulario de todos modos.
    pendienteRef.current = false;
    for (let i = 0; i < 50 && guardandoRef.current; i++) {
      await new Promise((r) => setTimeout(r, 200));
    }
    sucioRef.current = false;
    const { payload, mapa } = construirPayload(formRef.current, ordenRef.current?.medico ?? null, true);
    try {
      const consulta = await apiService.cerrarMedicinaGeneral(historiaId, payload, tokenRef.current);
      cerradaRef.current = true;
      sucioRef.current = false;
      setConsultaCerrada(consulta);
      setConfirmandoCierre(false);
    } catch (err) {
      const e = leerError(err, 'No se pudo cerrar la consulta', mapa);
      sucioRef.current = true; // no se cerró: lo escrito sigue pendiente de guardar
      if (e.sinSesion) {
        setErrorCierre({ mensaje: 'La sesión venció. Ingresa tu PIN y vuelve a cerrar la consulta.' });
        setConfirmandoCierre(false);
        perderSesion();
        return;
      }
      setErrorCierre({ mensaje: e.mensaje, campo: e.campo });
      setConfirmandoCierre(false);
      if (e.status === 409) void cargar();
    } finally {
      cerrandoRef.current = false;
      setCerrando(false);
    }
  };

  // ---------------------------------------------------------------------------
  if (!sesion) {
    return (
      <IngresoPin
        medicoAsignado={medicoAsignado || orden?.medico || undefined}
        aviso={formRef.current ? 'Tu sesión venció. Lo que escribiste sigue aquí y se guarda al ingresar.' : undefined}
        onIngreso={alIniciarSesion}
      />
    );
  }

  if (cargando) {
    return (
      <div className="bg-[#1f2c34] rounded-xl p-6 text-white">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00a884]"></div>
          <span className="ml-3">Cargando consulta de medicina general...</span>
        </div>
      </div>
    );
  }

  if (errorCarga || !orden || !form) {
    return (
      <div className="h-full flex flex-col bg-[#1f2c34] text-white p-6">
        <h2 className="text-xl font-bold text-red-400 mb-4">Error al cargar la consulta</h2>
        <div className="bg-[#2a3942] rounded-lg p-4">
          <p className="text-red-400 mb-3">{errorCarga || 'No se encontró la orden'}</p>
          <div className="flex gap-2">
            <button
              onClick={() => void cargar()}
              className="px-3 py-2 bg-[#00a884] text-white text-sm rounded-lg hover:bg-[#008f6f] transition"
            >
              Reintentar
            </button>
            <button
              onClick={() => {
                setErrorCarga(null);
                perderSesion();
              }}
              className="px-3 py-2 bg-[#1f2c34] text-gray-200 text-sm rounded-lg hover:bg-[#33444f] transition"
            >
              Ingresar con otro médico
            </button>
          </div>
        </div>
      </div>
    );
  }

  const nombre = [orden.primerNombre, orden.segundoNombre, orden.primerApellido, orden.segundoApellido]
    .filter(Boolean)
    .join(' ');
  const edad = calcularEdad(orden.fecha_nacimiento);
  const empresa =
    (orden.codEmpresa || '').trim().toUpperCase() === 'MOK' ? 'ORIONT' : orden.empresa || orden.codEmpresa || '';

  const encabezado = (
    <div className="p-4 border-b border-gray-700 bg-[#1f2c34] sticky top-0 z-10">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-[#00a884]">Medicina General</h2>
        {empresa && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-900/40 text-blue-200 border border-blue-500/40">
            {empresa}
          </span>
        )}
      </div>
      <div className="mt-1 text-sm text-white font-medium">{nombre || 'Paciente'}</div>
      <div className="text-xs text-gray-400">
        {orden.tipoDocumento || 'CC'} {orden.numeroId}
        {edad !== null && ` · ${edad} años`}
        {orden.genero_biologico && ` · ${orden.genero_biologico}`}
      </div>
    </div>
  );

  if (consultaCerrada) {
    return (
      <div className="h-full flex flex-col bg-[#1f2c34] text-white">
        {encabezado}
        <ConsultaSoloLectura consulta={consultaCerrada} />
      </div>
    );
  }

  // --- Edición ---
  const campoError = estado.tipo === 'error' ? estado.campo : errorCierre?.campo;
  const conError = (campo: string): string =>
    campoError && (campoError === campo || campoError.startsWith(`${campo}[`) || campoError.startsWith(`${campo}.`))
      ? errorCls
      : '';

  const imc = (() => {
    const p = Number(form.peso_kg.replace(',', '.'));
    const t = Number(form.talla_cm.replace(',', '.')) / 100;
    if (!form.peso_kg || !form.talla_cm || !(p > 0) || !(t > 0)) return null;
    return p / (t * t);
  })();

  const signosInvalidos = SIGNOS.filter((k) => !signoValido(k, form[k]));
  const hayFilasIncompletas =
    form.formula.some((r) => !filaVacia(r) && !(formulaCompleta(r) && duracionValida(r.duracion_dias))) ||
    form.ordenes.some((r) => !filaVacia(r) && !ordenCompleta(r)) ||
    (form.incapacidad.activa && !incapacidadCompleta(form.incapacidad));

  const areaTexto = (campo: CampoTexto, etiqueta: string, opciones: { obligatorio?: boolean; filas?: number; placeholder?: string } = {}) => (
    <div className={seccionCls}>
      <label className={tituloCls + ' block'}>
        {etiqueta}
        {opciones.obligatorio && <span className="text-red-500"> *</span>}
      </label>
      <textarea
        value={form[campo]}
        onChange={(e) => {
          const v = e.target.value;
          editar((f) => ({ ...f, [campo]: v }));
        }}
        rows={opciones.filas ?? 3}
        placeholder={opciones.placeholder}
        className={inputCls + ' resize-y' + conError(campo)}
      />
    </div>
  );

  const hasta = calcularHasta(form.incapacidad.desde, form.incapacidad.dias);

  return (
    <div className="h-full flex flex-col bg-[#1f2c34] text-white">
      {encabezado}

      <div className="flex-1 overflow-y-auto p-4 space-y-3" onBlur={alSalirDeCampo}>
        {areaTexto('motivo_consulta', 'Motivo de consulta', { obligatorio: true, filas: 2 })}
        {areaTexto('enfermedad_actual', 'Enfermedad actual', { obligatorio: true, filas: 4 })}
        {areaTexto('antecedentes', 'Antecedentes', { obligatorio: true, placeholder: 'Personales, familiares, alergias, medicamentos...' })}
        {areaTexto('revision_sistemas', 'Revisión por sistemas', { obligatorio: true })}

        {/* Signos vitales */}
        <div className={seccionCls}>
          <h3 className={tituloCls + ' mb-0'}>Signos vitales</h3>
          <p className="text-[11px] text-gray-400 mb-2">Opcionales · reportados por el paciente</p>
          <div className="grid grid-cols-2 gap-2">
            {SIGNOS.map((k) => (
              <div key={k}>
                <label className={labelCls}>{ETIQUETA_SIGNO[k]}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form[k]}
                  onChange={(e) => {
                    const v = e.target.value;
                    editar((f) => ({ ...f, [k]: v }));
                  }}
                  className={inputCls + (signosInvalidos.includes(k) ? errorCls : conError(k))}
                />
              </div>
            ))}
            <div className="col-span-2">
              <label className={labelCls}>IMC (calculado)</label>
              <div className="text-sm px-2 py-1.5 rounded border border-gray-700 bg-[#2a3942] text-gray-200">
                {imc !== null && Number.isFinite(imc) ? imc.toFixed(1) : '—'}
              </div>
            </div>
          </div>
        </div>

        {areaTexto('examen_fisico', 'Examen físico', { obligatorio: true, filas: 4 })}

        {/* Diagnósticos CIE-10 */}
        <div className={seccionCls + conError('diagnosticos')}>
          <h3 className={tituloCls}>
            Diagnósticos CIE-10 <span className="text-red-500">*</span>
          </h3>
          <BuscadorCie10
            yaElegidos={form.diagnosticos.map((d) => d.codigo)}
            deshabilitado={form.diagnosticos.length >= 10}
            onElegir={(c) =>
              editar((f) => ({
                ...f,
                diagnosticos: [
                  ...f.diagnosticos,
                  {
                    codigo: c.codigo,
                    descripcion: c.descripcion,
                    tipo: f.diagnosticos.some((d) => d.tipo === 'principal') ? 'relacionado' : 'principal',
                    clase: 'impresion',
                  },
                ],
              }))
            }
          />
          <div className="mt-2 space-y-2">
            {form.diagnosticos.length === 0 && (
              <p className="text-xs text-gray-500">Busca por código (J02) o por nombre (faringitis).</p>
            )}
            {form.diagnosticos.map((d, i) => (
              <div key={d.codigo} className={'bg-[#1f2c34] rounded-lg p-2 border border-gray-700' + conError(`diagnosticos[${i}]`)}>
                <div className="flex items-start gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-[#00a884]/20 text-[#7fe7cd] text-xs font-mono font-bold">
                    {d.codigo}
                  </span>
                  <span className="flex-1 text-xs text-gray-200">{d.descripcion}</span>
                  <button
                    onClick={() =>
                      editar((f) => {
                        const diagnosticos = f.diagnosticos.filter((x) => x.codigo !== d.codigo);
                        const incapacidad =
                          f.incapacidad.diagnostico === d.codigo ? { ...f.incapacidad, diagnostico: '' } : f.incapacidad;
                        return { ...f, diagnosticos, incapacidad };
                      })
                    }
                    className="text-gray-400 hover:text-red-400 text-sm leading-none px-1"
                    title="Quitar diagnóstico"
                  >
                    ✕
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <select
                    value={d.tipo}
                    onChange={(e) => {
                      const tipo = e.target.value as TipoDiagnostico;
                      editar((f) => ({
                        ...f,
                        // Solo un principal: si este pasa a principal, el anterior queda relacionado.
                        diagnosticos: f.diagnosticos.map((x) =>
                          x.codigo === d.codigo
                            ? { ...x, tipo }
                            : tipo === 'principal' && x.tipo === 'principal'
                              ? { ...x, tipo: 'relacionado' }
                              : x
                        ),
                      }));
                    }}
                    className={inputCls + ' text-xs'}
                  >
                    <option value="principal">Principal</option>
                    <option value="relacionado">Relacionado</option>
                  </select>
                  <select
                    value={d.clase}
                    onChange={(e) => {
                      const clase = e.target.value as ClaseDiagnostico;
                      editar((f) => ({
                        ...f,
                        diagnosticos: f.diagnosticos.map((x) => (x.codigo === d.codigo ? { ...x, clase } : x)),
                      }));
                    }}
                    className={inputCls + ' text-xs'}
                  >
                    {(Object.keys(ETIQUETA_CLASE) as ClaseDiagnostico[]).map((c) => (
                      <option key={c} value={c}>
                        {ETIQUETA_CLASE[c]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>

        {areaTexto('analisis', 'Análisis')}
        {areaTexto('plan_manejo', 'Plan de manejo', { obligatorio: true })}
        {areaTexto('recomendaciones', 'Recomendaciones')}

        {/* Fórmula médica */}
        <div className={seccionCls + conError('formula')}>
          <h3 className={tituloCls}>Fórmula médica</h3>
          <div className="space-y-2">
            {form.formula.map((fila, i) => {
              const set = (campo: keyof FilaFormula, v: string) =>
                editar((f) => ({ ...f, formula: f.formula.map((r, j) => (j === i ? { ...r, [campo]: v } : r)) }));
              const input = (campo: keyof FilaFormula, placeholder: string, extra = '') => (
                <input
                  value={fila[campo]}
                  onChange={(e) => set(campo, e.target.value)}
                  placeholder={placeholder}
                  className={inputCls + ' text-xs ' + extra + conError(`formula[${i}].${campo}`)}
                />
              );
              return (
                <div key={i} className="bg-[#1f2c34] rounded-lg p-2 border border-gray-700 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">#{i + 1}</span>
                    {input('medicamento', 'Medicamento *', 'flex-1')}
                    <button
                      onClick={() => editar((f) => ({ ...f, formula: f.formula.filter((_, j) => j !== i) }))}
                      className="text-gray-400 hover:text-red-400 text-sm px-1"
                      title="Quitar medicamento"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {input('concentracion', 'Concentración')}
                    {input('forma', 'Forma farmacéutica')}
                    {input('dosis', 'Dosis *')}
                    {input('via', 'Vía *')}
                    {input('frecuencia', 'Frecuencia *')}
                    {input('duracion_dias', 'Duración (días) *')}
                    {input('cantidad', 'Cantidad total *', 'col-span-2')}
                  </div>
                  {input('indicaciones', 'Indicaciones')}
                </div>
              );
            })}
          </div>
          <button
            onClick={() =>
              form.formula.length < 20 && editar((f) => ({ ...f, formula: [...f.formula, filaFormulaVacia()] }))
            }
            disabled={form.formula.length >= 20}
            className="mt-2 text-xs px-3 py-1.5 rounded bg-[#1f2c34] text-[#00a884] border border-[#00a884]/50 hover:bg-[#00a884]/10 disabled:opacity-40"
          >
            + Agregar medicamento
          </button>
        </div>

        {/* Órdenes: exámenes y remisiones */}
        <div className={seccionCls + conError('ordenes')}>
          <h3 className={tituloCls}>Órdenes (exámenes y remisiones)</h3>
          <div className="space-y-2">
            {form.ordenes.map((fila, i) => (
              <div key={i} className="bg-[#1f2c34] rounded-lg p-2 border border-gray-700 space-y-1.5">
                <div className="flex items-center gap-2">
                  <select
                    value={fila.tipo}
                    onChange={(e) => {
                      const tipo = e.target.value as FilaOrden['tipo'];
                      editar((f) => ({ ...f, ordenes: f.ordenes.map((r, j) => (j === i ? { ...r, tipo } : r)) }));
                    }}
                    className={inputCls + ' text-xs w-32 flex-none'}
                  >
                    {(Object.keys(ETIQUETA_TIPO_ORDEN) as FilaOrden['tipo'][]).map((t) => (
                      <option key={t} value={t}>
                        {ETIQUETA_TIPO_ORDEN[t]}
                      </option>
                    ))}
                  </select>
                  <input
                    value={fila.descripcion}
                    onChange={(e) => {
                      const v = e.target.value;
                      editar((f) => ({ ...f, ordenes: f.ordenes.map((r, j) => (j === i ? { ...r, descripcion: v } : r)) }));
                    }}
                    placeholder="Descripción *"
                    className={inputCls + ' text-xs flex-1' + conError(`ordenes[${i}].descripcion`)}
                  />
                  <button
                    onClick={() => editar((f) => ({ ...f, ordenes: f.ordenes.filter((_, j) => j !== i) }))}
                    className="text-gray-400 hover:text-red-400 text-sm px-1"
                    title="Quitar orden"
                  >
                    ✕
                  </button>
                </div>
                <input
                  value={fila.indicaciones}
                  onChange={(e) => {
                    const v = e.target.value;
                    editar((f) => ({ ...f, ordenes: f.ordenes.map((r, j) => (j === i ? { ...r, indicaciones: v } : r)) }));
                  }}
                  placeholder="Indicaciones"
                  className={inputCls + ' text-xs'}
                />
              </div>
            ))}
          </div>
          <button
            onClick={() =>
              form.ordenes.length < 20 && editar((f) => ({ ...f, ordenes: [...f.ordenes, filaOrdenVacia()] }))
            }
            disabled={form.ordenes.length >= 20}
            className="mt-2 text-xs px-3 py-1.5 rounded bg-[#1f2c34] text-[#00a884] border border-[#00a884]/50 hover:bg-[#00a884]/10 disabled:opacity-40"
          >
            + Agregar orden
          </button>
        </div>

        {/* Incapacidad */}
        <div className={seccionCls + conError('incapacidad')}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.incapacidad.activa}
              onChange={(e) => {
                const activa = e.target.checked;
                editar((f) => ({ ...f, incapacidad: { ...f.incapacidad, activa } }));
              }}
              className="accent-[#00a884]"
            />
            <span className="text-sm font-semibold text-[#00a884]">Incapacidad</span>
          </label>
          {form.incapacidad.activa && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className={labelCls}>Días (1–180)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.incapacidad.dias}
                  onChange={(e) => {
                    const dias = e.target.value;
                    editar((f) => ({ ...f, incapacidad: { ...f.incapacidad, dias } }));
                  }}
                  className={inputCls + conError('incapacidad.dias')}
                />
              </div>
              <div>
                <label className={labelCls}>Desde</label>
                <input
                  type="date"
                  value={form.incapacidad.desde}
                  onChange={(e) => {
                    const desde = e.target.value;
                    editar((f) => ({ ...f, incapacidad: { ...f.incapacidad, desde } }));
                  }}
                  className={inputCls + ' [color-scheme:dark]' + conError('incapacidad.desde')}
                />
              </div>
              <div className="col-span-2 text-xs text-gray-300">
                Hasta: <span className="font-semibold text-white">{hasta ?? '—'}</span>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Origen</label>
                <select
                  value={form.incapacidad.origen}
                  onChange={(e) => {
                    const origen = e.target.value as IncapacidadMG['origen'];
                    editar((f) => ({ ...f, incapacidad: { ...f.incapacidad, origen } }));
                  }}
                  className={inputCls}
                >
                  {(Object.keys(ETIQUETA_ORIGEN) as IncapacidadMG['origen'][]).map((o) => (
                    <option key={o} value={o}>
                      {ETIQUETA_ORIGEN[o]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Diagnóstico</label>
                <select
                  value={form.incapacidad.diagnostico}
                  onChange={(e) => {
                    const diagnostico = e.target.value;
                    editar((f) => ({ ...f, incapacidad: { ...f.incapacidad, diagnostico } }));
                  }}
                  className={inputCls + conError('incapacidad.diagnostico')}
                >
                  <option value="">
                    {form.diagnosticos.length ? 'Seleccione un diagnóstico' : 'Primero agregue un diagnóstico'}
                  </option>
                  {form.diagnosticos.map((d) => (
                    <option key={d.codigo} value={d.codigo}>
                      {d.codigo} · {d.descripcion}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pie fijo: estado del guardado + cerrar consulta */}
      <div className="border-t border-gray-700 p-3 bg-[#1f2c34] space-y-2">
        <div className="text-xs min-h-[1rem]">
          {estado.tipo === 'guardando' && <span className="text-gray-400">Guardando…</span>}
          {estado.tipo === 'guardado' && <span className="text-[#7fe7cd]">Guardado {estado.hora}</span>}
          {estado.tipo === 'error' && <span className="text-red-400">No se guardó: {estado.mensaje}</span>}
          {signosInvalidos.length > 0 && (
            <span className="block text-amber-300 mt-0.5">
              Signos vitales fuera de rango (no se guardan hasta corregirlos):{' '}
              {signosInvalidos.map((k) => ETIQUETA_SIGNO[k]).join(', ')}.
            </span>
          )}
          {hayFilasIncompletas && (
            <span className="block text-amber-300 mt-0.5">
              Hay filas incompletas (fórmula, órdenes o incapacidad) que se guardarán al completarlas.
            </span>
          )}
        </div>
        {errorCierre && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-2 text-red-300 text-xs">
            {errorCierre.mensaje}
          </div>
        )}
        {confirmandoCierre ? (
          <div className="bg-amber-500/10 border border-amber-500/50 rounded-lg p-3 space-y-2">
            <p className="text-amber-200 text-xs">
              Al cerrar, la historia queda firmada y no se puede modificar.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => void cerrarConsulta()}
                disabled={cerrando}
                className="flex-1 bg-[#00a884] text-white px-3 py-2 rounded-lg hover:bg-[#008f6f] transition font-semibold text-sm disabled:bg-gray-600"
              >
                {cerrando ? 'Cerrando…' : 'Confirmar y cerrar'}
              </button>
              <button
                onClick={() => setConfirmandoCierre(false)}
                disabled={cerrando}
                className="px-3 py-2 rounded-lg bg-[#2a3942] text-gray-200 hover:bg-[#33444f] text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmandoCierre(true)}
            className="w-full bg-[#00a884] text-white px-6 py-3 rounded-lg hover:bg-[#008f6f] transition font-semibold shadow-lg"
          >
            Cerrar consulta
          </button>
        )}
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// Ingreso del médico con su PIN de 6 dígitos (sesión de 12 horas).
// ----------------------------------------------------------------------------
function IngresoPin({
  medicoAsignado,
  aviso,
  onIngreso,
}: {
  medicoAsignado?: string;
  aviso?: string;
  onIngreso: (s: SesionGuardada) => void;
}) {
  const [medico, setMedico] = useState(medicoAsignado?.trim() || '');
  const [pin, setPin] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ingresar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!medico.trim() || !/^\d{6}$/.test(pin) || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const s = await apiService.iniciarSesionMedicinaGeneral(medico.trim(), pin);
      onIngreso(s);
    } catch (err: any) {
      const status = err?.response?.status;
      setError(
        status === 429
          ? 'PIN bloqueado 15 minutos por intentos fallidos. Intenta más tarde.'
          : status === 401
            ? 'Médico o PIN incorrectos'
            : err?.response?.data?.error || 'No se pudo ingresar. Revisa la conexión e intenta de nuevo.'
      );
      setPin('');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#1f2c34] text-white">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-bold text-[#00a884]">Medicina General</h2>
        <p className="text-xs text-gray-400">Ingresa con tu PIN para ver y firmar la consulta.</p>
      </div>
      <form onSubmit={ingresar} className="p-4 space-y-3">
        {aviso && (
          <div className="bg-amber-500/10 border border-amber-500/50 rounded-lg p-2 text-amber-200 text-xs">{aviso}</div>
        )}
        <div>
          <label className={labelCls}>Médico</label>
          <input
            value={medico}
            onChange={(e) => setMedico(e.target.value)}
            readOnly={Boolean(medicoAsignado?.trim())}
            placeholder="Tu código de médico"
            autoComplete="username"
            className={inputCls + (medicoAsignado?.trim() ? ' bg-[#2a3942] text-gray-300 cursor-not-allowed' : '')}
          />
        </div>
        <div>
          <label className={labelCls}>PIN (6 dígitos)</label>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            autoFocus
            className={inputCls + ' tracking-[0.5em] text-center text-lg'}
          />
        </div>
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-2 text-red-300 text-xs">{error}</div>
        )}
        <button
          type="submit"
          disabled={enviando || !medico.trim() || pin.length !== 6}
          className="w-full bg-[#00a884] text-white px-4 py-2.5 rounded-lg hover:bg-[#008f6f] transition font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Typeahead CIE-10 (250 ms de espera tras la última tecla).
// ----------------------------------------------------------------------------
function BuscadorCie10({
  yaElegidos,
  deshabilitado,
  onElegir,
}: {
  yaElegidos: string[];
  deshabilitado: boolean;
  onElegir: (c: Cie10) => void;
}) {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<Cie10[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const ultimaRef = useRef(0);

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    const id = ++ultimaRef.current;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const r = await apiService.buscarCie10(texto);
        // Solo vale la respuesta de la última búsqueda (las anteriores pueden llegar tarde).
        if (id === ultimaRef.current) {
          setResultados(r);
          setError(null);
        }
      } catch {
        if (id === ultimaRef.current) setError('No se pudo buscar en el CIE-10');
      } finally {
        if (id === ultimaRef.current) setBuscando(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const visibles = resultados.filter((r) => !yaElegidos.includes(r.codigo));

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        disabled={deshabilitado}
        placeholder={deshabilitado ? 'Máximo 10 diagnósticos' : 'Buscar CIE-10 por código o nombre…'}
        className={inputCls}
      />
      {abierto && q.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-[#1f2c34] border border-gray-600 rounded-lg shadow-xl">
          {buscando && <div className="px-3 py-2 text-xs text-gray-400">Buscando…</div>}
          {error && <div className="px-3 py-2 text-xs text-red-400">{error}</div>}
          {!buscando && !error && visibles.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400">Sin resultados</div>
          )}
          {!buscando &&
            visibles.map((r) => (
              <button
                key={r.codigo}
                // onMouseDown: elige antes de que el blur del input cierre la lista.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onElegir(r);
                  setQ('');
                  setResultados([]);
                  setAbierto(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#2a3942] flex gap-2 items-start"
              >
                <span className="text-xs font-mono font-bold text-[#7fe7cd] w-12 flex-none">{r.codigo}</span>
                <span className="text-xs text-gray-200">{r.descripcion}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Vista de solo lectura de la consulta cerrada.
// ----------------------------------------------------------------------------
function ConsultaSoloLectura({ consulta }: { consulta: ConsultaMedicinaGeneral }) {
  const texto = (titulo: string, valor: string | null) =>
    valor ? (
      <div className={seccionCls}>
        <h3 className={tituloCls}>{titulo}</h3>
        <p className="text-xs text-gray-200 whitespace-pre-wrap">{valor}</p>
      </div>
    ) : null;

  const signos = SIGNOS.filter((k) => consulta[k] != null);
  const imc =
    consulta.peso_kg && consulta.talla_cm ? consulta.peso_kg / Math.pow(consulta.talla_cm / 100, 2) : null;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <div className="bg-[#00a884]/10 border border-[#00a884]/50 rounded-lg p-3 text-[#7fe7cd] text-xs">
        Consulta cerrada {consulta.cerrada_at ? fechaHoraColombia(consulta.cerrada_at) : ''} · Médico: {consulta.medico}.
        La historia está firmada y no se puede modificar.
      </div>

      {texto('Motivo de consulta', consulta.motivo_consulta)}
      {texto('Enfermedad actual', consulta.enfermedad_actual)}
      {texto('Antecedentes', consulta.antecedentes)}
      {texto('Revisión por sistemas', consulta.revision_sistemas)}

      {signos.length > 0 && (
        <div className={seccionCls}>
          <h3 className={tituloCls + ' mb-0'}>Signos vitales</h3>
          <p className="text-[11px] text-gray-400 mb-2">Reportados por el paciente</p>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {signos.map((k) => (
              <div key={k}>
                <span className="text-gray-400">{ETIQUETA_SIGNO[k]}:</span>{' '}
                <span className="text-white">{consulta[k]}</span>
              </div>
            ))}
            {imc !== null && (
              <div>
                <span className="text-gray-400">IMC:</span> <span className="text-white">{imc.toFixed(1)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {texto('Examen físico', consulta.examen_fisico)}

      <div className={seccionCls}>
        <h3 className={tituloCls}>Diagnósticos CIE-10</h3>
        <div className="space-y-1.5">
          {consulta.diagnosticos.map((d) => (
            <div key={d.codigo} className="flex gap-2 items-start text-xs">
              <span className="px-1.5 py-0.5 rounded bg-[#00a884]/20 text-[#7fe7cd] font-mono font-bold">{d.codigo}</span>
              <span className="flex-1 text-gray-200">
                {d.descripcion}
                <span className="block text-gray-400">
                  {d.tipo === 'principal' ? 'Principal' : 'Relacionado'} · {ETIQUETA_CLASE[d.clase]}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {texto('Análisis', consulta.analisis)}
      {texto('Plan de manejo', consulta.plan_manejo)}
      {texto('Recomendaciones', consulta.recomendaciones)}

      {consulta.formula.length > 0 && (
        <div className={seccionCls}>
          <h3 className={tituloCls}>Fórmula médica</h3>
          <ol className="space-y-1.5 text-xs list-decimal list-inside">
            {consulta.formula.map((f, i) => (
              <li key={i} className="text-gray-200">
                <span className="font-semibold text-white">
                  {f.medicamento}
                  {f.concentracion ? ` ${f.concentracion}` : ''}
                  {f.forma ? ` (${f.forma})` : ''}
                </span>
                {' — '}
                {f.dosis}, vía {f.via}, {f.frecuencia}, por {f.duracion_dias} días. Cantidad: {f.cantidad}.
                {f.indicaciones && <span className="block text-gray-400 ml-4">{f.indicaciones}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {consulta.ordenes.length > 0 && (
        <div className={seccionCls}>
          <h3 className={tituloCls}>Órdenes</h3>
          <ul className="space-y-1 text-xs">
            {consulta.ordenes.map((o, i) => (
              <li key={i} className="text-gray-200">
                <span className="text-gray-400">{ETIQUETA_TIPO_ORDEN[o.tipo]}:</span> {o.descripcion}
                {o.indicaciones && <span className="block text-gray-400 ml-4">{o.indicaciones}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {consulta.incapacidad && (
        <div className={seccionCls}>
          <h3 className={tituloCls}>Incapacidad</h3>
          <p className="text-xs text-gray-200">
            {consulta.incapacidad.dias} días, del {consulta.incapacidad.desde} al {consulta.incapacidad.hasta} ·{' '}
            {ETIQUETA_ORIGEN[consulta.incapacidad.origen]} · Dx {consulta.incapacidad.diagnostico}
          </p>
        </div>
      )}
    </div>
  );
}

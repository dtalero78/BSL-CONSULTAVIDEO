import {
  ErrorValidacion,
  calcularHasta,
  esMedicinaGeneral,
  normalizarCodigoCie10,
  numeroEnRango,
  prepararBusquedaCie10,
  quitarTildes,
  textoOpcional,
  validarCierre,
  validarConsulta,
} from '../validacion';

/** Devuelve el `campo` del ErrorValidacion que lanza fn (falla si no lanza). */
function campoDelError(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ErrorValidacion);
    return (e as ErrorValidacion).campo;
  }
  throw new Error('Se esperaba un ErrorValidacion');
}

const dxPrincipal = { codigo: 'J02.9', tipo: 'principal', clase: 'impresion' };
const dxRelacionado = { codigo: 'r509', tipo: 'relacionado', clase: 'confirmado_nuevo' };

const consultaCompleta = {
  motivo_consulta: 'Dolor de garganta',
  enfermedad_actual: 'Tres días de odinofagia',
  examen_fisico: 'Faringe eritematosa (reportado por video)',
  plan_manejo: 'Manejo sintomático',
  diagnosticos: [dxPrincipal, dxRelacionado],
};

describe('esMedicinaGeneral', () => {
  it('acepta el tipo exacto y tolera mayúsculas/espacios', () => {
    expect(esMedicinaGeneral('Medicina general')).toBe(true);
    expect(esMedicinaGeneral('  MEDICINA GENERAL ')).toBe(true);
  });
  it('rechaza otros tipos', () => {
    expect(esMedicinaGeneral('Ingreso')).toBe(false);
    expect(esMedicinaGeneral(null)).toBe(false);
  });
});

describe('textoOpcional', () => {
  it('vacío o solo espacios → null', () => {
    expect(textoOpcional('', 'x')).toBeNull();
    expect(textoOpcional('   ', 'x')).toBeNull();
    expect(textoOpcional(undefined, 'x')).toBeNull();
  });
  it('rechaza lo que no es texto y lo que supera 20000 caracteres', () => {
    expect(campoDelError(() => textoOpcional(5, 'analisis'))).toBe('analisis');
    expect(textoOpcional('a'.repeat(20000), 'x')).toHaveLength(20000);
    expect(campoDelError(() => textoOpcional('a'.repeat(20001), 'analisis'))).toBe('analisis');
  });
});

describe('numeroEnRango', () => {
  it('acepta números y texto numérico, con coma decimal', () => {
    expect(numeroEnRango('36,55', 't', 30, 45, 1)).toBe(36.6);
    expect(numeroEnRango(120, 'ta', 40, 300, 0)).toBe(120);
    expect(numeroEnRango('', 'ta', 40, 300, 0)).toBeNull();
    expect(numeroEnRango(null, 'ta', 40, 300, 0)).toBeNull();
  });
  it('rechaza fuera de rango, decimales en enteros y texto no numérico', () => {
    expect(campoDelError(() => numeroEnRango(301, 'ta_sistolica', 40, 300, 0))).toBe('ta_sistolica');
    expect(campoDelError(() => numeroEnRango(80.5, 'frecuencia_cardiaca', 20, 250, 0))).toBe('frecuencia_cardiaca');
    expect(campoDelError(() => numeroEnRango('abc', 'saturacion', 50, 100, 0))).toBe('saturacion');
    expect(campoDelError(() => numeroEnRango(true, 'saturacion', 50, 100, 0))).toBe('saturacion');
  });
});

describe('normalizarCodigoCie10', () => {
  it('quita puntos y espacios y pasa a mayúsculas', () => {
    expect(normalizarCodigoCie10('j02.9')).toBe('J029');
    expect(normalizarCodigoCie10(' a09 x ')).toBe('A09X');
    expect(normalizarCodigoCie10(42)).toBe('');
  });
});

describe('calcularHasta', () => {
  it('desde + dias - 1, cruzando meses y años bisiestos', () => {
    expect(calcularHasta('2026-11-23', 1)).toBe('2026-11-23');
    expect(calcularHasta('2026-11-28', 5)).toBe('2026-12-02');
    expect(calcularHasta('2028-02-28', 2)).toBe('2028-02-29');
  });
});

describe('validarConsulta', () => {
  it('normaliza la consulta completa', () => {
    const c = validarConsulta({ ...consultaCompleta, temperatura: '37.2', ta_sistolica: '', medico: ' SIXTA ', extra: 'x' });
    expect(c.diagnosticos).toEqual([
      { codigo: 'J029', tipo: 'principal', clase: 'impresion' },
      { codigo: 'R509', tipo: 'relacionado', clase: 'confirmado_nuevo' },
    ]);
    expect(c.temperatura).toBe(37.2);
    expect(c.ta_sistolica).toBeNull();
    expect(c.medico).toBe('SIXTA');
    expect(c.antecedentes).toBeNull();
    expect(c.formula).toEqual([]);
    expect(c.incapacidad).toBeNull();
    expect(c).not.toHaveProperty('extra');
  });

  it('nunca toma la descripción del diagnóstico que manda el cliente', () => {
    const c = validarConsulta({ diagnosticos: [{ ...dxPrincipal, descripcion: 'INVENTADA' }] });
    expect(c.diagnosticos[0]).not.toHaveProperty('descripcion');
  });

  it('rechaza un cuerpo que no es objeto', () => {
    expect(campoDelError(() => validarConsulta([]))).toBe('cuerpo');
  });

  describe('diagnósticos', () => {
    it('máximo 10', () => {
      const muchos = Array.from({ length: 11 }, (_, i) => ({ codigo: `A0${i}`, tipo: 'relacionado', clase: 'impresion' }));
      expect(campoDelError(() => validarConsulta({ diagnosticos: muchos }))).toBe('diagnosticos');
    });
    it('solo un principal', () => {
      const dos = [dxPrincipal, { ...dxRelacionado, tipo: 'principal' }];
      expect(campoDelError(() => validarConsulta({ diagnosticos: dos }))).toBe('diagnosticos[1].tipo');
    });
    it('tipo, clase y código válidos y sin repetir', () => {
      expect(campoDelError(() => validarConsulta({ diagnosticos: [{ ...dxPrincipal, tipo: 'otro' }] }))).toBe('diagnosticos[0].tipo');
      expect(campoDelError(() => validarConsulta({ diagnosticos: [{ ...dxPrincipal, clase: 'x' }] }))).toBe('diagnosticos[0].clase');
      expect(campoDelError(() => validarConsulta({ diagnosticos: [{ ...dxPrincipal, codigo: '%' }] }))).toBe('diagnosticos[0].codigo');
      expect(
        campoDelError(() => validarConsulta({ diagnosticos: [dxPrincipal, { ...dxRelacionado, codigo: 'J029' }] }))
      ).toBe('diagnosticos[1].codigo');
    });
  });

  describe('fórmula', () => {
    const item = { medicamento: 'Acetaminofén', dosis: '500 mg', via: 'oral', frecuencia: 'cada 8 horas', duracion_dias: '5', cantidad: 15 };
    it('normaliza un ítem válido', () => {
      const c = validarConsulta({ formula: [item] });
      expect(c.formula[0]).toEqual({
        medicamento: 'Acetaminofén',
        concentracion: null,
        forma: null,
        dosis: '500 mg',
        via: 'oral',
        frecuencia: 'cada 8 horas',
        duracion_dias: 5,
        cantidad: '15',
        indicaciones: null,
      });
    });
    it('exige los campos obligatorios y duración entre 1 y 365', () => {
      expect(campoDelError(() => validarConsulta({ formula: [{ ...item, via: ' ' }] }))).toBe('formula[0].via');
      expect(campoDelError(() => validarConsulta({ formula: [{ ...item, cantidad: undefined }] }))).toBe('formula[0].cantidad');
      expect(campoDelError(() => validarConsulta({ formula: [{ ...item, duracion_dias: 0 }] }))).toBe('formula[0].duracion_dias');
      expect(campoDelError(() => validarConsulta({ formula: [{ ...item, duracion_dias: 366 }] }))).toBe('formula[0].duracion_dias');
      expect(campoDelError(() => validarConsulta({ formula: [{ ...item, duracion_dias: 2.5 }] }))).toBe('formula[0].duracion_dias');
    });
    it('máximo 20 ítems', () => {
      expect(campoDelError(() => validarConsulta({ formula: Array(21).fill(item) }))).toBe('formula');
    });
  });

  describe('órdenes', () => {
    it('tipo cerrado y descripción obligatoria', () => {
      const c = validarConsulta({ ordenes: [{ tipo: 'laboratorio', descripcion: 'Cuadro hemático' }] });
      expect(c.ordenes).toEqual([{ tipo: 'laboratorio', descripcion: 'Cuadro hemático', indicaciones: null }]);
      expect(campoDelError(() => validarConsulta({ ordenes: [{ tipo: 'cirugia', descripcion: 'x' }] }))).toBe('ordenes[0].tipo');
      expect(campoDelError(() => validarConsulta({ ordenes: [{ tipo: 'imagen' }] }))).toBe('ordenes[0].descripcion');
      expect(campoDelError(() => validarConsulta({ ordenes: 'x' }))).toBe('ordenes');
    });
  });

  describe('incapacidad', () => {
    const base = { dias: 3, desde: '2026-11-23', origen: 'enfermedad_general', diagnostico: 'j02.9' };
    it('calcula hasta en el servidor e ignora el del cliente', () => {
      const c = validarConsulta({ diagnosticos: [dxPrincipal], incapacidad: { ...base, hasta: '2030-01-01' } });
      expect(c.incapacidad).toEqual({ dias: 3, desde: '2026-11-23', hasta: '2026-11-25', origen: 'enfermedad_general', diagnostico: 'J029' });
    });
    it('null la quita', () => {
      expect(validarConsulta({ incapacidad: null }).incapacidad).toBeNull();
    });
    it('valida días, fecha, origen y que el diagnóstico sea de la consulta', () => {
      const dx = [dxPrincipal];
      expect(campoDelError(() => validarConsulta({ diagnosticos: dx, incapacidad: { ...base, dias: 181 } }))).toBe('incapacidad.dias');
      expect(campoDelError(() => validarConsulta({ diagnosticos: dx, incapacidad: { ...base, desde: '2026-02-30' } }))).toBe('incapacidad.desde');
      expect(campoDelError(() => validarConsulta({ diagnosticos: dx, incapacidad: { ...base, origen: 'x' } }))).toBe('incapacidad.origen');
      expect(campoDelError(() => validarConsulta({ diagnosticos: dx, incapacidad: { ...base, diagnostico: 'R509' } }))).toBe('incapacidad.diagnostico');
      expect(campoDelError(() => validarConsulta({ diagnosticos: dx, incapacidad: [] }))).toBe('incapacidad');
    });
  });
});

describe('validarCierre', () => {
  it('pasa con lo mínimo obligatorio', () => {
    expect(() => validarCierre(validarConsulta(consultaCompleta))).not.toThrow();
  });
  it('exige motivo, enfermedad actual, examen físico y plan', () => {
    for (const campo of ['motivo_consulta', 'enfermedad_actual', 'examen_fisico', 'plan_manejo']) {
      const c = validarConsulta({ ...consultaCompleta, [campo]: '  ' });
      expect(campoDelError(() => validarCierre(c))).toBe(campo);
    }
  });
  it('exige exactamente un diagnóstico principal', () => {
    const sinPrincipal = validarConsulta({ ...consultaCompleta, diagnosticos: [dxRelacionado] });
    expect(campoDelError(() => validarCierre(sinPrincipal))).toBe('diagnosticos');
    const sinDx = validarConsulta({ ...consultaCompleta, diagnosticos: [] });
    expect(campoDelError(() => validarCierre(sinDx))).toBe('diagnosticos');
  });
});

describe('prepararBusquedaCie10', () => {
  it('nada que buscar → null', () => {
    expect(prepararBusquedaCie10('  ')).toBeNull();
    expect(prepararBusquedaCie10(undefined)).toBeNull();
  });
  it('código con punto y minúsculas → prefijo sin punto', () => {
    expect(prepararBusquedaCie10('j02.')).toEqual({ prefijoCodigo: 'J02%', palabras: ['%j02.%'] });
  });
  it('palabras sin tildes; frase con espacios no es prefijo de código', () => {
    expect(prepararBusquedaCie10('Faringítis  AGUDA')).toEqual({ prefijoCodigo: null, palabras: ['%faringitis%', '%aguda%'] });
    expect(prepararBusquedaCie10('dolor, cabeza')?.prefijoCodigo).toBeNull();
  });
  it('escapa los comodines de LIKE', () => {
    expect(prepararBusquedaCie10('50%_x')).toEqual({ prefijoCodigo: null, palabras: ['%50\\%\\_x%'] });
  });
  it('quitarTildes', () => {
    expect(quitarTildes('ÁÉÍÓÚÑ ü')).toBe('aeioun u');
  });
});

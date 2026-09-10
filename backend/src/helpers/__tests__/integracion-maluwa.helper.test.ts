import {
  calcularEdad,
  construirUrlsConsulta,
  mapearConceptoMaluwa,
  normalizarCelularContacto,
  validarConsultaIntegracion,
} from '../integracion-maluwa.helper';

// 2026-09-10 10:00 en Colombia
const NOW = new Date('2026-09-10T15:00:00Z');

function payloadMenor(overrides: Record<string, unknown> = {}): Record<string, any> {
  return {
    externalId: '7b1c7f0e-0000-4000-8000-000000000001',
    tipo: 'VALORACION_GENERAL',
    medico: 'MEDICO1',
    empresa: 'MALUWA360',
    institucion: { nombre: 'IE Rural El Carmen', dane: '205001000123' },
    paciente: {
      tipoDocumento: 'TI',
      documento: '1020304050',
      primerNombre: 'Ana',
      primerApellido: 'Pérez',
      fechaNacimiento: '2017-03-01',
      celular: null,
    },
    acudiente: { nombre: 'María Pérez', documento: '43123456', celular: '3001234567', parentesco: 'madre' },
    consentimiento: { version: 'salud-v1', otorgadoEn: '2026-09-01T10:00:00-05:00', medio: 'digital' },
    notificar: false,
    ...overrides,
  };
}

function payloadAdulto(overrides: Record<string, unknown> = {}): Record<string, any> {
  const base = payloadMenor();
  return {
    ...base,
    tipo: 'OCUPACIONAL_PERIODICO',
    paciente: { ...base.paciente, tipoDocumento: 'CC', fechaNacimiento: '1985-05-20', celular: '+57 310 555 1234' },
    acudiente: undefined,
    ...overrides,
  };
}

function errores(body: unknown): string[] {
  const r = validarConsultaIntegracion(body, NOW);
  if (r.ok) throw new Error('se esperaba un error de validación');
  return r.errores;
}

describe('validarConsultaIntegracion', () => {
  it('menor con acudiente y consentimiento → válido; contacto = celular del acudiente', () => {
    const r = validarConsultaIntegracion(payloadMenor(), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.esMenor).toBe(true);
    expect(r.value.edad).toBe(9);
    expect(r.value.celularContacto).toBe('573001234567');
    expect(r.value.notificar).toBe(false);
  });

  it('menor SIN acudiente → error claro', () => {
    const e = errores(payloadMenor({ acudiente: undefined }));
    expect(e[0]).toMatch(/menor de edad \(9 años\).*acudiente es obligatorio/);
  });

  it('menor con acudiente incompleto → indica el campo faltante', () => {
    const base = payloadMenor();
    const e = errores({ ...base, acudiente: { ...base.acudiente, celular: '' } });
    expect(e).toContain('acudiente.celular es obligatorio porque el paciente es menor de edad (9 años).');
  });

  it('sin consentimiento → error (siempre obligatorio, también para adultos)', () => {
    expect(errores(payloadMenor({ consentimiento: undefined }))[0]).toMatch(/consentimiento es obligatorio/);
    expect(errores(payloadAdulto({ consentimiento: null }))[0]).toMatch(/consentimiento es obligatorio/);
  });

  it('consentimiento con fecha inválida o futura → error', () => {
    const base = payloadMenor();
    expect(errores({ ...base, consentimiento: { ...base.consentimiento, otorgadoEn: 'ayer' } })[0]).toMatch(
      /otorgadoEn debe ser fecha-hora ISO 8601/
    );
    expect(
      errores({ ...base, consentimiento: { ...base.consentimiento, otorgadoEn: '2026-12-01T10:00:00-05:00' } })[0]
    ).toMatch(/no puede estar en el futuro/);
  });

  it('adulto sin acudiente → válido con su propio celular normalizado', () => {
    const r = validarConsultaIntegracion(payloadAdulto(), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.esMenor).toBe(false);
    expect(r.value.celularContacto).toBe('573105551234');
  });

  it('adulto sin celular ni acudiente → error', () => {
    const base = payloadAdulto();
    expect(errores({ ...base, paciente: { ...base.paciente, celular: null } })[0]).toMatch(/celular de contacto/);
  });

  it('borde de mayoría de edad: cumple 18 hoy → adulto; mañana → menor', () => {
    const base = payloadAdulto();
    const hoy = validarConsultaIntegracion({ ...base, paciente: { ...base.paciente, fechaNacimiento: '2008-09-10' } }, NOW);
    expect(hoy.ok && hoy.value.esMenor).toBe(false);
    const e = errores({ ...base, paciente: { ...base.paciente, fechaNacimiento: '2008-09-11' } });
    expect(e[0]).toMatch(/menor de edad \(17 años\)/);
  });

  it('rechaza tipo, fecha, empresa y body inválidos', () => {
    expect(errores(payloadMenor({ tipo: 'CIRUGIA' }))[0]).toMatch(/tipo debe ser uno de/);
    const base = payloadMenor();
    expect(errores({ ...base, paciente: { ...base.paciente, fechaNacimiento: '2017-02-30' } })[0]).toMatch(
      /AAAA-MM-DD/
    );
    expect(errores(payloadMenor({ empresa: 'OMEGA' }))[0]).toMatch(/MALUWA360/);
    expect(errores('hola')[0]).toMatch(/objeto JSON/);
    expect(errores(payloadMenor({ notificar: 'si' }))).toContain('notificar debe ser booleano.');
  });
});

describe('calcularEdad', () => {
  it('usa la fecha de Colombia (UTC-5), no la del servidor', () => {
    // 2026-09-10T03:00Z = 2026-09-09 22:00 en Colombia → aún no cumple
    expect(calcularEdad('2008-09-10', new Date('2026-09-10T03:00:00Z'))).toBe(17);
    expect(calcularEdad('2008-09-10', new Date('2026-09-10T05:00:00Z'))).toBe(18);
  });
});

describe('normalizarCelularContacto', () => {
  it.each([
    ['3001234567', '573001234567'], // celular colombiano sin indicativo (empieza por 30)
    ['+57 300 123 4567', '573001234567'],
    ['573001234567', '573001234567'],
    ['+1 (555) 123-4567', '15551234567'],
    ['12345', null],
    ['abc3001234567', null],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarCelularContacto(entrada)).toBe(esperado);
  });
});

describe('construirUrlsConsulta', () => {
  it('usa los mismos parámetros que "Crear sala" del panel', () => {
    const { patientUrl, doctorUrl, roomNameWithParams } = construirUrlsConsulta({
      baseUrl: 'https://medico-bsl.com/',
      roomName: 'consulta-abc-123',
      historiaId: 'hc-1',
      medico: 'MEDICO1',
      nombrePaciente: 'Ana Pérez',
      empresa: 'MALUWA360',
      celular: '573001234567',
    });
    expect(roomNameWithParams).toBe(
      'consulta-abc-123?nombre=Ana+P%C3%A9rez&documento=hc-1&doctor=MEDICO1&empresa=MALUWA360&suelta=1'
    );
    expect(patientUrl).toBe(`https://medico-bsl.com/patient/${roomNameWithParams}`);
    expect(doctorUrl).toBe(
      'https://medico-bsl.com/doctor/consulta-abc-123?doctor=MEDICO1&documento=hc-1&paciente=Ana+P%C3%A9rez' +
        '&empresa=MALUWA360&celular=%2B573001234567&suelta=1'
    );
  });
});

describe('mapearConceptoMaluwa (valores reales del dropdown Concepto Final)', () => {
  it.each([
    ['APTO PARA EL CARGO SIN RESTRICCIONES MÉDICO-LABORALES.', 'APTO'],
    ['APTO PARA EL CARGO SIN RECOMENDACIONES MÉDICO-LABORALES.', 'APTO'],
    ['APTO', 'APTO'],
    ['ELEGIBLE PARA EL CARGO SIN RECOMENDACIONES LABORALES', 'APTO'],
    ['APTO PARA EL CARGO CON RECOMENDACIONES MÉDICO-LABORALES.', 'APTO_CON_RECOMENDACIONES'],
    ['APTO PARA EL CARGO CON RECOMENDACIONES', 'APTO_CON_RECOMENDACIONES'],
    [
      'APTO CON RECOMENDACIONES Y AJUSTES RAZONABLES PARA LA DISCAPACIDAD QUE PRESENTA',
      'APTO_CON_RECOMENDACIONES',
    ],
    ['CONCEPTO PENDIENTE POR VALORACIÓN MÉDICA COMPLEMENTARIA.', 'REMISION'],
    ['Se remite a valoración por pediatría', 'REMISION'],
  ])('%s → %s', (entrada, esperado) => {
    expect(mapearConceptoMaluwa(entrada)).toBe(esperado);
  });

  it.each([
    'APTO PARA EL CARGO CON RESTRICCIONES MÉDICO-LABORALES TEMPORALES.',
    'APTO PARA EL CARGO CON RESTRICCIONES MÉDICO-LABORALES PERMANENTES.',
    'PRESENTA RESTRICCIONES MÉDICO-LABORALES ACTUALMENTE INCOMPATIBLES CON LAS EXIGENCIAS DEL CARGO EVALUADO.',
    'NO PRESENTA DETERIORO FÍSICO POR ACTIVIDAD LABORAL',
    'NO APTO',
  ])('sin equivalente → valor crudo: %s', (entrada) => {
    expect(mapearConceptoMaluwa(entrada)).toBe(entrada);
  });

  it('vacío → null', () => {
    expect(mapearConceptoMaluwa('')).toBeNull();
    expect(mapearConceptoMaluwa(undefined)).toBeNull();
  });
});

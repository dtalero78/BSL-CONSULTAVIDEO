# Implementación de la Sección "Condiciones Especiales"

## Descripción General

La sección "Condiciones Especiales" muestra como tags visuales los antecedentes médicos positivos del paciente, tanto personales como familiares, que fueron registrados en el formulario inicial y almacenados en la tabla `formularios` de PostgreSQL.

## Arquitectura de la Solución

### 1. Backend - Extracción de Datos (`backend/src/services/medical-history.service.ts`)

#### Consulta SQL con LEFT JOIN
La consulta principal une la tabla `HistoriaClinica` con `formularios` para obtener todos los antecedentes:

```typescript
const query = `
  SELECT
    h.*,
    f.cirugia_ocular,
    f.fuma,
    f.presion_alta,
    f.problemas_azucar,
    f.familia_diabetes,
    f.familia_hipertension,
    -- ... (27 campos personales + 8 familiares)
  FROM "HistoriaClinica" h
  LEFT JOIN formularios f ON h."numeroId" = f.numero_id
  WHERE h."_id" = $1
`;
```

#### Conversión de Valores a Boolean (Líneas 208-245)
El desafío principal fue que la base de datos almacena los valores en múltiples formatos:
- `true` (booleano nativo)
- `'true'` (string)
- `'Sí'` (string con acento)
- `'SI'` (string mayúsculas sin acento)

**Solución implementada:**
```typescript
antecedentesPersonales: {
  cirugiaOcular: row.cirugia_ocular === true ||
                 row.cirugia_ocular === 'true' ||
                 row.cirugia_ocular === 'Sí' ||
                 row.cirugia_ocular === 'SI',
  fuma: row.fuma === true ||
        row.fuma === 'true' ||
        row.fuma === 'Sí' ||
        row.fuma === 'SI',
  // ... (repetido para los 27 campos personales)
},
antecedentesFamiliaresDetalle: {
  diabetes: row.familia_diabetes === true ||
            row.familia_diabetes === 'true' ||
            row.familia_diabetes === 'Sí' ||
            row.familia_diabetes === 'SI',
  hipertension: row.familia_hipertension === true ||
                row.familia_hipertension === 'true' ||
                row.familia_hipertension === 'Sí' ||
                row.familia_hipertension === 'SI',
  // ... (repetido para los 8 campos familiares)
}
```

**Commits relacionados:**
- `1df0d67`: Implementación inicial con formatos `true`, `'true'`, `'Sí'`
- `b1472f2`: Fix para reconocer formato `'SI'` (mayúsculas sin acento)

### 2. Frontend - Interfaces TypeScript (`frontend/src/components/MedicalHistoryPanel.tsx`)

#### Definición de Tipos (Líneas 4-43)

```typescript
// 27 campos de antecedentes personales
interface AntecedentesPersonales {
  cirugiaOcular?: boolean;
  cirugiaProgramada?: boolean;
  condicionMedica?: boolean;
  dolorCabeza?: boolean;
  dolorEspalda?: boolean;
  embarazo?: boolean;
  enfermedadHigado?: boolean;
  enfermedadPulmonar?: boolean;
  fuma?: boolean;
  consumoLicor?: boolean;
  hernias?: boolean;
  hormigueos?: boolean;
  presionAlta?: boolean;
  problemasAzucar?: boolean;
  problemasCardiacos?: boolean;
  problemasSueno?: boolean;
  usaAnteojos?: boolean;
  usaLentesContacto?: boolean;
  varices?: boolean;
  hepatitis?: boolean;
  trastornoPsicologico?: boolean;
  sintomasPsicologicos?: boolean;
  diagnosticoCancer?: boolean;
  enfermedadesLaborales?: boolean;
  enfermedadOsteomuscular?: boolean;
  enfermedadAutoinmune?: boolean;
  ruidoJaqueca?: boolean;
}

// 8 campos de antecedentes familiares
interface AntecedentesFamiliares {
  hereditarias?: boolean;
  geneticas?: boolean;
  diabetes?: boolean;
  hipertension?: boolean;
  infartos?: boolean;
  cancer?: boolean;
  trastornos?: boolean;
  infecciosas?: boolean;
}

// Interface principal que extiende MedicalHistoryData
interface MedicalHistoryData {
  // ... campos existentes ...
  antecedentesPersonales?: AntecedentesPersonales;
  antecedentesFamiliaresDetalle?: AntecedentesFamiliares;
}
```

### 3. Lógica de Presentación

#### Traducción de Campos (Líneas 122-163)

Función `formatFieldName()` que convierte los nombres técnicos (camelCase) a etiquetas legibles en español:

```typescript
const formatFieldName = (fieldName: string): string => {
  const translations: { [key: string]: string } = {
    // Antecedentes personales
    cirugiaOcular: 'Cirugía Ocular',
    cirugiaProgramada: 'Cirugía Programada',
    condicionMedica: 'Condición Médica',
    dolorCabeza: 'Dolor de Cabeza',
    dolorEspalda: 'Dolor de Espalda',
    embarazo: 'Embarazo',
    enfermedadHigado: 'Enfermedad del Hígado',
    enfermedadPulmonar: 'Enfermedad Pulmonar',
    fuma: 'Fuma',
    consumoLicor: 'Consumo de Licor',
    hernias: 'Hernias',
    hormigueos: 'Hormigueos',
    presionAlta: 'Presión Alta',
    problemasAzucar: 'Problemas de Azúcar',
    problemasCardiacos: 'Problemas Cardíacos',
    problemasSueno: 'Problemas de Sueño',
    usaAnteojos: 'Usa Anteojos',
    usaLentesContacto: 'Usa Lentes de Contacto',
    varices: 'Várices',
    hepatitis: 'Hepatitis',
    trastornoPsicologico: 'Trastorno Psicológico',
    sintomasPsicologicos: 'Síntomas Psicológicos',
    diagnosticoCancer: 'Diagnóstico de Cáncer',
    enfermedadesLaborales: 'Enfermedades Laborales',
    enfermedadOsteomuscular: 'Enfermedad Osteomuscular',
    enfermedadAutoinmune: 'Enfermedad Autoinmune',
    ruidoJaqueca: 'Ruido/Jaqueca',
    // Antecedentes familiares
    hereditarias: 'Enfermedades Hereditarias',
    geneticas: 'Enfermedades Genéticas',
    diabetes: 'Diabetes',
    hipertension: 'Hipertensión',
    infartos: 'Infartos',
    cancer: 'Cáncer',
    trastornos: 'Trastornos',
    infecciosas: 'Enfermedades Infecciosas',
  };
  return translations[fieldName] || fieldName;
};
```

#### Filtrado de Condiciones Positivas (Líneas 166-190)

Función `getPositiveConditions()` que retorna solo los antecedentes con valor `true`:

```typescript
const getPositiveConditions = (): string[] => {
  if (!data) return [];

  const conditions: string[] = [];

  // Agregar antecedentes personales positivos
  if (data.antecedentesPersonales) {
    Object.entries(data.antecedentesPersonales).forEach(([key, value]) => {
      if (value === true) {
        conditions.push(formatFieldName(key));
      }
    });
  }

  // Agregar antecedentes familiares positivos (con prefijo "Fam:")
  if (data.antecedentesFamiliaresDetalle) {
    Object.entries(data.antecedentesFamiliaresDetalle).forEach(([key, value]) => {
      if (value === true) {
        conditions.push(`Fam: ${formatFieldName(key)}`);
      }
    });
  }

  return conditions;
};
```

### 4. Componente UI (Líneas 338-357)

Renderizado condicional de la sección con tags diferenciados por color:

```tsx
{/* Condiciones Especiales (antecedentes positivos del formulario) */}
{getPositiveConditions().length > 0 && (
  <div className="bg-[#2a3942] rounded-lg p-3">
    <h3 className="text-sm font-semibold mb-2 text-[#00a884]">
      Condiciones Especiales
    </h3>
    <div className="flex flex-wrap gap-2">
      {getPositiveConditions().map((condition, index) => (
        <span
          key={index}
          className={`px-3 py-1 rounded-full text-xs font-medium ${
            condition.startsWith('Fam:')
              ? 'bg-purple-900/30 text-purple-300 border border-purple-500/30'
              : 'bg-amber-900/30 text-amber-300 border border-amber-500/30'
          }`}
        >
          {condition}
        </span>
      ))}
    </div>
  </div>
)}
```

## Diseño Visual

### Diferenciación por Tipo de Antecedente

- **Antecedentes Personales**: Tags color ámbar/naranja
  - Background: `bg-amber-900/30`
  - Texto: `text-amber-300`
  - Borde: `border-amber-500/30`

- **Antecedentes Familiares**: Tags color púrpura (con prefijo "Fam:")
  - Background: `bg-purple-900/30`
  - Texto: `text-purple-300`
  - Borde: `border-purple-500/30`

### Ubicación en el Panel

La sección aparece después de los datos demográficos y antes de la sección "Antecedentes", en la parte superior del panel de historia clínica.

## Ejemplo de Visualización

Para un paciente con:
- `familia_diabetes = 'SI'`
- `familia_hipertension = 'SI'`

Se mostrarán dos tags morados:
- `Fam: Diabetes`
- `Fam: Hipertensión`

## Campos Soportados

### Antecedentes Personales (27 campos)
1. Cirugía Ocular
2. Cirugía Programada
3. Condición Médica
4. Dolor de Cabeza
5. Dolor de Espalda
6. Embarazo
7. Enfermedad del Hígado
8. Enfermedad Pulmonar
9. Fuma
10. Consumo de Licor
11. Hernias
12. Hormigueos
13. Presión Alta
14. Problemas de Azúcar
15. Problemas Cardíacos
16. Problemas de Sueño
17. Usa Anteojos
18. Usa Lentes de Contacto
19. Várices
20. Hepatitis
21. Trastorno Psicológico
22. Síntomas Psicológicos
23. Diagnóstico de Cáncer
24. Enfermedades Laborales
25. Enfermedad Osteomuscular
26. Enfermedad Autoinmune
27. Ruido/Jaqueca

### Antecedentes Familiares (8 campos)
1. Enfermedades Hereditarias
2. Enfermedades Genéticas
3. Diabetes
4. Hipertensión
5. Infartos
6. Cáncer
7. Trastornos
8. Enfermedades Infecciosas

## Manejo de Casos Edge

### Valores Vacíos
Si no hay antecedentes positivos, la sección no se renderiza (renderizado condicional con `{getPositiveConditions().length > 0 && ...}`).

### Formatos de Datos Soportados
El backend maneja 4 variantes de valores positivos:
- Boolean nativo: `true`
- String boolean: `'true'`
- String español con acento: `'Sí'`
- String español mayúsculas: `'SI'`

### Valores Negativos
Los campos con valores `false`, `'false'`, `'No'`, `'NO'`, o `null` no se muestran.

## Testing

### Caso de Prueba
**Paciente:** CC 80049658 (Alexander Parra)
**Datos en PostgreSQL:**
```sql
familia_diabetes = 'SI'
familia_hipertension = 'SI'
```

**Resultado Esperado:**
Sección "Condiciones Especiales" visible con dos tags morados:
- Fam: Diabetes
- Fam: Hipertensión

## Commits Relacionados

1. **Commit d119303** (2025-12-26):
   - Implementación inicial de frontend
   - Interfaces TypeScript
   - Funciones de formateo y filtrado
   - Componente UI

2. **Commit 1df0d67** (2025-12-26):
   - Query SQL con LEFT JOIN
   - Conversión inicial de valores (true, 'true', 'Sí')

3. **Commit b1472f2** (2025-12-27):
   - Fix para formato 'SI' (mayúsculas sin acento)
   - Solución de bug de datos no visibles

## Archivos Modificados

- `backend/src/services/medical-history.service.ts` (líneas 129-245)
- `frontend/src/components/MedicalHistoryPanel.tsx` (líneas 4-43, 122-190, 338-357)

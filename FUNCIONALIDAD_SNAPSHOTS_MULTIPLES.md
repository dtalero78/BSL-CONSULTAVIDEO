# 📸 Snapshots Múltiples para Evaluación Postural

## 🎯 Funcionalidad Implementada

Se ha mejorado el sistema de análisis postural para permitir que el médico capture **múltiples snapshots** durante una sesión, cada uno con su propia descripción (nombre del ejercicio o postura), y generar un **informe PDF completo** con imágenes del esqueleto en cada posición.

---

## ✨ Características Nuevas

### **1. Captura con Descripción Personalizada**

Ahora cuando el médico hace clic en "Capturar Snapshot", se abre un diálogo donde puede:
- Ingresar un nombre descriptivo del ejercicio (ej: "Brazos levantados", "Inclinación lateral izquierda")
- El sistema sugiere automáticamente "Ejercicio 1", "Ejercicio 2", etc.
- Presionar Enter para capturar rápidamente

**Ejemplo de uso:**
```
Doctor: "Levanta ambos brazos por encima de la cabeza"
Paciente: [Realiza el ejercicio]
Doctor: [Captura snapshot con nombre "Brazos arriba"]
```

---

### **2. Lista Visual de Snapshots Capturados**

Después de capturar, aparece una lista con:
- ✅ **Miniatura de la imagen** del esqueleto capturado
- 📝 **Nombre del ejercicio**
- ⏰ **Hora de captura**
- 🗑️ **Botón para eliminar** (por si se capturó por error)

La lista se muestra en el panel derecho, encima de los botones de control, con scroll si hay muchos snapshots.

---

### **3. Informe PDF Mejorado**

El PDF generado ahora incluye:

#### **Página 1: Resumen**
- Título: "Análisis Postural"
- Sala y fecha
- Total de snapshots capturados

#### **Páginas 2+: Una página por cada snapshot**
Cada snapshot tiene su propia página con:

1. **Título centrado**: Nombre del ejercicio
2. **Fecha/hora de captura**: Timestamp
3. **Imagen del esqueleto**: Visualización del canvas (640x480px escalado a 120x90mm)
4. **Métricas detalladas**:
   - Postura (ángulo del tronco, alineación)
   - Ángulos articulares (codos y rodillas)
   - Simetría corporal (hombros y caderas)

#### **Ejemplo de estructura PDF:**
```
=== Página 1 ===
Análisis Postural
Sala: consulta-abc123
Fecha: 27/10/2025 10:45:30
Snapshots capturados: 5

=== Página 2 ===
Brazos arriba
Capturado: 10:46:15

[Imagen del esqueleto]

Postura:
  Ángulo del Tronco: 88.5°
  Alineación: Buena

Ángulos Articulares:
  Codo Izquierdo: 175.2°
  Codo Derecho: 176.8°
  ...

=== Página 3 ===
Inclinación lateral derecha
...
```

---

## 🎬 Flujo de Trabajo del Médico

### **Escenario: Evaluación de 5 Ejercicios Posturales**

```
1. Doctor inicia sesión de análisis postural
   └─> Modal se abre, esperando paciente

2. Paciente se conecta
   └─> Doctor ve esqueleto en tiempo real

3. Doctor indica primer ejercicio:
   "Levanta ambos brazos por encima de la cabeza"

4. Paciente realiza la pose
   └─> Doctor espera a que la postura se estabilice

5. Doctor hace clic en "Capturar Snapshot"
   └─> Diálogo se abre con "Ejercicio 1"
   └─> Doctor cambia a "Brazos arriba"
   └─> Presiona Enter o clic en "Capturar"
   └─> ✅ Snapshot guardado con imagen y métricas

6. Repetir pasos 3-5 para cada ejercicio:
   - Ejercicio 2: "Brazos extendidos al frente"
   - Ejercicio 3: "Inclinación lateral izquierda"
   - Ejercicio 4: "Inclinación lateral derecha"
   - Ejercicio 5: "Rotación de tronco"

7. Al finalizar los 5 ejercicios:
   └─> Doctor ve lista con 5 snapshots capturados
   └─> Puede eliminar alguno si fue capturado incorrectamente
   └─> Clic en "Generar PDF"
   └─> 📄 Descarga automática del informe completo

8. Doctor finaliza la sesión
```

---

## 📊 **Estructura de Datos**

### **CapturedSnapshot Interface:**
```typescript
interface CapturedSnapshot {
  // Datos de pose de MediaPipe
  landmarks: any[];
  metrics: {
    posture: {
      trunkAngle: string;
      alignment: string;
    };
    joints: {
      leftElbow: string;
      rightElbow: string;
      leftKnee: string;
      rightKnee: string;
    };
    symmetry: {
      shoulders: string;
      shoulderDiff: string;
      hips: string;
      hipDiff: string;
    };
  };
  timestamp: number;

  // Nuevos campos
  description: string;      // "Brazos arriba", "Inclinación lateral", etc.
  canvasImage?: string;     // Base64 PNG del canvas (para el PDF)
}
```

---

## 🖼️ **Captura de Imagen del Canvas**

Cuando se captura un snapshot:

```typescript
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const canvasImage = canvas.toDataURL('image/png');
// Resultado: "data:image/png;base64,iVBORw0KGgo..."
```

Esta imagen se guarda junto con los datos de pose y se incluye en el PDF usando `jsPDF.addImage()`.

---

## 🎨 **Interfaz de Usuario**

### **Diálogo de Captura:**
```
┌─────────────────────────────────────────┐
│ Capturar Snapshot                       │
├─────────────────────────────────────────┤
│                                         │
│ Nombre del ejercicio o postura:        │
│ ┌─────────────────────────────────────┐ │
│ │ Brazos levantados                   │ │
│ └─────────────────────────────────────┘ │
│   Ej: Brazos levantados, Inclinación...│
│                                         │
│  ┌──────────┐  ┌──────────┐           │
│  │ Cancelar │  │ Capturar │           │
│  └──────────┘  └──────────┘           │
└─────────────────────────────────────────┘
```

### **Lista de Snapshots:**
```
Snapshots Capturados (3)

┌───────────────────────────────────────┐
│ [IMG] Brazos arriba            [🗑️] │
│       10:45:23                        │
├───────────────────────────────────────┤
│ [IMG] Inclinación izquierda    [🗑️] │
│       10:46:15                        │
├───────────────────────────────────────┤
│ [IMG] Rotación de tronco       [🗑️] │
│       10:47:02                        │
└───────────────────────────────────────┘

[IMG] = Miniatura 64x48px del esqueleto
```

---

## 🔧 **Archivos Modificados**

### **frontend/src/components/PosturalAnalysisModal.tsx**

**Cambios principales:**
1. Nuevo tipo `CapturedSnapshot` extendiendo `PoseData`
2. Estados agregados:
   - `snapshotDescription: string` - Nombre del ejercicio
   - `showCaptureDialog: boolean` - Controla el diálogo
3. Funciones nuevas:
   - `handleOpenCaptureDialog()` - Abre diálogo con nombre sugerido
   - `handleCaptureSnapshot()` - Captura imagen y guarda snapshot
   - `handleDeleteSnapshot(index)` - Elimina snapshot específico
4. UI agregada:
   - Diálogo modal para ingresar descripción
   - Lista scrollable de snapshots con miniaturas
   - Botón de eliminar por snapshot
5. PDF mejorado:
   - Una página por snapshot
   - Imagen del esqueleto incluida
   - Mejor layout y formateo

**Líneas de código afectadas:** ~120 líneas nuevas/modificadas

---

## ⚡ **Ventajas de Esta Implementación**

### **Para el Médico:**
✅ Puede documentar múltiples ejercicios en una sola sesión
✅ Cada snapshot tiene contexto (nombre del ejercicio)
✅ Puede revisar visualmente los snapshots capturados
✅ Puede eliminar capturas incorrectas
✅ Informe PDF completo y profesional con imágenes

### **Para el Paciente:**
✅ No tiene que hacer nada extra
✅ La captura es instantánea
✅ Puede realizar los ejercicios a su ritmo

### **Para el Sistema:**
✅ Toda la captura es del lado del cliente (no consume ancho de banda)
✅ Las imágenes se generan en el navegador (canvas.toDataURL)
✅ El PDF se genera localmente (jsPDF)
✅ No requiere almacenamiento en servidor

---

## 🧪 **Cómo Probar la Nueva Funcionalidad**

### **Paso 1: Iniciar análisis postural**
1. Doctor abre modal de análisis postural
2. Inicia sesión
3. Paciente se conecta

### **Paso 2: Capturar primer snapshot**
1. Doctor espera a que el paciente haga una pose
2. Clic en "Capturar Snapshot (0)"
3. Diálogo se abre con "Ejercicio 1"
4. Cambiar a "Brazos arriba"
5. Clic en "Capturar" (o Enter)
6. ✅ Aparece en la lista con miniatura

### **Paso 3: Capturar más snapshots**
1. Indicar al paciente otro ejercicio
2. Repetir paso 2 con nombres diferentes:
   - "Brazos al frente"
   - "Inclinación lateral"
   - "Rotación de tronco"
   - "Flexión hacia adelante"

### **Paso 4: Revisar snapshots**
1. Verificar que la lista muestra los 5 snapshots
2. Ver miniaturas de cada uno
3. Si alguno está mal, clic en 🗑️ para eliminar

### **Paso 5: Generar PDF**
1. Clic en "Generar PDF"
2. El archivo se descarga automáticamente
3. Abrir PDF y verificar:
   - Página 1 con resumen
   - 5 páginas adicionales (una por snapshot)
   - Cada página con imagen + métricas

---

## 📝 **Ejemplo de Nombres de Ejercicios**

```
✅ Buenos nombres descriptivos:
- "Brazos levantados sobre cabeza"
- "Inclinación lateral izquierda"
- "Rotación de tronco a la derecha"
- "Flexión hacia adelante"
- "Postura de pie neutral"
- "Extensión de brazos al frente"

❌ Nombres poco útiles:
- "Ejercicio 1", "Ejercicio 2" (sin contexto)
- "Foto", "Captura" (no describe el ejercicio)
- Dejar vacío (se auto-completa pero no es descriptivo)
```

---

## 🚀 **Mejoras Futuras Posibles**

### **Corto plazo:**
- [ ] Agregar botón "Editar nombre" en snapshots ya capturados
- [ ] Permitir reordenar snapshots (drag & drop)
- [ ] Agregar notas del médico a cada snapshot

### **Mediano plazo:**
- [ ] Comparación lado a lado de dos snapshots
- [ ] Exportar imágenes individuales (PNG)
- [ ] Plantillas predefinidas de ejercicios comunes

### **Largo plazo:**
- [ ] Almacenar historial de evaluaciones por paciente
- [ ] Análisis comparativo entre sesiones
- [ ] IA para sugerir ejercicios correctivos

---

## 🎉 **Resultado Final**

Con esta implementación, el médico puede:

1. **Capturar 5 (o más) snapshots** durante una evaluación
2. **Nombrar cada ejercicio** de forma descriptiva
3. **Ver miniaturas** de lo capturado en tiempo real
4. **Eliminar capturas incorrectas** fácilmente
5. **Generar un PDF profesional** con:
   - Resumen general
   - Una página por cada ejercicio
   - Imagen del esqueleto en cada posición
   - Métricas completas por ejercicio
   - Pie de página con numeración

**¡Todo en una sola sesión de análisis postural!** 📊✨

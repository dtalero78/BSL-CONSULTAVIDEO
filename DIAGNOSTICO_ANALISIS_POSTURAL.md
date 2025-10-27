# 🩺 Guía de Diagnóstico - Análisis Postural

## ✅ Mejoras Implementadas

Se implementaron **3 mejoras críticas** para resolver el problema donde el esqueleto se ve en el paciente pero no en el doctor:

### 1. 📊 **Logging Detallado**
Se agregaron logs en cada etapa del proceso para identificar exactamente dónde falla:

```
[Doctor] 📊 Received pose data: { landmarksCount: 33, timestamp: ... }
[Canvas] 🎨 Attempting to draw: { hasPoseData: true, landmarksCount: 33 }
[Canvas] ✅ Successfully drew skeleton with 33 landmarks
```

### 2. 🔒 **Validación de Conexión**
El sistema ahora valida que Socket.io esté conectado ANTES de permitir abrir el modal:

- Si el doctor intenta abrir el análisis antes de que Socket.io esté listo, recibe una alerta
- Previene intentar iniciar sesiones sin conexión establecida

### 3. 👁️ **Indicador Visual "Esperando Primer Frame"**
Se agregó un nuevo estado visual que muestra:

```
🔄 Cargando Análisis...
   Esperando datos del paciente
   El paciente está activando su cámara y cargando el modelo de IA
```

Esto aparece **después** de que el paciente se conecta pero **antes** de que llegue el primer frame con datos de pose.

---

## 🔍 Cómo Diagnosticar Problemas

### **Paso 1: Abrir la Consola del Navegador**

En ambos navegadores (doctor y paciente), presiona `F12` para abrir las DevTools.

### **Paso 2: Iniciar el Análisis Postural**

El doctor hace clic en el botón de "Análisis Postural".

### **Paso 3: Revisar los Logs**

#### **En el PACIENTE (busca estos mensajes):**

✅ **Conexión exitosa:**
```
[Postural Analysis] Connected to Socket.io
[Postural Analysis] Patient attempting to join session: consulta-xyz
[Postural Analysis] Session joined
[Postural Analysis] Session activated by doctor
```

✅ **Cámara y análisis activos:**
```
[Postural Analysis Patient] Accediendo a cámara...
[Postural Analysis Patient] Cargando modelo de análisis...
[Postural Analysis Patient] Analizando postura...
```

❌ **Si ves errores como:**
```
[Postural Analysis] Connection error: ...
[Postural Analysis Patient] Error: No se pudo acceder a la cámara
```
→ **Problema**: Permisos de cámara o conexión Socket.io fallida

---

#### **En el DOCTOR (busca estos mensajes):**

✅ **Conexión y sesión creadas:**
```
[Postural Analysis] Connected to Socket.io
[Postural Analysis] ✅ Starting session: consulta-xyz
[Postural Analysis] Session created
[Postural Analysis] Patient connected
```

✅ **Datos llegando correctamente:**
```
[Doctor] 📊 Received pose data: {
  landmarksCount: 33,
  timestamp: 12345678,
  hasMetrics: true,
  hasPosture: true,
  hasJoints: true,
  hasSymmetry: true
}
```

✅ **Canvas dibujando correctamente:**
```
[Canvas] 🎨 Attempting to draw: {
  hasCanvas: true,
  hasPoseData: true,
  landmarksCount: 33,
  timestamp: 12345678
}
[Canvas] ✅ Successfully drew skeleton with 33 landmarks
```

---

### **Interpretación de Problemas Comunes**

| Síntoma | Causa Probable | Solución |
|---------|----------------|----------|
| **No aparece `[Doctor] 📊 Received pose data`** | Socket.io no está retransmitiendo datos | Verificar que el `roomName` sea idéntico en ambos lados. Revisar logs del servidor backend. |
| **Aparece `[Doctor] 📊 Received pose data` pero NO aparece `[Canvas] 🎨 Attempting to draw`** | React no está re-renderizando el canvas | El estado `latestPoseData` puede no estar actualizándose. Verificar que no haya errores en la consola. |
| **Aparece `[Canvas] ⚠️ Missing data for drawing`** | Los datos de pose están vacíos o mal formados | El paciente puede estar en un lugar oscuro o muy lejos de la cámara. Landmarks tienen `visibility < 0.5`. |
| **Aparece `[Canvas] ❌ Failed to get 2D context`** | El canvas no se renderizó correctamente | Problema de React/DOM. Recargar la página. |
| **Doctor ve "Cargando Análisis..." por más de 10 segundos** | El paciente no está enviando datos | Verificar logs del paciente. Puede haber error en MediaPipe o cámara bloqueada. |

---

## 🚀 Flujo Esperado (Todo Funciona)

### **Timeline Normal:**

```
T+0s:   Doctor hace clic en "Análisis Postural"
        → Modal se abre
        → Doctor ve "Análisis Postural No Iniciado"

T+1s:   Doctor hace clic en "Iniciar Análisis"
        → [Doctor] ✅ Starting session
        → [Doctor] Session created
        → Doctor ve "Esperando Paciente..."

T+2s:   Paciente detecta la sesión activa
        → [Patient] Session activated by doctor
        → [Patient] Accediendo a cámara...
        → Doctor ve "Paciente Conectado" + "Cargando Análisis..."

T+5s:   Paciente carga modelo MediaPipe
        → [Patient] Cargando modelo de análisis...

T+7s:   Primer frame detectado y enviado
        → [Patient] Analizando postura...
        → [Doctor] 📊 Received pose data (landmarksCount: 33)
        → [Canvas] ✅ Successfully drew skeleton

T+8s:   Doctor ve el esqueleto en el canvas ✅
        → Datos actualizándose cada 66ms (15 FPS)
```

**Duración esperada desde "Iniciar Análisis" hasta ver el esqueleto: 6-8 segundos**

---

## 🛠️ Soluciones a Problemas Específicos

### **Problema 1: Socket.io No Conecta**

**Síntoma:** Doctor ve alerta "El sistema de análisis postural aún no está conectado"

**Solución:**
1. Esperar 2-3 segundos después de entrar a la sala
2. Verificar que el backend esté corriendo (`http://localhost:3000/health`)
3. Verificar que no haya problemas de CORS en producción

---

### **Problema 2: Paciente No Envía Datos**

**Síntoma:** Doctor ve "Cargando Análisis..." indefinidamente

**Solución (Paciente):**
1. Verificar que dio permisos a la cámara
2. Recargar la página del paciente
3. Revisar consola del paciente para errores de MediaPipe

---

### **Problema 3: Canvas en Blanco (Datos Llegan pero No Se Dibujan)**

**Síntoma:** Logs muestran `[Doctor] 📊 Received pose data` pero canvas está negro

**Solución:**
1. Verificar que `landmarksCount` sea 33 (no 0)
2. Verificar que no hay errores `[Canvas] ❌` en consola
3. Si el paciente está muy lejos o en oscuridad, los landmarks pueden tener `visibility < 0.5` y no se dibujan

---

## 📋 Checklist de Verificación

Antes de reportar un bug, verificar:

- [ ] Backend está corriendo (`npm start` en `/backend`)
- [ ] Frontend está corriendo (`npm run dev` en `/frontend`)
- [ ] Ambos navegadores (doctor y paciente) tienen consola abierta (F12)
- [ ] El doctor ve `[Postural Analysis] Connected to Socket.io`
- [ ] El paciente ve `[Postural Analysis] Connected to Socket.io`
- [ ] El paciente dio permisos a la cámara
- [ ] El `roomName` es idéntico en ambos lados
- [ ] No hay errores de red (ERR_CONNECTION_REFUSED) en consola

---

## 🎯 Próximos Pasos (Si el Problema Persiste)

Si después de revisar todos los logs el problema continúa:

1. **Copiar todos los logs** de la consola del doctor y del paciente
2. **Tomar screenshots** del modal del doctor cuando está en "Cargando Análisis..."
3. **Reportar** con la información recopilada

---

## ⚡ Cambios en el Código

### **Archivos Modificados:**

1. **`frontend/src/hooks/usePosturalAnalysis.ts`**
   - Agregado estado `hasReceivedFirstFrame`
   - Agregados logs detallados en evento `pose-data-update`
   - Reset de flag al iniciar/terminar sesión

2. **`frontend/src/components/VideoRoom.tsx`**
   - Validación de `isPosturalAnalysisConnected` antes de abrir modal
   - Paso de prop `hasReceivedFirstFrame` al modal

3. **`frontend/src/components/PosturalAnalysisModal.tsx`**
   - Nueva prop `hasReceivedFirstFrame`
   - Nuevo estado visual "Cargando Análisis..."

4. **`frontend/src/components/PosturalAnalysisCanvas.tsx`**
   - Logs detallados al intentar dibujar
   - Warnings si faltan datos
   - Confirmación cuando dibuja exitosamente

### **NO se modificó:**
- Lógica de transmisión de video de Twilio ✅
- Servicio backend de Socket.io ✅
- Detección de pose con MediaPipe ✅

---

**¡La videollamada sigue funcionando exactamente igual!** Solo se agregaron mejoras de diagnóstico y UI para el análisis postural. 🎉

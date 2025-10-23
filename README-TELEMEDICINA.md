# 🏥 Examen Osteomuscular Virtual - Telemedicina

Sistema de telemedicina para análisis postural en tiempo real entre médicos y pacientes.

## 🚀 Funcionalidad Implementada

### ✅ Lo que funciona ahora:

1. **Sistema de Streaming en Tiempo Real**
   - Conexión WebSocket entre paciente y médico
   - Transmisión de datos de pose (landmarks) en tiempo real
   - Visualización del esqueleto del paciente en pantalla del médico
   - Sistema de códigos de sesión para conectar paciente-médico

2. **Interfaz del Médico** (`/medico`)
   - Creación de sesión con código único
   - Visualización en tiempo real del esqueleto del paciente
   - Métricas médicas calculadas en tiempo real
   - Controles para enviar instrucciones al paciente
   - Sistema de capturas para análisis
   - Generación de informes médicos

3. **Interfaz del Paciente** (`/paciente`)
   - Conexión usando código de sesión del médico
   - Activación automática de cámara
   - Análisis de pose con MediaPipe
   - Recepción de instrucciones del médico
   - Transmisión de datos al médico

4. **Servidor Node.js con Socket.io**
   - Gestión de sesiones médico-paciente
   - Sincronización en tiempo real
   - Sistema de rooms por código de sesión

## 🔄 Cómo usar el sistema:

### 1. Iniciar el servidor:
```bash
npm start
```

### 2. Acceder a las interfaces:
- **Médico**: http://localhost:3000/medico
- **Paciente**: http://localhost:3000/paciente

### 3. Flujo de trabajo:

#### Para el Médico:
1. Abrir http://localhost:3000/medico
2. Ingresar su nombre y especialidad
3. Hacer clic en "🚀 Crear Sesión"
4. Compartir el código de 6 letras con el paciente
5. Esperar a que el paciente se conecte
6. Iniciar el examen y enviar instrucciones
7. Visualizar métricas en tiempo real
8. Capturar momentos importantes
9. Generar informe al finalizar

#### Para el Paciente:
1. Abrir http://localhost:3000/paciente
2. Ingresar su nombre y edad
3. Escribir el código de sesión proporcionado por el médico
4. Hacer clic en "🔗 Conectar con Médico"
5. Permitir acceso a la cámara
6. Seguir las instrucciones del médico
7. Mantenerse en posición durante el análisis

## 📊 Características Principales:

### Streaming de Datos:
- **FPS**: 15-30 frames por segundo
- **Latencia**: < 200ms (local)
- **Datos transmitidos**: 33 landmarks de pose + métricas calculadas

### Métricas Médicas:
- Alineación cervical
- Inclinación pélvica
- Desviación lateral
- Ángulos articulares
- Simetría corporal
- Balance general

### Controles del Médico:
- Instrucciones rápidas predefinidas
- Instrucciones personalizadas
- Cuenta regresiva para posicionamiento
- Captura de snapshots
- Notas médicas
- Generación de informes

## 🛠️ Tecnologías Utilizadas:

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Análisis de Pose**: MediaPipe Pose Landmarker
- **Comunicación**: Socket.io (WebSockets)
- **Servidor**: Node.js + Express
- **Video**: WebRTC (preparado para futura implementación)

## 📱 Compatibilidad:

- **Navegadores**: Chrome, Firefox, Safari, Edge (modernos)
- **Dispositivos**: Desktop, laptop, tablet con cámara
- **Requisitos**: Cámara web, conexión a Internet, HTTPS (para producción)

## 🔧 Configuración de Desarrollo:

```bash
# Instalar dependencias
npm install

# Desarrollo con auto-reload
npm run dev

# Producción
npm start
```

## 🚨 Consideraciones de Seguridad:

### Implementado:
- Conexiones locales seguras
- Validación de códigos de sesión
- Limpieza automática de sesiones inactivas
- No persistencia de datos (privacidad)

### Pendiente para Producción:
- HTTPS obligatorio
- Autenticación de médicos
- Encriptación de datos
- Logs de auditoría
- Backup de informes

## 📋 Estado del Proyecto:

### ✅ Completado:
- [x] Servidor de telemedicina con Socket.io
- [x] Interfaz del paciente con envío de datos
- [x] Interfaz del médico con visualización
- [x] Sistema de códigos de sesión
- [x] Análisis de pose en tiempo real
- [x] Métricas médicas
- [x] Sistema de instrucciones
- [x] Generación de informes

### 🔄 En desarrollo:
- [ ] Streaming de video con WebRTC
- [ ] Grabación de sesiones
- [ ] Base de datos para historiales
- [ ] Autenticación y autorización

### 🎯 Próximos pasos:
- [ ] Pruebas con múltiples usuarios
- [ ] Optimización de rendimiento
- [ ] Interfaz móvil responsive
- [ ] Integración con sistemas de salud

## 🎮 Controles y Shortcuts:

### Paciente:
- **Audio ON/OFF**: Alternar instrucciones por voz
- **Parada de Emergencia**: Desconectar inmediatamente
- **Probar Cámara**: Verificar funcionamiento

### Médico:
- **Instrucciones Rápidas**: Botones predefinidos
- **Cuenta Regresiva**: Dar tiempo al paciente para posicionarse
- **Capturar**: Guardar momento para análisis
- **Generar Informe**: Exportar resultados completos

## 📊 Ejemplo de Uso:

```
1. Dr. García abre /medico y crea sesión → Código: ABC123
2. Paciente Juan abre /paciente e ingresa ABC123
3. ✅ Conexión establecida
4. Dr. García ve el esqueleto de Juan en tiempo real
5. Dr. García envía: "Levante ambos brazos"
6. Juan recibe instrucción por audio y visual
7. Dr. García ve las métricas actualizarse
8. Dr. García captura el momento para análisis
9. Al finalizar, genera informe médico
```

## 🏗️ Arquitectura del Sistema:

```
[Paciente - Casa]     [Servidor Node.js]     [Médico - Consultorio]
     │                        │                       │
   Cámara ────WebSocket───► Socket.io ◄───WebSocket──── Pantalla
     │                        │                       │
 MediaPipe                 Gestión de                Análisis
 Analysis                   Sesiones                 Visual
     │                        │                       │
   Pose Data ──────────────► Relay ──────────────► Métricas
```

## 🎯 Beneficios del Sistema:

### Para Médicos:
- Análisis postural remoto
- Métricas objetivas automáticas
- Reducción de contacto físico
- Documentación digital
- Mayor eficiencia en consultas

### Para Pacientes:
- Comodidad del hogar
- Reducción de desplazamientos
- Análisis no invasivo
- Feedback visual inmediato
- Acceso a especialistas remotos

---

**¡El sistema de telemedicina está listo para ser usado!** 🎉

Abra dos ventanas de navegador:
1. http://localhost:3000/medico (para el médico)
2. http://localhost:3000/paciente (para el paciente)

Y comience a realizar exámenes posturales remotos.
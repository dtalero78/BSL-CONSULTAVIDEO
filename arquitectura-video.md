# Arquitectura de Conexión de Video Twilio

Este documento detalla la arquitectura de conexión de video que permite una conexión rápida y eficiente entre médico y paciente.

## Resumen de Factores de Velocidad

| Factor | Impacto en Velocidad | Implementación |
|--------|---------------------|----------------|
| Tipo de sala `peer-to-peer` | Alto | Conexión directa sin servidor media |
| Token pre-generado en backend | Medio | 1 sola llamada HTTP antes de conectar |
| Resolución moderada 640x480 | Medio | Menos tiempo de negociación ICE |
| NetworkQuality básico | Bajo | Menos overhead de monitoreo |
| Sin pre-conexión de sala | Alto | Sala se crea al solicitar token |

## 1. Flujo de Conexión Optimizado

```
┌─────────────┐    1. POST /api/video/token     ┌─────────────┐
│   Frontend  │ ──────────────────────────────> │   Backend   │
│   (React)   │                                  │  (Express)  │
└─────────────┘                                  └─────────────┘
       │                                                │
       │                                                │ 2. Crear sala peer-to-peer
       │                                                │    (si no existe)
       │                                                v
       │                                         ┌─────────────┐
       │                                         │   Twilio    │
       │                                         │   Cloud     │
       │                                         └─────────────┘
       │                                                │
       │         3. JWT Token + VideoGrant              │
       │ <──────────────────────────────────────────────┘
       │
       │ 4. Video.connect(token, options)
       │
       v
┌─────────────────────────────────────────────────────────────┐
│                    Twilio Video SDK                          │
│  - Establece conexión WebRTC                                │
│  - Negocia ICE candidates                                   │
│  - Captura media local (cámara/micrófono)                  │
│  - Conecta a la sala                                        │
└─────────────────────────────────────────────────────────────┘
```

## 2. Configuración del Backend (Crítico para Velocidad)

### 2.1 Generación de Token con Sala peer-to-peer

```typescript
// backend/src/controllers/video.controller.ts (líneas 14-56)

async generateToken(req: Request, res: Response): Promise<void> {
  const { identity, roomName } = req.body;

  // CLAVE: Crear sala como peer-to-peer ANTES de generar el token
  try {
    await twilioService.createRoom(roomName, 'peer-to-peer');
    console.log(`Room created as peer-to-peer: ${roomName}`);
  } catch (error: any) {
    // Si ya existe (error 53113), continuar
    if (error.code === 53113) {
      console.log(`Room already exists: ${roomName}`);
    }
  }

  // Generar token JWT con VideoGrant
  const tokenData = twilioService.generateVideoToken({
    identity,
    roomName,
  });

  res.status(200).json({ success: true, data: tokenData });
}
```

### 2.2 Por qué `peer-to-peer` es más rápido

| Tipo de Sala | Latencia | Conexión | Costo |
|--------------|----------|----------|-------|
| `peer-to-peer` | ~100-300ms | Directa entre participantes | ~62% más barato |
| `group` | ~300-800ms | A través de servidor media Twilio | Más caro |
| `group-small` | ~200-500ms | Híbrido | Intermedio |

**Razón técnica**: En `peer-to-peer`, los streams de video/audio van directamente entre los navegadores de los participantes sin pasar por servidores intermedios de Twilio.

### 2.3 Generación del Token JWT

```typescript
// backend/src/services/twilio.service.ts (líneas 34-59)

generateVideoToken({ identity, roomName }: TokenOptions): TokenResponse {
  const token = new AccessToken(
    twilioConfig.accountSid,
    twilioConfig.apiKeySid,
    twilioConfig.apiKeySecret,
    {
      identity,
      ttl: 3600, // Token válido por 1 hora
    }
  );

  // VideoGrant específico para la sala
  const videoGrant = new VideoGrant({
    room: roomName,
  });

  token.addGrant(videoGrant);

  return {
    token: token.toJwt(),
    identity,
    roomName,
  };
}
```

## 3. Configuración del Frontend (Crítico para Velocidad)

### 3.1 Opciones de Conexión Optimizadas

```typescript
// frontend/src/hooks/useVideoRoom.ts (líneas 124-132)

const connectedRoom = await Video.connect(token, {
  name: roomName,
  audio: true,
  video: { width: 640, height: 480 },  // Resolución moderada = conexión más rápida
  networkQuality: {
    local: 1,   // Nivel básico de monitoreo
    remote: 1,  // Reduce overhead
  },
});
```

### 3.2 Desglose de Opciones y su Impacto

| Opción | Valor | Impacto en Velocidad |
|--------|-------|---------------------|
| `video.width/height` | 640x480 | Menor que 720p/1080p = negociación ICE más rápida |
| `networkQuality.local` | 1 | Monitoreo básico, menos CPU |
| `networkQuality.remote` | 1 | Menos datos de calidad intercambiados |
| `audio: true` | booleano | Más rápido que objeto con constraints |

### 3.3 Lo que NO se usa (y acelera la conexión)

```typescript
// Opciones que RALENTIZAN la conexión (no usadas):
{
  // preferredVideoCodecs: ['VP8', 'H264'],  // Auto-negociación es más rápida
  // bandwidthProfile: { ... },              // Overhead de configuración
  // dominantSpeaker: true,                  // Procesamiento adicional
  // maxAudioBitrate: 16000,                 // Constraints adicionales
  // video: { frameRate: 30 },               // Constraints estrictos
}
```

## 4. Patrón de Attachment de Tracks (Evita Errores de Renderizado)

### 4.1 Patrón de Dos useEffect (Crítico)

```typescript
// frontend/src/components/Participant.tsx

// useEffect 1: Maneja el estado del track
useEffect(() => {
  const trackSubscribed = (track) => {
    if (track.kind === 'video') {
      setVideoTrack(track);  // Solo actualiza estado
    }
  };

  // Suscribirse a eventos de tracks
  participant.on('trackSubscribed', trackSubscribed);

  // Procesar tracks existentes
  participant.tracks.forEach((publication) => {
    if (publication.isSubscribed && publication.track) {
      trackSubscribed(publication.track);
    }
  });
}, [participant]);

// useEffect 2: Attach cuando ref Y track están listos
useEffect(() => {
  if (videoTrack && videoRef.current) {
    videoTrack.attach(videoRef.current);

    return () => {
      videoTrack.detach().forEach((el) => el.remove());
    };
  }
}, [videoTrack]); // Dependencia solo del track
```

### 4.2 Por qué este patrón es necesario

```
Problema común (conexión lenta o fallida):
─────────────────────────────────────────
1. Track llega antes que el ref del DOM esté listo
2. Se intenta attach() a null → Error
3. Usuario ve pantalla negra
4. Retry manual → Lento

Solución con dos useEffect:
───────────────────────────
1. useEffect 1: Captura el track en estado
2. React renderiza el <video> element
3. useEffect 2: Se ejecuta cuando AMBOS están listos
4. attach() exitoso → Video inmediato
```

## 5. Diferencias entre Participantes Locales y Remotos

### 5.1 Eventos de Track

```typescript
// frontend/src/components/Participant.tsx (líneas 106-122)

if (!isLocal) {
  // Participantes REMOTOS: eventos de suscripción
  participant.on('trackSubscribed', trackSubscribed);
  participant.on('trackUnsubscribed', trackUnsubscribed);
} else {
  // Participante LOCAL: eventos de publicación
  participant.on('trackPublished', (publication) => {
    if (publication.track) {
      trackSubscribed(publication.track);
    }
  });
}
```

### 5.2 Por qué la distinción importa para velocidad

| Tipo | Evento | Timing |
|------|--------|--------|
| Local | `trackPublished` | Inmediato (ya tenemos el track) |
| Remoto | `trackSubscribed` | Después de negociación WebRTC |

## 6. Optimizaciones de Red y Cleanup

### 6.1 Manejo de Cierre de Ventana

```typescript
// frontend/src/hooks/useVideoRoom.ts (líneas 247-260)

useEffect(() => {
  const handleBeforeUnload = () => {
    if (room) {
      // sendBeacon garantiza envío aunque la ventana se cierre
      const url = `${apiBaseUrl}/api/video/events/participant-disconnected`;
      const data = JSON.stringify({ roomName, identity });

      navigator.sendBeacon(url, new Blob([data], { type: 'application/json' }));
      room.disconnect();
    }
  };

  window.addEventListener('beforeunload', handleBeforeUnload);

  return () => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    if (room) room.disconnect();
  };
}, [room]);
```

### 6.2 Por qué sendBeacon y no fetch

```
fetch() en beforeunload:
────────────────────────
- Navegador puede cancelar la request
- Asíncrono, no garantiza completarse
- Puede bloquear el cierre

navigator.sendBeacon():
───────────────────────
- Síncrono y garantizado
- No bloquea el cierre de ventana
- Diseñado específicamente para este caso
```

## 7. Servicio de API Simplificado

```typescript
// frontend/src/services/api.service.ts (líneas 22-29)

async getVideoToken(identity: string, roomName: string): Promise<string> {
  const response = await this.client.post('/api/video/token', {
    identity,
    roomName,
  });

  return response.data.data.token;  // Solo retorna el token, no todo el objeto
}
```

**Simplicidad = Velocidad**: Una sola llamada HTTP, respuesta mínima.

## 8. Checklist para Depurar Conexiones Lentas

### 8.1 Verificar en Backend

- [ ] ¿Se está creando la sala como `peer-to-peer`?
- [ ] ¿El token tiene TTL adecuado (3600 segundos)?
- [ ] ¿Las credenciales de Twilio son de producción (no test)?
- [ ] ¿El servidor tiene latencia baja a Twilio? (verificar región)

### 8.2 Verificar en Frontend

- [ ] ¿Se usa `Video.connect()` directamente (no `createLocalTracks` primero)?
- [ ] ¿La resolución de video es 640x480 o menor?
- [ ] ¿`networkQuality` está en nivel 1?
- [ ] ¿Se está usando el patrón de dos useEffect para attachment?

### 8.3 Verificar en Red

- [ ] ¿El usuario tiene WebRTC habilitado?
- [ ] ¿Hay firewall bloqueando puertos UDP (TURN/STUN)?
- [ ] ¿La conexión HTTPS es válida?

## 9. Errores Comunes que Causan Lentitud

### 9.1 Crear tracks ANTES de conectar

```typescript
// MAL - Lento (doble negociación)
const localTracks = await Video.createLocalTracks();
const room = await Video.connect(token, { tracks: localTracks });

// BIEN - Rápido (una sola negociación)
const room = await Video.connect(token, { audio: true, video: true });
```

### 9.2 Usar sala `group` innecesariamente

```typescript
// MAL - Para 2 participantes
await twilioService.createRoom(roomName, 'group');

// BIEN - Conexión directa
await twilioService.createRoom(roomName, 'peer-to-peer');
```

### 9.3 Resolución alta innecesaria

```typescript
// MAL - Negociación lenta
video: { width: 1920, height: 1080, frameRate: 30 }

// BIEN - Rápido y suficiente para telemedicina
video: { width: 640, height: 480 }
```

## 10. Arquitectura de URLs y Routing

### 10.1 Patrones de URL

```
/patient/:roomName?nombre=X&apellido=Y&doctor=Z
  → Paciente entra con datos pre-llenados desde WhatsApp

/doctor/:roomName?doctor=CODE
  → Médico entra a sala específica desde panel Wix

/doctor
  → Médico crea sala manual (desarrollo/pruebas)
```

### 10.2 Por qué URLs con parámetros

- El roomName está en la URL → No requiere lookup adicional
- Parámetros de query → Frontend los lee instantáneamente
- Sin llamadas extra al backend antes de conectar

## 11. Métricas de Referencia

| Métrica | Valor Esperado | Si es Mayor |
|---------|---------------|-------------|
| Tiempo obtener token | < 200ms | Revisar latencia servidor |
| Tiempo conectar sala | < 1-2s | Revisar tipo de sala |
| Tiempo ver video remoto | < 3-5s | Revisar patrón de attachment |
| Tiempo total (click → video) | < 5-7s | Revisar todas las capas |

## 12. Resumen de Implementación Mínima

```typescript
// Backend: Un solo endpoint
app.post('/api/video/token', async (req, res) => {
  const { identity, roomName } = req.body;

  // 1. Crear sala peer-to-peer
  try {
    await twilio.video.v1.rooms.create({
      uniqueName: roomName,
      type: 'peer-to-peer',
    });
  } catch (e) { /* sala ya existe */ }

  // 2. Generar token
  const token = new AccessToken(SID, KEY_SID, KEY_SECRET, { identity });
  token.addGrant(new VideoGrant({ room: roomName }));

  res.json({ token: token.toJwt() });
});

// Frontend: Conexión directa
const token = await api.getVideoToken(identity, roomName);
const room = await Video.connect(token, {
  name: roomName,
  audio: true,
  video: { width: 640, height: 480 },
});
```

---

## Conclusión

La velocidad de conexión se logra por:

1. **Sala `peer-to-peer`**: Conexión directa sin servidor media intermedio
2. **Token en una sola llamada**: Sin pre-autenticación ni múltiples requests
3. **Resolución moderada**: Menos tiempo de negociación ICE
4. **Sin crear tracks previos**: `Video.connect()` hace todo en una operación
5. **Patrón de attachment correcto**: Video visible inmediatamente cuando está listo

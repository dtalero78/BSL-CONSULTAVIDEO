# Cómo montamos Transcripción + Calidad (para replicar en BODYTECH)

Guía para el agente que migra BODYTECH. Explica **cómo quedó en BSL** y **qué cambia
para BODYTECH**, que es más simple por quedarse en DO.

---

## 0. La diferencia de arquitectura que lo cambia todo

**BSL quedó partido en DOS apps** (por accidente histórico: el video se movió a AWS Fargate):

```
bsl-plataforma (DO, tiene el módulo Calidad)  ──HTTP + token──►  consulta-video (AWS, rol IAM)
     └ pide "dame el link del video" / "dame el transcript"          └ firma S3 / llama a Transcribe
```

Por eso en BSL hubo que inventar un **token interno compartido** (`X-Internal-Token`) para que
una app le hable a la otra, y exponer endpoints `/api/video/recordings/:sala` y
`/api/video/transcribe/:sala`.

**BODYTECH NO necesita nada de eso.** Al quedarse en DO, el backend de video y el módulo de
Calidad son **la misma app**. Entonces:

- ❌ NO hay token interno entre apps.
- ❌ NO hay endpoints `/recordings` ni `/transcribe` que exponer.
- ✅ El mismo backend que crea las reuniones Chime **firma el S3 y llama a Transcribe directo**,
  con las **access keys de AWS** que ya vas a poner para Chime.
- ✅ El link del video se protege con **el login+rol que BODYTECH ya tiene**, no con un token nuevo.

> **Regla:** todo lo que en BSL fue "una app le pide a la otra por HTTP", en BODYTECH es
> "una llamada de función dentro del mismo backend". Copia la LÓGICA, no el split de dos apps.

---

## 1. Transcripción — cómo funciona (y por qué Transcribe y no Whisper)

Antes: descargar MP4 → `ffmpeg` saca el audio → Whisper. Con Chime el MP4 ya está en S3, así que
**Amazon Transcribe lo lee directo** (sin descargar, sin ffmpeg) **y separa hablantes**
(médico/paciente), que Whisper no daba.

La receta (en BSL vive en `backend/src/services/video/transcribe.service.ts`):

1. **Nombre de job determinístico por sala** → idempotencia sin tabla:
   `bsl-tx-<roomName>` saneado a `[0-9a-zA-Z._-]`, máx 200 chars.
2. `getOrStartTranscription(roomName)`:
   - `GetTranscriptionJob(jobName)`.
   - Si **no existe** → buscar el `.mp4` en S3 (prefijo `recordings/<meetingId>/`). Si aún no hay
     MP4 → devolver `no_recording`. Si hay → `StartTranscriptionJob` con:
     - `Media.MediaFileUri = s3://<bucket>/<key-del-mp4>`
     - `LanguageCode = 'es-US'`  (español latino; no existe es-CO)
     - `MediaFormat = 'mp4'`
     - `Settings = { ShowSpeakerLabels: true, MaxSpeakerLabels: 2 }`
     - **SIN `OutputBucketName`** → Transcribe guarda el resultado en su propio bucket y te da una
       **URL prefirmada** (`Transcript.TranscriptFileUri`). Así **no necesitas permisos S3 de
       salida**, solo de lectura del MP4 (que ya tienes).
     - devolver `in_progress`.
   - Si `QUEUED`/`IN_PROGRESS` → `in_progress`.
   - Si `FAILED` → `failed` + razón.
   - Si `COMPLETED` → bajar el JSON de `TranscriptFileUri` (HTTPS simple, sin auth) y **formatear
     en turnos**: `Hablante 1: ... / Hablante 2: ...` (parsear `results.speaker_labels` +
     `results.items`).
3. Es **por sondeo**: el que llama pega cada X segundos hasta `completed` o `failed`. Un job de
   ~7 min tardó **~22 segundos**.

**Permisos AWS** (en BSL, `infrastructure/aws/iam.tf`): al rol/usuario le basta
`transcribe:StartTranscriptionJob` y `transcribe:GetTranscriptionJob`. Lectura del MP4: ya la
cubre el `s3:*` sobre el bucket. Salida: gestionada por Transcribe (nada extra).

### Adaptación BODYTECH
- Corre esta misma lógica **dentro del backend de BODYTECH** usando el cliente
  `@aws-sdk/client-transcribe` autenticado con las **access keys** (no rol IAM).
- Las keys necesitan las dos acciones `transcribe:*` de arriba + lectura del bucket.
- Alternativa válida para arrancar: **quedarte con Whisper** (BODYTECH ya lo tiene). Transcribe es
  mejor (sin ffmpeg + hablantes), pero es código nuevo. Es una decisión, no una obligación.

---

## 2. Calidad (lado lectura) — cómo se enganchó

El módulo de Calidad **no se reescribió**: se le agregó una **rama por origen de grabación**. Todo
lo de después (contexto del formulario + evaluación con Anthropic) quedó **idéntico**: lo único que
cambia es **de dónde sale el `transcript` (string)**.

En BSL (`bsl-plataforma/src/routes/calidad.js`):

1. **Distinguir el origen** por el `room_sid` de `video_sessions`:
   - Twilio → SID que empieza por `RM…`.
   - Chime → un UUID (no empieza por `RM`).
   `resolverGrabacionParaEvaluar(ordenId)` devuelve `{ tipo: 'chime'|'twilio', roomName | compositionSid }`.
2. **Ver el video** (`GET /session/:ordenId`): si es Chime, resolver el link firmado y mandarlo como
   `videoUrl`; el front pinta `<video src=videoUrl>` directo. Si es Twilio, el flujo de composición
   de siempre.
3. **Evaluar** (`POST /evaluar` → `procesarEvaluacion`): si es Chime, en vez de
   descargar+ffmpeg+Whisper, **obtener el transcript** y seguir igual (estado `evaluando` →
   Anthropic). Si es Twilio, intacto.
4. El estado real de la grabación se refleja así: `no_recording` / `in_progress` (procesando) /
   `completed` / `failed` → mensajes al usuario.

### Adaptación BODYTECH
- BODYTECH **ya tiene** Calidad leyendo composiciones de Twilio → **agrega la rama Chime/S3**, igual
  que aquí. NO es "desde cero".
- Como es la misma app: `obtenerUrlGrabacionChime` y `obtenerTranscriptChime` **no son llamadas HTTP
  a otra app**, son funciones locales que firman S3 / llaman Transcribe con las access keys.
- **Protege el link del video** con el login+rol de BODYTECH. (En BSL el endpoint estaba abierto —
  es historia clínica — y hubo que taparlo con token; tú te ahorras eso.)

---

## 3. Checklist para BODYTECH (orden sugerido)

1. Access keys de AWS (usuario acotado) con: Chime Meetings + Chime Media Pipelines + `s3:*` sobre el
   bucket de grabaciones + `transcribe:Start/GetTranscriptionJob`. Guárdalas como env vars en DO.
2. Bucket S3 de grabaciones con **ACLs habilitadas (BucketOwnerPreferred)** + **bucket policy** para
   `mediapipelines.chime.amazonaws.com`. (Sin esto la grabación falla con un error engañoso de S3.)
3. Service-linked role de Chime Media Pipelines: si BODYTECH usa **la misma cuenta AWS que BSL**, ya
   existe → **no lo recrees**.
4. Grabación → S3 (copiar de BSL `chime-recording.service`), **con los dos fixes**: concatenar al
   colgar aunque se haya reiniciado el servidor, y persistir `sala→meetingId` en Postgres (si no, la
   sala se parte en varias reuniones — fue el peor bug).
5. Transcripción: portar `transcribe.service` al backend de BODYTECH (o quedarte con Whisper).
6. Calidad: agregar la rama Chime en el "ver video" y en "evaluar". Proteger el link con el login
   existente.
7. Probar con **dos personas reales** una consulta completa: grabar → ver el MP4 → evaluar →
   transcript con hablantes → puntaje de Anthropic.

---

## 4. Detalles finos que costaron tiempo en BSL

- **Job determinístico** = idempotencia gratis. No hace falta tabla de jobs; `GetTranscriptionJob`
  primero, y si no existe lo creas.
- **Sin `OutputBucketName`** → te ahorras permisos y policy de salida; lees por URL prefirmada.
- `es-US`, no `es-ES` ni `es-CO`.
- `node-fetch v3` **ya no acepta `timeout`**: usa `AbortSignal.timeout(ms)` o una petición colgada
  deja el panel cargando para siempre.
- El transcript con hablantes mejora la evaluación de Anthropic sin cambiarle nada al agente: solo
  llega el texto ya atribuido a "Hablante 1/2".

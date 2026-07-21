# Playbook: migrar una app de video-consulta de DigitalOcean → AWS

Guía reutilizable basada en la migración de **BSL Consulta Video** (medico-bsl.com).
El objetivo es repetirla para apps similares (p. ej. BODYTECH-CONSULTA) con el mínimo
de sorpresas. La parte más valiosa es **"Gotchas & soluciones"** — errores reales que
ya pagamos.

> Complementa a `infrastructure/aws/README.md` (runbook operativo del stack Terraform).

---

## 1. Qué se migró y qué NO

| Área | Antes (DO) | Después (AWS) |
|---|---|---|
| **Hosting** | DO App Platform (1 contenedor) | **ECS Fargate + ALB** (1 tarea) |
| **Video** | Twilio Video | **Amazon Chime SDK** |
| **Grabación** | Twilio compositions | **Chime Media Pipelines → S3** (MP4) |
| **Fondo/blur** | @twilio/video-processors | Chime BackgroundReplacement (a 640×360) |
| **Transcripción** | OpenAI Whisper + GPT | **igual** (OpenAI, sin cambios) |
| **WhatsApp** | Twilio | **igual** (Twilio, con plantillas de dominio nuevo) |
| **Voz** | Twilio Voice | **igual** (Twilio) |
| **Base de datos** | DO Managed Postgres | **la MISMA** (AWS se conecta por SSL) |
| **DNS/cutover** | medico-bsl.com en DO | **redirect 302** a aws.medico-bsl.com |

**Clave estratégica:** se hizo con una **abstracción de proveedor** (`VIDEO_PROVIDER=twilio|chime`)
en un solo código. DO sigue en Twilio (default), AWS corre Chime. Cero divergencia de código,
rollback trivial.

---

## 2. Arquitectura destino (AWS)

```
Internet → ALB (443/80, cert ACM aws.<dominio>)
             ├─ target group :3000, health /health, stickiness
             ▼ (subnets privadas)
          ECS Fargate (1 tarea, 0.25 vCPU/0.5GB)  ── egress vía NAT (EIP fija)
             │                                          └→ Postgres DO :25060 (SSL)
             ├─ Chime SDK Meetings (rol IAM, sin llaves)   └→ Twilio / OpenAI / WHAPI / SMTP
             └─ Chime Media Pipelines → S3 (grabaciones MP4)
```

Todo en Terraform en `infrastructure/aws/`. Recursos: VPC 2-AZ, NAT+EIP, ALB, ECS
cluster/service/taskdef, ECR, SSM (secrets), ACM+DNS (DO provider), S3 (grabaciones),
IAM (task role con Chime+S3, execution role con SSM), service-linked role de Chime,
CloudWatch dashboard.

---

## 3. Prerrequisitos (una vez por máquina)

```bash
brew install awscli terraform
brew install --cask docker   # abrir Docker Desktop una vez (daemon running)
```
- **Cuenta AWS** + usuario IAM dedicado con `AdministratorAccess` → access key → `aws configure`.
- **Token de DigitalOcean** con permiso de escritura de DNS (y acceso a Databases + Apps para whitelist/cutover).
- Los **secrets** del app (desde `backend/.env`).

---

## 4. Proceso paso a paso

Desde `infrastructure/aws/` (copiar toda la carpeta y ajustar variables — ver §6):

1. **tfvars**: `cp terraform.tfvars.example terraform.tfvars` → poner `domain_name` (aws.<dominio>),
   `app_url`, `digitalocean_token`, `image_tag`.
2. **Secrets → SSM**: `AWS_REGION=us-east-1 ./scripts/load-secrets-to-ssm.sh`
   (lee `backend/.env` y las claves de `secret-keys.txt`).
3. **ECR**: `terraform init && terraform apply -target=aws_ecr_repository.app`
4. **Imagen**: `AWS_REGION=us-east-1 ./scripts/build-and-push.sh <tag>`
   (Dockerfile raíz **sin modificar**; en Apple Silicon usa `--platform linux/amd64`).
5. **Chime service-linked role** (una vez por cuenta — ver Gotcha #3):
   `aws iam create-service-linked-role --aws-service-name mediapipelines.chime.amazonaws.com`
   y luego `terraform import aws_iam_service_linked_role.chime_media_pipelines <arn>`.
6. **Apply completo**: `terraform apply` (crea VPC/NAT/ALB/ECS/S3/cert/DNS).
7. **Whitelist DO Postgres**: `terraform output nat_public_ip` → agregar esa IP a las
   **Trusted Sources** del cluster Postgres **correcto** (ver Gotcha #1) vía API o dashboard de DO.
8. **Verificar**: `/health`, token endpoint (provider=chime + meeting real), BD (endpoint que
   consulta Postgres responde <1s), Socket.io, y una **videollamada real de 2 personas**.
9. **Plantillas WhatsApp** de dominio nuevo (ver §5.WhatsApp) + wire por env var + redeploy.
10. **Cutover**: redirect 302 gated (ver §5.Cutover).
11. **Dashboard** CloudWatch + (opcional) budget alert.

---

## 5. Piezas de código clave (ya implementadas en este repo)

### Abstracción de proveedor de video
- **Backend** `backend/src/services/video/`: `types.ts` (interfaz `IVideoProvider`),
  `twilio-video.provider.ts` (envuelve el `twilioService` existente), `chime-video.provider.ts`
  (Amazon Chime SDK), `index.ts` (factory por `VIDEO_PROVIDER`, default `twilio`).
- **Frontend** `frontend/src/video/`: `video-engine.ts` (interfaz `VideoEngine` + `NormalizedParticipant`),
  `twilio-engine.ts`, `chime-engine.ts` (`amazon-chime-sdk-js`). `useVideoRoom.ts` elige el motor por
  el `provider` que devuelve el backend (import dinámico → code-split).
- El endpoint `POST /api/video/token` devuelve `{ provider, token? | meeting?+attendee? }`.

### Grabación (Chime Media Pipelines → S3)
- `backend/src/services/video/chime-recording.service.ts`: `startCapture` (Media Capture Pipeline
  con `CompositedVideo` GridView + `AudioWithCompositedVideo`), `stopAndConcatenate` (Media
  Concatenation Pipeline → 1 MP4), `getRecordingUrl` (presigned URL). Tabla `chime_recordings`
  (aditiva, `CREATE IF NOT EXISTS`). Endpoint `GET /api/video/recordings/:roomName`.
- **Se dispara cuando hay 2 participantes** (desde `session-tracker`), NO al crear el meeting (Gotcha #11).

### WhatsApp (plantillas de dominio nuevo)
- El **dominio va HARDCODEADO en el botón** del template de Twilio (`https://<dominio>/patient/{{N}}`).
  Para AWS hay que **crear plantillas nuevas** con `aws.<dominio>` y aprobarlas.
- Se crearon con la Content API: `aws_videollamada_bsl` (botón "Contactar", var TWILIO_WHATSAPP_TEMPLATE_SID)
  y `aws_videoconsulta_suelta` (botón "Crear Sala", var TWILIO_TEMPLATE_VIDEOCONSULTA_SUELTA).
- Se conectan **por env var** (instance-specific, SSM en AWS) — DO no se toca. (Ojo: el resolver
  del tenant `bsl` usa el env var, NO la BD — verificar por app; ver Gotcha #13.)

### Cutover (redirect 302 gated)
- Middleware en `backend/src/index.ts`, gated por `REDIRECT_TO_AWS` (default off): si `Host`
  es el dominio viejo y la ruta NO es `/api`, `/health` ni `/twilioVoz.mp3` → **302** a `aws.<dominio>`.
- **302** (no 301) para que sea reversible al instante. Se activa poniendo `REDIRECT_TO_AWS=true`
  en el env del app de DO (redeploy corto). Revertir = `false`.
- Las URLs de Twilio Voice (TwiML/audio) se pasaron a `APP_URL` (dominio propio de cada instancia).

---

## 6. Adaptar para BODYTECH-CONSULTA (revisado)

**BODYTECH-CONSULTA es un fork/superset de BSL** (mismo autor, misma arquitectura: monorepo
backend+frontend, Docker 1-contenedor :3000, mismo `.do/app.yaml`, MISMA cuenta de Twilio),
pero está en el **estado pre-migración**: NO tiene la abstracción de video, ni `infrastructure/aws/`,
ni las deps de Chime, ni el middleware de redirect. **La migración = re-aplicar los mismos diffs
que ya hicimos en BSL, sobre una app más grande** (~90 archivos backend vs ~35; 17 páginas vs 4).
Encaje del playbook: **~80-90%**.

> ⚠️ **Copiar la versión CORREGIDA, no la del primer día.** Todo lo de §7-bis (persistir el mapa
> sala→reunión) y §7-ter (ciclo de vida de la sala) se descubrió *después* del cutover de BSL, con
> médicos en producción. Si se copia el `services/video/` de BSL tal como quedó hoy, ya viene arreglado;
> pero **verificar explícitamente** estas cuatro antes de salir a producción, porque son invisibles en
> pruebas con una sola persona: (1) el mapa sala→reunión se persiste, (2) desconectarse no finaliza la
> sala, (3) no se borra la reunión si queda alguien dentro, (4) se re-enlaza el video cuando cambia el
> stream. **La forma de probarlas es con DOS personas**: entrar los dos, que uno recargue, y confirmar
> que el otro no se cae y que el que recargó vuelve a la MISMA sala.

### Se copia casi 1:1 (desde BSL)
- Toda la carpeta **`infrastructure/aws/`** (Terraform) → cambiar `var.project` a `bodytech-consulta`
  (¡evitar colisión de nombres si va en la misma cuenta AWS!), `domain_name`/`app_url` a `aws.bodytech.app`,
  `do_domain` a `bodytech.app`, y el bucket S3 tendrá otro nombre automáticamente.
- La **abstracción de video**: copiar `backend/src/services/video/` + `frontend/src/video/` + re-cablear
  `video.controller.ts` y `useVideoRoom.ts` (idéntico a lo que hicimos en BSL).
- La **grabación** (chime-recording.service) + la **tabla** `chime_recordings`.
- El **middleware de redirect 302** (`backend/src/index.ts`) + URLs de voz vía `APP_URL`.
- `scripts/load-secrets-to-ssm.sh` + `secret-keys.txt` (extender con las claves extra, ver abajo).

### Cambia por app
| Cosa | BSL | BODYTECH |
|---|---|---|
| Dominios | medico-bsl.com | **bodytech.app** + www.bodytech.app; subdominio nuevo **aws.bodytech.app** |
| App de DO (cutover) | `bsl-consultavideo` (id bf189976) | app **`bodytech`** (el `.do/app.yaml` dice "bsl-consultavideo" pero es nombre viejo copiado) |
| Cluster Postgres | mismo `bslpostgres` cluster | **el MISMO cluster** `bslpostgres-…k.db…:25060` |
| Base de datos | `defaultdb` | **`POSTGRES_DATABASE=bodytech`** (misma cluster, otra DB) |
| Email | SMTP | **Resend** (`RESEND_API_KEY/FROM`) |
| WhatsApp from | +3153369631 | **+5716284820** |
| Plantillas WA | 2 (video + suelta) | **más**: `TWILIO_WHATSAPP_TEMPLATE_SID` + `_REPROGRAMADA_SID` + `_REPORT_TEMPLATE_SID` + `_GESTION_TEMPLATE_SID` (crear las AWS de las que tengan botón con dominio) |
| Tenant | por hostname (`getByHostname`) | **NO** hay tenants por hostname → usa **sede + RBAC** (`sedes`, `usuarios`, JWT). El gotcha #13 NO aplica igual. |

### ⚠️ Cosas MÁS difíciles / propias de BODYTECH
1. **Chromium + ffmpeg en la imagen** (genera PDFs de historia clínica y PNG de reportes con Puppeteer).
   El Dockerfile de BODYTECH instala `chromium ffmpeg …` y setea `CHROMIUM_PATH`. → **subir el tamaño del
   task Fargate** (0.25 vCPU/0.5 GB de BSL NO alcanza para Chromium headless; usar al menos 0.5 vCPU/1 GB,
   probablemente 1 vCPU/2 GB). Cold start más pesado.
2. **Workers de fondo (`setInterval` en index.ts)**: outbox de Trepsi, sweeper de torniquete, flush de
   leads WhatsApp, reporte diario de gestión. Con `desired_count=1` está bien; algunos ya son idempotentes
   (`ON CONFLICT DO NOTHING`), otros no → **no escalar a >1** sin revisarlos.
3. **Grabación ↔ Calidad (el punto más delicado).** El módulo de Calidad hoy **lee la composition mp4 de
   Twilio** (`twilio-media.service.ts`, `calidad.service.ts`, `composition_sid`). Si movemos el video a
   Chime, esa grabación pasa a **S3/Chime** y **Calidad hay que adaptarlo a leer de S3**. Es trabajo extra
   único de BODYTECH (BSL no tenía este acople). Alternativa: dejar la grabación como está para las sedes
   que aún usen Twilio, o migrar Calidad al MP4 de S3.
4. **Trepsi B2B (webhooks in/out)** hardcodeado a `https://bodytech.app/api/v1/integrations/trepsi`. El
   redirect NO los toca (son `/api`, ya excluidos), pero Trepsi tiene `bodytech.app` en su allowlist → si
   luego se hace cutover de DNS real, verificar que esas rutas sigan alcanzables y el allowlist de Trepsi.
5. **RBAC + JWT + SSO** (login por email/bcrypt, roles, `prepagadas.bodytech.app` SSO). Preservar
   cookies/JWT a través del ALB y del redirect.
6. **NO tocar** `mediconecta.bodytech.app` (es OTRO app — BSL-Plataforma, ahí llega el inbound de Twilio WA)
   ni `prepagadas.bodytech.app` (app hermana SSO). Host-gate el redirect solo a `bodytech.app`/www.

### Recursos compartidos en la cuenta AWS (NO recrear)
- El **service-linked role de Chime** (`AWSServiceRoleForAmazonChimeSDKMediaPipelines`) ya existe (lo creamos
  para BSL) → NO volver a crearlo; en Terraform importarlo o quitar ese recurso del stack de BODYTECH.
- El **cluster Postgres de DO** es el mismo → la nueva EIP del NAT de BODYTECH hay que agregarla a las Trusted
  Sources del mismo cluster (o, si se quiere, compartir el NAT/VPC — pero un stack separado = VPC/NAT separados).

### Env vars extra a cargar en SSM (BODYTECH, además de las de BSL)
`ANTHROPIC_API_KEY`, `ANTHROPIC_AGENT_ID_CALIDAD`, `ANTHROPIC_ENVIRONMENT_ID_CALIDAD`, `CALIDAD_EVALUATOR`,
`TREPSI_WEBHOOK_URL`, `TREPSI_WEBHOOK_API_KEY`, `TREPSI_API_KEY`, `GSHEET_WEBAPP_URL`, `GSHEET_WEBAPP_TOKEN`,
`MONITOR_TOKEN`, `BOOTSTRAP_ADMIN_{EMAIL,NOMBRE,PASSWORD}`, `RIPS_NIT_PRESTADOR`, `RIPS_NOMBRE_PRESTADOR`,
`PREPAGADAS_URL`, `PUBLIC_BASE_URL`, `RESEND_API_KEY`, `RESEND_FROM`, `WHAPI_WEBHOOK_SECRET`,
`TWILIO_WHATSAPP_{REPROGRAMADA,REPORT,GESTION}_*_SID`, y las de migración
(`VIDEO_PROVIDER, CHIME_CONTROL_REGION, CHIME_MEDIA_REGION, RECORDINGS_BUCKET, RECORDINGS_ENABLED,
REDIRECT_TO_AWS, REDIRECT_TARGET, APP_URL`).

---

## 7. Gotchas & soluciones (lo que ya pagamos)

1. **Cuenta DO con varios clusters Postgres.** BSL usa `bslpostgres` (id `b09c5f55…`), NO el
   primer `pg` de la lista (que era `brs`). Identificar el cluster **por su `host`** = el
   `POSTGRES_HOST` del `.env`, y whitelistear ESE. El error se ve como "connection timeout".
2. **Trusted Sources de Postgres DO** = la **EIP del NAT**. La API de firewall **reemplaza** toda
   la lista (`PUT /v2/databases/{id}/firewall`): leer las reglas actuales, agregar, y volver a poner
   todas. En consola es aditivo/seguro.
3. **Service-linked role de Chime Media Pipelines.** Sin `AWSServiceRoleForAmazonChimeSDKMediaPipelines`,
   `CreateMediaCapturePipeline` falla con un mensaje **engañoso**: *"Insufficient permission to access
   S3 bucket"* — cuando en realidad el error real (visible por CLI directo) es *"Create a service-linked
   role…"*. Crearlo con `aws iam create-service-linked-role --aws-service-name mediapipelines.chime.amazonaws.com`.
4. **Bucket S3 de grabaciones**: (a) **ACLs habilitadas** → `object_ownership = BucketOwnerPreferred`
   (el default `BucketOwnerEnforced` hace fallar la captura); (b) **bucket policy** para el service
   principal `mediapipelines.chime.amazonaws.com` (Put/Get/List, cond `aws:SourceAccount`); (c) el
   **rol de la tarea (caller)** necesita `s3:*` sobre el bucket — Chime valida que quien crea el pipeline
   pueda escribir.
5. **Video negro (permiso de cámara).** Pedir `getUserMedia({audio,video})` **ANTES** de listar/elegir
   devices; sin permiso, `enumerateDevices()` devuelve `deviceId` vacíos → `startVideoInput('')` se salta
   → nadie envía video.
6. **Loop de attach/detach (video negro) — y su reverso.** `videoTileDidUpdate` de Chime se dispara muy
   seguido; recrear el ref del tile en cada evento causa bind/unbind sin fin. Pero **cuidado con pasarse
   de frenada**: guardar sólo por `tileId` deja un agujero, porque Chime **cambia el stream de un tile
   SIN cambiar su tileId** (pasa cuando el otro extremo republica su video, p. ej. al activar el fondo
   virtual) → el `<video>` se queda con el stream muerto y se ve negro. La regla correcta:
   **comparar también el `boundVideoStream`**; si cambió, re-enlazar EL MISMO elemento (sin recrear el
   ref ni re-emitir, para no revivir el loop). Síntoma que lo delata: **asimétrico e intermitente** —
   el médico ve al paciente pero el paciente no lo ve a él, y sólo a algunos.
7. **`AudioJoinedFromAnotherDevice` (se cae la llamada).** Chime tiene un monitor de conexión agresivo:
   si el hilo principal se bloquea (procesamiento de fondo TFLite/canvas a 720p), cree que se cayó la red
   y **se auto-reconecta** → colisión → cae. Fix: procesar el fondo a **640×360 @ 15fps**
   (`DefaultVideoTransformDevice` con constraints de baja resolución). (Twilio no sufre esto.)
8. **Participante fantasma de grabación.** El Media Capture Pipeline se une como attendee
   `aws:MediaPipeline-…`. Filtrarlo en el frontend (presence + tiles) por prefijo `aws:`.
9. **Video del remoto no reproduce en móvil (autoplay).** El `<video>` del remoto debe ir **`muted`**
   (el audio va por elemento aparte) → los navegadores móviles bloquean autoplay de video no-muteado.
   Agregar `.play()` tras enlazar.
10. **MP4 duplicados (x3).** `endRoom` se dispara varias veces al colgar (leave + cleanup + beforeunload).
    Usar un **claim atómico** en BD: `UPDATE chime_recordings SET status='concatenating' WHERE
    meeting_id=$1 AND status='capturing' RETURNING …` → solo una llamada concatena.
11. **Timing del recorder.** Arrancar la captura **cuando ambos ya están conectados** (desde
    session-tracker al llegar a 2 participantes), NO al crear el meeting: si el pipeline se une mientras
    los clientes establecen su video, satura la señalización (`Batch timing timeout`) y el video no
    renderiza (peor en móvil).
12. **Layout responsive del video.** Remoto: `object-cover` en móvil, `object-contain` en desktop
    (`object-cover md:object-contain`). Local (PiP): siempre `object-cover`.
13. **Resolución de tenant.** Para tenant `bsl`, el template WhatsApp se resuelve por **env var**, no
    por BD (el bloque de BD solo aplica a `tid !== 'bsl'`). `aws.medico-bsl.com` cae al fallback tenant
    `bsl` (igual que `medico-bsl.com`). Verificar el tenant y el resolver por app.
14. **DNS del apex.** DO DNS **no soporta ALIAS/ANAME**, y el apex está detrás del edge (Cloudflare) de
    DO App Platform → no se puede apuntar el apex directo al ALB. Por eso el cutover se hizo con **redirect
    302** desde DO (no repointing de DNS). Los subdominios (`aws.*`) sí por CNAME.
15. **Env var en el app de DO por API.** `PUT /v2/apps/{id}` con el spec completo: los envs GENERAL
    vuelven en texto plano, el/los SECRET vuelven como `EV[…]` (DO los preserva). Round-trip seguro:
    agregar el env y volver a poner TODO el spec.
16. **App de DO multi-tenant.** El app puede servir varios dominios (BSL servía medico-bsl.com +
    2 tenants más). El redirect debe ir **host-gated** al dominio migrado para no tocar los otros.
17. **Build en Apple Silicon.** `--platform linux/amd64` (o `cpu_architecture = ARM64` en Fargate).
18. **Deps nuevas.** Backend: `@aws-sdk/client-chime-sdk-meetings`, `@aws-sdk/client-chime-sdk-media-pipelines`,
    `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`. Frontend: `amazon-chime-sdk-js`.
19. **Prefijo de SSM.** Los secrets van en `/<proyecto>/aws/CLAVE`, **con el `/aws/`**. Ponerlos un nivel
    arriba hace que la tarea **ni arranque**: `ResourceInitializationError: … invalid ssm parameters:
    /<proyecto>/aws/CLAVE`. Confirmar la ruta real con
    `aws ssm get-parameters-by-path --path /<proyecto> --recursive` (ojo: si luego se hace `sed 's|.*/||'`
    para ver sólo los nombres, se pierde justo el prefijo que importa).
20. **Inventario COMPLETO de env vars.** No basta con las del `.do/app.yaml`: la mayoría vive sólo en el
    dashboard de DO. En BSL se nos escapó todo el bloque `BSL_PLATAFORMA_*` y el chat del panel quedó
    vacío en producción (`getMensajes error: … no configurados`) sin que nada más fallara. **Comparar
    conteos**: nº de envs en el spec de DO vs nº de parámetros en SSM + `container_environment`.
21. **Los SECRET de DO no se pueden leer de vuelta.** En el spec vuelven como `EV[…]`. Los **GENERAL** sí
    se recuperan en texto plano (así rescatamos URL/TENANT/USER). Para un secret perdido no queda otra que
    **resetearlo**: generar uno nuevo, actualizar el origen (BD/servicio) y cargarlo en SSM **y** en DO.
22. **Manejador de errores de Express: 4 parámetros.** Express lo reconoce por `fn.length`; con 3 lo trata
    como middleware normal y lo llama con `(req, res, next)` → `err` es el request y `res` es `next`, así
    que revienta con `TypeError: res.status is not a function` y **ningún error se reporta bien**. Firma
    obligatoria: `(err, req, res, next)`, aunque `next` no se use.
23. **Fallo del procesador de fondo → quedarse SIN video.** `applyVirtualBackground` primero suelta el
    device anterior y después crea el procesador; si eso falla (navegador sin soporte, WASM que no carga,
    equipo lento) el médico queda publicando **nada**, y el `catch` de arriba se lo traga. Siempre
    **devolver la cámara sin efecto** en el `catch`: perder el fondo es mucho mejor que perder el video.

---

## 7-bis. La trampa grande: el estado en memoria

**Es el error más caro que cometimos, y el que más tarda en aparecer.** Todo lo que el provider de video
guarda en un `Map` de proceso desaparece en cada reinicio de la tarea (un despliegue, un crash, un
re-scale). Con `desired_count=1` es fácil creer que "single instance" equivale a "estado seguro". **No lo
es**: la instancia se reemplaza a cada rato.

Lo que nos pasó, con síntomas que parecían tres bugs distintos:

- **El mapa `sala → meetingId` vivía en memoria.** Tras cada despliegue, el siguiente en entrar no
  encontraba la reunión y **creaba una NUEVA para la misma sala**. Médico y paciente quedaban en
  reuniones distintas, cada uno "solo", **sin ningún error en los logs**. Se veía como *"entro y ya no
  están"*, *"a veces me ven, a veces no"*. En un día llegamos a **7 reuniones para una misma sala**.
  → **Persistir en Postgres** (tabla `chime_meetings`), consultarla cuando la memoria no tenga la sala, y
  degradar a sólo-memoria si la BD falla (nunca romper el video por un fallo de BD).
- **Diagnóstico rápido:** contar reuniones por sala en los logs. Más de una = la sala se partió:
  `... | grep -oE "Meeting creado para sala [a-z0-9-]+" | awk '{print $NF}' | sort | uniq -c | sort -rn`

Regla para la próxima: **cualquier identificador que dos personas deban compartir para encontrarse va en
la BD, no en un `Map`.** El estado en memoria sólo sirve como caché.

---

## 7-ter. Ciclo de vida de la sala (lo que más quejas generó)

Tres decisiones de diseño que parecían inofensivas y en producción resultaron dolorosas. **Revisar estas
tres antes de migrar BODYTECH**, porque el código se copia tal cual.

1. **Desconectarse NO es colgar.** Marcábamos la sala como *finalizada* ante cualquier desconexión del
   médico. Pero recargar la página, perder la red o cerrar sin querer es lo más normal del mundo. El
   efecto: el paciente **no podía volver a entrar con el link que ya tenía por WhatsApp** (403 *"Esta
   videollamada ya finalizó"*) y había que generar sala nueva. Sólo el **colgar explícito** debe
   finalizar la sala; una desconexión debe dejarla reutilizable (`endRoom(room, { completed: false })`).
2. **No borrar la reunión si adentro queda alguien.** Al desconectarse el médico borrábamos la reunión
   aunque el paciente siguiera dentro → lo **expulsaba en el acto** (*"como que el sistema los saca"*).
   Comprobar si queda algún participante conectado y, si lo hay, dejar la sala viva: el médico se
   reconecta a la MISMA reunión y la consulta sigue.
3. **El médico siempre debe poder reingresar** — y al hacerlo, reabrir la sala para su paciente. Bloquear
   el reingreso sólo tiene sentido para el paciente y sólo después de que el médico colgó.
4. **Los clientes reportan la desconexión dos veces** (colgar + `beforeunload`). Hace falta idempotencia
   en dos niveles: ignorar la segunda desconexión del mismo participante, y en `endRoom` sacar la
   reunión del mapa **antes** de los `await` (si no: doble concatenación del MP4 y `ConditionalCheckFailed`
   al borrar el meeting).

**Observabilidad que vale oro:** loguear explícitamente cada rechazo de ingreso con el rol
(`Reingreso rechazado: sala X finalizada (Nombre, role=patient)`). Ese único log convirtió un
"algo está fallando" en un diagnóstico exacto en dos minutos. Ponerlo **desde el día uno**.

---

## 8. Rollback / reversibilidad

- **Cutover**: `REDIRECT_TO_AWS=false` en DO → vuelve todo a DO (redeploy ~1-2 min). Sin pérdida de
  datos (Postgres compartido).
- **Video provider**: si `VIDEO_PROVIDER` no está o es `twilio`, la instancia usa Twilio. Rollback = quitar/cambiar el env.
- **Infra AWS**: `terraform destroy` (y quitar la EIP de las trusted sources de DO). DO queda igual.
- **Grabaciones**: durante el período AWS quedan en S3; en DO quedan en Twilio. No se pierde nada.

---

## 9. Costos (referencia)

AWS adicional: ALB ~$16 + NAT Gateway ~$32 (o `fck-nat` ~$3) + Fargate ~$9 + S3/transfer → **~$28-60/mes**.
AWS es **pospago** (no prepago como Twilio): se cobra a la tarjeta a fin de mes, no hay saldo que recargar.
WhatsApp/Voz **siguen en Twilio** (prepago) — ese saldo sí hay que mantenerlo.

---

## 10. Operación los primeros días (aprendido a golpes)

**Cada despliegue reinicia la tarea y CORTA las consultas en curso.** Con una sola tarea no hay
solapamiento real: la vieja muere y la nueva arranca. El día del cutover de BSL desplegamos 5 veces en
horario de consulta y cada despliegue partió las videollamadas activas — buena parte de las quejas de ese
día las causamos nosotros, no los bugs.

- **Desplegar fuera del horario de consulta.** Si toca en caliente, avisar antes.
- **Agrupar arreglos en un solo despliegue** en vez de ir soltando uno por uno.
- Antes de dar por bueno un arreglo, **verificar contra los logs**, no contra la intención: comparar el
  contador del síntoma antes/después (`grep -c`), y confirmar que el servicio quedó en el `taskdef` nuevo
  (un rollout puede fallar y dejar la versión ANTERIOR sirviendo con health 200 — pasó con `v14`).
- **Preguntar el detalle que discrimina** antes de tocar código. Ej.: "¿el paciente sí la sigue
  escuchando a ella?" separa un problema del elemento de audio del navegador de uno de la conexión.
  Desplegar a ciegas cuesta otro corte de consultas.

### Pendientes recomendados

- Rotar cualquier credencial expuesta durante el setup (access key AWS, token DO).
- Pasar el redirect de **302 → 301** cuando esté estable (unos días).
- (Opcional) Botón "Ver grabación" en la UI; AWS Budget con alerta por email.
- (Escala) Para >1 tarea: adaptador Socket.io + ElastiCache Redis (el estado de sesiones/sockets sigue
  en-memoria, por eso `desired_count=1`). El mapa sala→reunión ya se persiste (ver §7-bis), pero
  `session-tracker` y `telemedicine-socket` todavía no.

# AWS — Despliegue en paralelo (ECS Fargate + ALB)

Levanta **la misma app** que corre en DigitalOcean, **en AWS y en paralelo**, para
redundancia/staging. **No toca DO**: DO sigue en producción, el dominio apex
`medico-bsl.com` no cambia, y AWS se conecta al **mismo Postgres gestionado de DO**.

- URL de la instancia AWS: `https://aws.medico-bsl.com` (subdominio nuevo).
- Reutiliza el `Dockerfile` de la raíz **sin modificarlo**.
- Base de datos: **se comparte** el Postgres de DO (cero migración de datos).

```
Internet ──► ALB (443/80) ──► ECS Fargate (task, :3000) ──► Postgres DO (:25060 SSL)
                 │  ACM cert           │  1 tarea                  vía NAT (IP fija)
             aws.medico-bsl.com    Socket.io + SPA + API
```

---

## Qué NO se toca en DO

- `.do/app.yaml`, el servicio de DO, el apex `medico-bsl.com` y `www`.
- Los webhooks de Twilio de producción (siguen apuntando a `medico-bsl.com`).
- La única acción sobre DO es **agregar** dos cosas nuevas y reversibles:
  1. una IP a las *Trusted Sources* del cluster de Postgres, y
  2. registros DNS del **subdominio** `aws` (si usas `manage_do_dns = true`).

---

## Prerrequisitos (instalar una vez)

```bash
brew install terraform awscli    # macOS
# Docker Desktop: https://www.docker.com/products/docker-desktop/

aws configure                    # credenciales de AWS (o exporta AWS_PROFILE)
```

Necesitas además:
- El archivo `backend/.env` con los valores reales (ya existe en tu máquina).
- Un **token de la API de DigitalOcean** con permiso de DNS (si `manage_do_dns = true`).
  Créalo en DO → API → *Generate New Token* (scope de escritura).

---

## Orden de ejecución (primer despliegue)

Desde `infrastructure/aws/`:

### 1. Configura las variables
```bash
cp terraform.tfvars.example terraform.tfvars
# edita terraform.tfvars: pega digitalocean_token, confirma región y dominio
```

### 2. Sube los secrets a SSM  ⚠️ ANTES de terraform
Lee los valores de `backend/.env` y las claves de `secret-keys.txt`:
```bash
AWS_REGION=us-east-1 ./scripts/load-secrets-to-ssm.sh
```
> Terraform referencia estos parámetros por su ARN; los **valores nunca entran al
> state de Terraform** ni al repo.

### 3. Crea el ECR (solo el repo) para poder subir la imagen
```bash
terraform init
terraform apply -target=aws_ecr_repository.app
```

### 4. Construye y sube la imagen (Dockerfile raíz, sin cambios)
```bash
AWS_REGION=us-east-1 ./scripts/build-and-push.sh latest
```
> En Mac con Apple Silicon el script usa `--platform linux/amd64` por defecto para
> coincidir con `cpu_architecture = X86_64`. Si prefieres ARM (más barato en
> Fargate), pon `cpu_architecture = "ARM64"` en tfvars y `PLATFORM=linux/arm64`.

### 5. Despliega todo lo demás
```bash
terraform apply
```
Esto crea: VPC + NAT (con EIP), ALB + target group (`/health`, stickiness), ECS
Fargate (1 tarea), CloudWatch Logs, certificado ACM y, si `manage_do_dns = true`,
el subdominio + validación del certificado automáticamente.

### 6. Autoriza AWS en el Postgres de DO  ⚠️ imprescindible
```bash
terraform output nat_public_ip
```
En el panel de DO → **Databases → tu cluster → Settings → Trusted Sources → Add**,
pega esa IP. La app **arranca igual** y `/health` pasa aunque falte este paso (el
endpoint no consulta la BD), pero **cualquier función que use Postgres fallará**
hasta que agregues la IP.

### 7. Verifica (ver sección Verificación)

**Tiempos:** el cert ACM y el DNS pueden tardar unos minutos en propagar. Si el
`apply` se queda esperando la validación del certificado, es normal (hasta ~5–10 min).

---

## Publicar una versión nueva (deploys siguientes)

```bash
AWS_REGION=us-east-1 ./scripts/build-and-push.sh v2   # o el tag que quieras
# en terraform.tfvars: image_tag = "v2"
terraform apply                                        # rolling deploy en ECS
```
Alternativa rápida sin cambiar tag (re-despliega la misma etiqueta):
```bash
aws ecs update-service --cluster $(terraform output -raw ecs_cluster_name) \
  --service $(terraform output -raw ecs_service_name) --force-new-deployment
```

---

## DNS manual (si `manage_do_dns = false`)

El certificado debe estar **emitido** antes de que el listener HTTPS lo pueda
adjuntar, así que la secuencia manual es:

1. Crea solo el certificado y obtén sus registros de validación:
   ```bash
   terraform apply -target=aws_acm_certificate.app -var manage_do_dns=false
   terraform output acm_validation_records
   ```
2. En tu DNS, crea esos CNAME de validación. Espera a que ACM lo emita
   (`aws acm list-certificates` / consola → estado *Issued*, ~5–30 min).
3. Ahora sí, aplica todo:
   ```bash
   terraform apply -var manage_do_dns=false
   terraform output alb_dns_name
   ```
4. Crea el CNAME final del subdominio: `aws → <alb_dns_name>`.

> Mucho más simple: usa `manage_do_dns = true` y Terraform hace los 4 pasos solo.

---

## Verificación (end-to-end)

1. **Health**: `curl https://aws.medico-bsl.com/health` → `{"status":"OK",...}`.
2. **Video**: abre la SPA, crea sala como doctor y únete como paciente en otra
   ventana → el video de Twilio conecta.
3. **Socket.io por el ALB**: en la pestaña Network, verifica el upgrade de
   `/socket.io` a WebSocket (101) y que el doctor recibe la notificación cuando
   entra el paciente.
4. **Base de datos**: ejecuta algo que escriba en Postgres (p. ej. crear una
   video-session) y confirma la fila en el **mismo Postgres de DO**. Valida la
   conexión + trusted source + SSL.
5. **Logs**: `aws logs tail /ecs/bsl-consultavideo --follow` — sin errores de
   conexión a Postgres ni de arranque.
6. **DO intacto**: confirma que `https://medico-bsl.com` sigue sirviendo producción.

### Depurar dentro del contenedor
```bash
aws ecs execute-command --cluster $(terraform output -raw ecs_cluster_name) \
  --task <task-id> --container bsl-consultavideo --interactive --command "/bin/sh"
```

---

## Notas importantes / limitaciones

- **1 sola tarea (`desired_count = 1`)**: el tracking de sesiones y el streaming de
  pose viven en memoria (`session-tracker.service.ts`,
  `telemedicine-socket.service.ts`). Igual que en DO hoy. **No subir a >1** sin antes
  externalizar ese estado (ElastiCache Redis + adaptador de Socket.io).
- **Webhooks inbound compartidos**: `APP_URL`/`BASE_URL` apuntan a
  `aws.medico-bsl.com`, así que los links/callbacks que esta instancia **genera**
  apuntan a AWS. Pero los webhooks inbound configurados **por número** en la consola
  de Twilio siguen yendo a DO. El flujo **saliente** (crear sala, tokens, enviar
  WhatsApp) funciona 100%; para probar inbound en AWS usa una subcuenta/número de
  Twilio de prueba. **No reconfigures los webhooks de producción.**
- **Costo aprox (adicional a DO)**: ALB ~$16/mes + Fargate 0.25vCPU/0.5GB ~$9/mes +
  **NAT Gateway ~$32/mes** + transferencia. Para bajar el NAT, se puede cambiar a una
  instancia `fck-nat` (~$3/mes); es un cambio del módulo de red, documentado como
  mejora futura.
- **Postgres**: `postgres.service.ts` ya usa `ssl.rejectUnauthorized=false`, así que
  conecta al Postgres de DO sin cambios de código.

---

## Destruir la instancia AWS (sin afectar DO)

```bash
terraform destroy
```
Luego, opcional: quita la IP del NAT de las *Trusted Sources* del Postgres en DO.
DO queda exactamente como estaba.

---

## Archivos

| Archivo | Rol |
|---|---|
| `network.tf` | VPC 2-AZ, subnets, IGW, **NAT + EIP** (IP de salida estable) |
| `ecr.tf` | Repo de imágenes |
| `iam.tf` | Roles de ejecución y de tarea (SSM/KMS/ECS-exec) |
| `secrets.tf` + `secret-keys.txt` | Referencia SSM de secrets (valores fuera del state) |
| `alb.tf` | ALB, target group (`/health`, stickiness), listeners, security groups |
| `ecs.tf` | Cluster, task def (imagen ECR), servicio, logs |
| `acm.tf` / `dns.tf` | Certificado TLS y subdominio en DO (opcional) |
| `scripts/load-secrets-to-ssm.sh` | Sube `backend/.env` → SSM |
| `scripts/build-and-push.sh` | Build (Dockerfile raíz) → ECR |

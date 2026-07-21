variable "aws_region" {
  description = "Región AWS (us-east-1 es la más cercana a la región nyc de DO)."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Prefijo de nombres para los recursos."
  type        = string
  default     = "bsl-consultavideo"
}

# ---------------------------------------------------------------------------
# Red
# ---------------------------------------------------------------------------
variable "vpc_cidr" {
  description = "CIDR de la VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "az_count" {
  description = "Número de zonas de disponibilidad (ALB requiere >= 2)."
  type        = number
  default     = 2
}

# ---------------------------------------------------------------------------
# Aplicación / contenedor
# ---------------------------------------------------------------------------
variable "container_port" {
  description = "Puerto donde escucha el contenedor (Express)."
  type        = number
  default     = 3000
}

variable "image_tag" {
  description = "Tag de la imagen en ECR a desplegar (ej: la que sube build-and-push.sh)."
  type        = string
  default     = "latest"
}

variable "task_cpu" {
  description = "CPU del task Fargate (256 = 0.25 vCPU, equivalente a basic-xxs de DO)."
  type        = number
  default     = 256
}

variable "task_memory" {
  description = "Memoria del task Fargate en MiB (512 = 0.5 GB)."
  type        = number
  default     = 512
}

variable "cpu_architecture" {
  description = "Arquitectura del task: X86_64 o ARM64. Debe coincidir con --platform del build."
  type        = string
  default     = "X86_64"
}

variable "desired_count" {
  description = "Número de tareas. MANTENER EN 1: el estado en memoria (Socket.io / session-tracker) no soporta >1 sin Redis."
  type        = number
  default     = 1
}

variable "app_url" {
  description = "URL pública de esta instancia AWS. Se usa para APP_URL/BASE_URL/ALLOWED_ORIGINS."
  type        = string
  default     = "https://aws.medico-bsl.com"
}

variable "video_provider" {
  description = "Proveedor de video del backend: 'chime' (nativo AWS) o 'twilio'."
  type        = string
  default     = "chime"
}

variable "recordings_expiration_days" {
  description = "Días tras los cuales se auto-borran las grabaciones en S3. 0 = retención indefinida."
  type        = number
  default     = 0
}

# ---------------------------------------------------------------------------
# Secrets (SSM)
# ---------------------------------------------------------------------------
variable "ssm_prefix" {
  description = "Prefijo de los parámetros SSM que contienen los secrets del contenedor."
  type        = string
  default     = "/bsl-consultavideo/aws"
}

# ---------------------------------------------------------------------------
# Dominio / TLS / DNS
# ---------------------------------------------------------------------------
variable "domain_name" {
  description = "Subdominio para esta instancia AWS (staging/paralelo). No usar el apex de producción."
  type        = string
  default     = "aws.medico-bsl.com"
}

variable "do_domain" {
  description = "Dominio registrado en DigitalOcean (zona DNS). Solo se usa si manage_do_dns = true."
  type        = string
  default     = "medico-bsl.com"
}

variable "manage_do_dns" {
  description = "Si true, Terraform crea en el DNS de DO el CNAME del subdominio y los registros de validación ACM (recomendado, deja el apply 100% automático)."
  type        = bool
  default     = true
}

variable "digitalocean_token" {
  description = "Token de la API de DigitalOcean (solo lectura/escritura de DNS). Requerido si manage_do_dns = true."
  type        = string
  default     = ""
  sensitive   = true
}

variable "enable_https" {
  description = "Crear listener HTTPS + certificado ACM. Si manage_do_dns = false y prefieres un primer apply solo-HTTP, ponlo en false, agrega el DNS manualmente y luego reactiva."
  type        = bool
  default     = true
}

# ---------------------------------------------------------------------------
# Health check (espejo de la config de DO)
# ---------------------------------------------------------------------------
variable "health_check_path" {
  description = "Ruta del health check."
  type        = string
  default     = "/health"
}

# --- Chat de WhatsApp del panel médico (servicio bsl-plataforma) ---
# Sin estas vars el panel muestra el chat vacío y el backend loguea
# "BSL_PLATAFORMA_USER / BSL_PLATAFORMA_PASS no configurados".
variable "bsl_plataforma_url" {
  description = "URL del servicio bsl-plataforma (origen del chat de WhatsApp)"
  type        = string
  default     = "https://bsl-plataforma.com"
}

variable "bsl_plataforma_tenant" {
  description = "Tenant de bsl-plataforma"
  type        = string
  default     = "bsl"
}

variable "bsl_plataforma_user" {
  description = "Usuario de servicio para el chat de bsl-plataforma"
  type        = string
  default     = "svc-chat-consultavideo@bsl.com.co"
}

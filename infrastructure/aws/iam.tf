data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Service-linked role que permite a Chime SDK Media Pipelines acceder a los
# meetings de Chime para grabar. Requerido para crear capture/concatenation
# pipelines. Es único por cuenta (si ya existe, se importa al state).
resource "aws_iam_service_linked_role" "chime_media_pipelines" {
  aws_service_name = "mediapipelines.chime.amazonaws.com"
}

# Clave KMS administrada por AWS para SSM (usada por los SecureString).
data "aws_kms_alias" "ssm" {
  name = "alias/aws/ssm"
}

# ---------------------------------------------------------------------------
# Rol de EJECUCIÓN del task: lo usa el agente ECS para halar la imagen de ECR,
# escribir logs y leer los secrets de SSM.
# ---------------------------------------------------------------------------
resource "aws_iam_role" "task_execution" {
  name = "${var.project}-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "task_execution_managed" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Permiso extra para leer los parámetros SSM (secrets) y descifrarlos.
resource "aws_iam_role_policy" "task_execution_secrets" {
  name = "${var.project}-read-ssm-secrets"
  role = aws_iam_role.task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameters",
          "ssm:GetParameter"
        ]
        Resource = "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${var.ssm_prefix}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = data.aws_kms_alias.ssm.target_key_arn
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Rol del TASK (rol de la aplicación en runtime). Hoy la app no llama a AWS
# directamente, así que va sin políticas adicionales; existe para poder
# agregar permisos en el futuro (ej: S3, SES) sin recrear el task def.
# ---------------------------------------------------------------------------
resource "aws_iam_role" "task" {
  name = "${var.project}-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Permisos para Amazon Chime SDK Meetings (video cuando VIDEO_PROVIDER=chime).
# El backend crea/borra meetings y attendees usando el rol de la tarea (sin llaves).
resource "aws_iam_role_policy" "task_chime" {
  name = "${var.project}-chime-meetings"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "chime:CreateMeeting",
        "chime:GetMeeting",
        "chime:DeleteMeeting",
        "chime:CreateAttendee",
        "chime:DeleteAttendee",
        "chime:ListAttendees",
        "chime:GetAttendee"
      ]
      Resource = "*"
    }]
  })
}

# Permisos para grabar las videollamadas: Chime Media Pipelines + S3.
# El backend arranca/detiene pipelines de captura y concatenación, y firma
# presigned URLs de los MP4 en el bucket de grabaciones.
resource "aws_iam_role_policy" "task_recordings" {
  name = "${var.project}-recordings"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ChimeMediaPipelines"
        Effect = "Allow"
        Action = [
          "chime:CreateMediaCapturePipeline",
          "chime:DeleteMediaCapturePipeline",
          "chime:GetMediaCapturePipeline",
          "chime:CreateMediaConcatenationPipeline",
          "chime:GetMediaPipeline",
          "chime:ListMediaCapturePipelines",
          "chime:TagResource"
        ]
        Resource = "*"
      },
      {
        # Chime valida que el CALLER (este rol) pueda acceder al bucket sink al
        # crear el pipeline. Requiere permisos S3 amplios sobre el bucket (no solo
        # PutObject). Alcance limitado al bucket dedicado de grabaciones.
        Sid    = "RecordingsBucket"
        Effect = "Allow"
        Action = "s3:*"
        Resource = [
          aws_s3_bucket.recordings.arn,
          "${aws_s3_bucket.recordings.arn}/*"
        ]
      }
    ]
  })
}

# Permisos para `aws ecs execute-command` (shell dentro del contenedor, útil
# para depurar la conexión a Postgres de DO desde la tarea).
resource "aws_iam_role_policy" "task_exec_command" {
  name = "${var.project}-ecs-exec"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ssmmessages:CreateControlChannel",
        "ssmmessages:CreateDataChannel",
        "ssmmessages:OpenControlChannel",
        "ssmmessages:OpenDataChannel"
      ]
      Resource = "*"
    }]
  })
}

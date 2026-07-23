resource "aws_ecs_cluster" "app" {
  name = "${var.project}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = { Component = "ecs" }
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.project}"
  retention_in_days = 14

  tags = { Component = "ecs" }
}

locals {
  container_name = var.project

  # Variables de configuración (NO secretas). Las URLs apuntan a la propia
  # instancia AWS para que los links/callbacks que la app genera apunten aquí.
  container_environment = [
    { name = "NODE_ENV", value = "production" },
    { name = "PORT", value = tostring(var.container_port) },
    { name = "APP_URL", value = var.app_url },
    { name = "BASE_URL", value = var.app_url },
    { name = "ALLOWED_ORIGINS", value = var.app_url },
    # Proveedor de video: en AWS usamos Amazon Chime SDK (DO se queda en Twilio).
    { name = "VIDEO_PROVIDER", value = var.video_provider },
    { name = "CHIME_CONTROL_REGION", value = var.aws_region },
    { name = "CHIME_MEDIA_REGION", value = var.aws_region },
    # Grabación de videollamadas → S3 (Chime Media Pipelines).
    { name = "RECORDINGS_BUCKET", value = aws_s3_bucket.recordings.bucket },
    { name = "RECORDINGS_ENABLED", value = "true" },
    # Etiqueta de asignación de costos: separa el gasto de Chime BSL vs BODYTECH
    # (misma cuenta AWS). BODYTECH usa "bodytech".
    { name = "COST_APP_TAG", value = var.project },
    # Chat de WhatsApp del panel médico (se sirve desde bsl-plataforma).
    # La contraseña va aparte, en SSM (ver secret-keys.txt).
    { name = "BSL_PLATAFORMA_URL", value = var.bsl_plataforma_url },
    { name = "BSL_PLATAFORMA_TENANT", value = var.bsl_plataforma_tenant },
    { name = "BSL_PLATAFORMA_USER", value = var.bsl_plataforma_user },
  ]
}

resource "aws_ecs_task_definition" "app" {
  family                   = var.project
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name      = local.container_name
      image     = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]

      environment = local.container_environment
      secrets     = local.container_secrets

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "app"
        }
      }
    }
  ])

  tags = { Component = "ecs" }
}

resource "aws_ecs_service" "app" {
  name            = var.project
  cluster         = aws_ecs_cluster.app.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  enable_execute_command = true # permite `aws ecs execute-command` para depurar

  # Espejo del health check de DO: da 60s de gracia antes de contar fallos.
  health_check_grace_period_seconds = 60

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.service.id]
    assign_public_ip = false # sale por el NAT (IP estable), no IP pública propia
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = local.container_name
    container_port   = var.container_port
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # El listener debe existir antes de registrar el servicio en el target group.
  depends_on = [
    aws_lb_listener.http,
    aws_lb_listener.https,
  ]

  # Nota: Terraform es la fuente de verdad del deploy. Para publicar una imagen
  # nueva: sube el tag con build-and-push.sh y corre `terraform apply` (cambia
  # image_tag). Si luego agregas CI que haga `update-service`, añade aquí
  # lifecycle { ignore_changes = [task_definition] } para evitar conflictos.

  tags = { Component = "ecs" }
}

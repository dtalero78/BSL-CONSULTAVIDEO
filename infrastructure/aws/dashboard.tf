# Dashboard de CloudWatch: "todo junto" para monitorear la app (equivalente al
# overview de DigitalOcean). Se ve en CloudWatch → Dashboards → bsl-consultavideo.
resource "aws_cloudwatch_dashboard" "app" {
  dashboard_name = var.project

  dashboard_body = jsonencode({
    widgets = [
      # --- Fila 1 ---
      {
        type = "metric", x = 0, y = 0, width = 12, height = 6
        properties = {
          title   = "ECS · CPU / Memoria (%)"
          region  = var.aws_region
          view    = "timeSeries"
          stacked = false
          yAxis   = { left = { min = 0, max = 100 } }
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.app.name, "ServiceName", aws_ecs_service.app.name, { stat = "Average", label = "CPU %" }],
            ["AWS/ECS", "MemoryUtilization", "ClusterName", aws_ecs_cluster.app.name, "ServiceName", aws_ecs_service.app.name, { stat = "Average", label = "Memoria %" }]
          ]
        }
      },
      {
        type = "metric", x = 12, y = 0, width = 12, height = 6
        properties = {
          title   = "ALB · Requests y errores"
          region  = var.aws_region
          view    = "timeSeries"
          stacked = false
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.app.arn_suffix, { stat = "Sum", label = "Requests" }],
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", aws_lb.app.arn_suffix, { stat = "Sum", label = "5XX (errores app)", color = "#d62728" }],
            ["AWS/ApplicationELB", "HTTPCode_Target_4XX_Count", "LoadBalancer", aws_lb.app.arn_suffix, { stat = "Sum", label = "4XX" }],
            ["AWS/ApplicationELB", "HTTPCode_ELB_5XX_Count", "LoadBalancer", aws_lb.app.arn_suffix, { stat = "Sum", label = "5XX (ALB)", color = "#ff9896" }]
          ]
        }
      },

      # --- Fila 2 ---
      {
        type = "metric", x = 0, y = 6, width = 8, height = 6
        properties = {
          title  = "ALB · Latencia de respuesta (s)"
          region = var.aws_region
          view   = "timeSeries"
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.app.arn_suffix, { stat = "Average", label = "Promedio" }],
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.app.arn_suffix, { stat = "p95", label = "p95" }]
          ]
        }
      },
      {
        type = "metric", x = 8, y = 6, width = 8, height = 6
        properties = {
          title  = "Salud · tareas sanas y corriendo"
          region = var.aws_region
          view   = "timeSeries"
          yAxis  = { left = { min = 0 } }
          metrics = [
            ["AWS/ApplicationELB", "HealthyHostCount", "TargetGroup", aws_lb_target_group.app.arn_suffix, "LoadBalancer", aws_lb.app.arn_suffix, { stat = "Average", label = "Tareas sanas (ALB)" }],
            ["ECS/ContainerInsights", "RunningTaskCount", "ClusterName", aws_ecs_cluster.app.name, "ServiceName", aws_ecs_service.app.name, { stat = "Average", label = "Tareas corriendo" }]
          ]
        }
      },
      {
        type = "log", x = 16, y = 6, width = 8, height = 6
        properties = {
          title  = "Errores recientes (logs del contenedor)"
          region = var.aws_region
          query  = "SOURCE '${aws_cloudwatch_log_group.app.name}' | fields @timestamp, @message | filter @message like /(?i)(error|timeout|❌|ECONNREFUSED|ETIMEDOUT)/ | sort @timestamp desc | limit 20"
          view   = "table"
        }
      },

      # --- Fila 3: costo ---
      # Requiere activar "Receive Billing Alerts" en Billing → Preferences.
      # La métrica AWS/Billing solo existe en us-east-1.
      {
        type = "metric", x = 0, y = 12, width = 8, height = 4
        properties = {
          title   = "Costo estimado del mes (USD)"
          region  = "us-east-1"
          view    = "singleValue"
          metrics = [["AWS/Billing", "EstimatedCharges", "Currency", "USD", { stat = "Maximum", label = "USD (mes a la fecha)" }]]
        }
      },
      {
        type = "metric", x = 8, y = 12, width = 16, height = 4
        properties = {
          title   = "Costo estimado (tendencia)"
          region  = "us-east-1"
          view    = "timeSeries"
          metrics = [["AWS/Billing", "EstimatedCharges", "Currency", "USD", { stat = "Maximum", label = "USD" }]]
        }
      }
    ]
  })
}

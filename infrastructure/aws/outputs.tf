output "nat_public_ip" {
  description = "IP de salida ESTABLE de las tareas. AGRÉGALA a las 'Trusted Sources' del cluster de Postgres en DigitalOcean para que AWS pueda conectarse a la BD."
  value       = try(module.vpc.nat_public_ips[0], null)
}

output "alb_dns_name" {
  description = "DNS del ALB. Si manejas el DNS a mano, crea un CNAME aws.medico-bsl.com -> este valor."
  value       = aws_lb.app.dns_name
}

output "app_url" {
  description = "URL pública de la instancia AWS."
  value       = var.app_url
}

output "ecr_repository_url" {
  description = "URL del repo ECR. Úsala en scripts/build-and-push.sh."
  value       = aws_ecr_repository.app.repository_url
}

output "ecs_cluster_name" {
  description = "Nombre del cluster ECS (para logs / execute-command / CI)."
  value       = aws_ecs_cluster.app.name
}

output "ecs_service_name" {
  description = "Nombre del servicio ECS (para forzar deploys / CI)."
  value       = aws_ecs_service.app.name
}

output "cloudwatch_log_group" {
  description = "Log group de la app en CloudWatch."
  value       = aws_cloudwatch_log_group.app.name
}

output "recordings_bucket" {
  description = "Bucket S3 donde quedan las grabaciones (MP4) de las videollamadas."
  value       = aws_s3_bucket.recordings.bucket
}

# Solo relevante cuando manage_do_dns = false (DNS manual).
output "acm_validation_records" {
  description = "Registros CNAME de validación del certificado ACM a crear a mano si manage_do_dns = false."
  value       = var.enable_https ? local.acm_validation : {}
}

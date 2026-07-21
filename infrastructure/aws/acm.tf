resource "aws_acm_certificate" "app" {
  count = var.enable_https ? 1 : 0

  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = { Component = "acm" }
}

locals {
  # ARN del certificado que usa el listener HTTPS.
  # - Con manage_do_dns: usamos el recurso de validación (garantiza que el cert
  #   esté EMITIDO antes de adjuntarlo al listener).
  # - Sin manage_do_dns: usamos el ARN del cert directamente (queda PENDING hasta
  #   que agregues los registros DNS a mano; el ALB sirve TLS válido al emitirse).
  certificate_arn = var.enable_https ? (
    var.manage_do_dns ? aws_acm_certificate_validation.app[0].certificate_arn : aws_acm_certificate.app[0].arn
  ) : null
}

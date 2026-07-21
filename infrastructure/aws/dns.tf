# Todos los recursos de este archivo solo se crean si manage_do_dns = true.
# Agregan ÚNICAMENTE registros nuevos para el subdominio (var.domain_name) y la
# validación del certificado. NO tocan el apex (medico-bsl.com) ni www.

locals {
  # Registros CNAME de validación del certificado ACM, mapeados al formato de DO.
  acm_validation = var.enable_https ? {
    for dvo in aws_acm_certificate.app[0].domain_validation_options :
    dvo.domain_name => {
      # Host relativo a la zona: "_xxxx.aws.medico-bsl.com." -> "_xxxx.aws"
      name  = trimsuffix(dvo.resource_record_name, ".${var.do_domain}.")
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  } : {}
}

# Registros de validación del certificado en el DNS de DO.
resource "digitalocean_record" "acm_validation" {
  for_each = var.enable_https && var.manage_do_dns ? local.acm_validation : {}

  domain = var.do_domain
  type   = each.value.type
  name   = each.value.name
  value  = each.value.value
  ttl    = 60
}

# Confirma la emisión del certificado una vez propagados los registros.
resource "aws_acm_certificate_validation" "app" {
  count = var.enable_https && var.manage_do_dns ? 1 : 0

  certificate_arn         = aws_acm_certificate.app[0].arn
  validation_record_fqdns = [for r in digitalocean_record.acm_validation : r.fqdn]
}

# Subdominio aws.medico-bsl.com -> DNS del ALB.
resource "digitalocean_record" "app" {
  count = var.manage_do_dns ? 1 : 0

  domain = var.do_domain
  type   = "CNAME"
  name   = trimsuffix(var.domain_name, ".${var.do_domain}") # "aws"
  value  = "${aws_lb.app.dns_name}."                        # DO requiere punto final
  ttl    = 300
}

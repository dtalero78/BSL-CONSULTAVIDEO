provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "bsl-consultavideo"
      Environment = "aws-parallel"
      ManagedBy   = "terraform"
    }
  }
}

# Solo se usa si var.manage_do_dns = true (para crear el subdominio aws.medico-bsl.com
# y los registros de validación del certificado ACM en el DNS de DigitalOcean).
# NO toca el apex ni www: solo agrega registros nuevos.
provider "digitalocean" {
  token = var.digitalocean_token
}

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.34"
    }
  }

  # Opcional: descomenta para guardar el state remoto en S3 en vez de local.
  # backend "s3" {
  #   bucket = "bsl-consultavideo-tfstate"
  #   key    = "aws/parallel.tfstate"
  #   region = "us-east-1"
  # }
}

# Los VALORES de los secrets NO viven en Terraform: se suben a SSM con
# scripts/load-secrets-to-ssm.sh (leyendo backend/.env) ANTES del apply.
# Aquí solo construimos las referencias (ARNs) que consume el task def de ECS,
# de modo que el state de Terraform nunca contiene los valores.

locals {
  secret_keys = [
    for line in split("\n", file("${path.module}/secret-keys.txt")) :
    trimspace(line)
    if trimspace(line) != "" && !startswith(trimspace(line), "#")
  ]

  ssm_arn_base = "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${var.ssm_prefix}"

  # Bloque `secrets` del container definition: nombre de la env var -> ARN del parámetro SSM.
  container_secrets = [
    for key in local.secret_keys : {
      name      = key
      valueFrom = "${local.ssm_arn_base}/${key}"
    }
  ]
}

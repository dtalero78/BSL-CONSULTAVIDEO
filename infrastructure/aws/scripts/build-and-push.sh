#!/usr/bin/env bash
#
# Construye la imagen con el Dockerfile RAÍZ (sin modificarlo) y la sube a ECR.
#
# Uso:
#   AWS_REGION=us-east-1 ./scripts/build-and-push.sh [tag]
#
# Variables opcionales:
#   AWS_PROFILE   perfil de la CLI de AWS
#   AWS_REGION    región (default us-east-1)
#   ECR_REPO      URL del repo ECR. Si no se define, se lee de `terraform output`.
#   PLATFORM      linux/amd64 (default) o linux/arm64 (debe coincidir con
#                 cpu_architecture en terraform.tfvars: X86_64 / ARM64)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

AWS_REGION="${AWS_REGION:-us-east-1}"
PLATFORM="${PLATFORM:-linux/amd64}"
TAG="${1:-latest}"

command -v docker >/dev/null 2>&1 || { echo "ERROR: falta docker"; exit 1; }
command -v aws >/dev/null 2>&1    || { echo "ERROR: falta la CLI de aws"; exit 1; }
# El daemon debe estar CORRIENDO, no sólo instalado: con Docker Desktop apagado,
# el build falla pero un `apply` encadenado seguía desplegando un tag inexistente
# (CannotPullContainerError) y el rollout se quedaba pegado.
docker info >/dev/null 2>&1 || { echo "ERROR: el daemon de Docker no responde (¿Docker Desktop apagado?)"; exit 1; }

# URL del repo ECR (de la variable de entorno o del output de Terraform)
if [[ -z "${ECR_REPO:-}" ]]; then
  echo "Leyendo ecr_repository_url de Terraform..."
  ECR_REPO="$(terraform -chdir="$TF_DIR" output -raw ecr_repository_url)"
fi
[[ -n "$ECR_REPO" ]] || { echo "ERROR: no se pudo determinar ECR_REPO"; exit 1; }

REGISTRY="${ECR_REPO%%/*}"   # <acct>.dkr.ecr.<region>.amazonaws.com
IMAGE="$ECR_REPO:$TAG"

echo "Registry : $REGISTRY"
echo "Imagen   : $IMAGE"
echo "Platform : $PLATFORM"
echo ""

echo "==> Login a ECR"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"

echo "==> docker build (Dockerfile raíz, contexto = $REPO_ROOT)"
docker build \
  --platform "$PLATFORM" \
  -f "$REPO_ROOT/Dockerfile" \
  -t "$IMAGE" \
  "$REPO_ROOT"

echo "==> docker push"
docker push "$IMAGE"

echo ""
echo "Listo. Imagen publicada: $IMAGE"
echo "Ahora: terraform apply (o, si ya está desplegado, force-new-deployment)."

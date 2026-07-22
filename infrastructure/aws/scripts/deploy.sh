#!/usr/bin/env bash
#
# Despliegue completo y seguro: build → push → task def → rollout → verificación.
#
# Uso:
#   ./scripts/deploy.sh chime-v23
#
# Por qué existe: encadenar los pasos a mano es frágil. Dos veces pasó que el
# build falló (Docker Desktop apagado) pero el `terraform apply` corrió igual,
# dejando la task def apuntando a una imagen inexistente → el servicio no podía
# arrancar (CannotPullContainerError) y el rollout se quedaba pegado. Aquí cada
# paso ABORTA el siguiente si falla (set -e), y además se verifica que la imagen
# exista en ECR antes de tocar la task def.
#
# OJO: desplegar reinicia la tarea y corta las videollamadas en curso.
# Preferir fuera del horario de consulta.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

TAG="${1:-}"
[[ -n "$TAG" ]] || { echo "Uso: $0 <tag>   (ej. chime-v23)"; exit 1; }

CLUSTER="${CLUSTER:-bsl-consultavideo-cluster}"
SERVICE="${SERVICE:-bsl-consultavideo}"
REPO="${REPO:-bsl-consultavideo}"
HEALTH_URL="${HEALTH_URL:-https://aws.medico-bsl.com/health}"

echo "==> 1/5 build + push ($TAG)"
"$SCRIPT_DIR/build-and-push.sh" "$TAG"

echo "==> 2/5 verificar que la imagen existe en ECR"
aws ecr describe-images --repository-name "$REPO" --image-ids "imageTag=$TAG" \
  --query 'imageDetails[0].imagePushedAt' --output text >/dev/null \
  || { echo "ERROR: $TAG no está en ECR; no se toca la task def"; exit 1; }

echo "==> 3/5 fijar el tag en terraform.tfvars y aplicar"
if grep -q '^image_tag' "$TF_DIR/terraform.tfvars"; then
  sed -i '' "s|^image_tag.*|image_tag = \"$TAG\"|" "$TF_DIR/terraform.tfvars"
else
  echo "image_tag = \"$TAG\"" >> "$TF_DIR/terraform.tfvars"
fi
terraform -chdir="$TF_DIR" apply -auto-approve

echo "==> 4/5 esperando rollout"
aws ecs wait services-stable --cluster "$CLUSTER" --services "$SERVICE"

echo "==> 5/5 verificación"
aws ecs describe-task-definition --task-definition "$SERVICE" \
  --query 'taskDefinition.{rev:revision,image:containerDefinitions[0].image}' --output text
CODE="$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH_URL")"
echo "health: HTTP $CODE"
[[ "$CODE" == "200" ]] || { echo "ERROR: health no responde 200"; exit 1; }

echo "✅ DEPLOY $TAG LISTO"

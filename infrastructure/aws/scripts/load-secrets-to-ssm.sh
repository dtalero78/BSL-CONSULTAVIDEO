#!/usr/bin/env bash
#
# Sube a AWS SSM Parameter Store (SecureString) los secrets que consume el task
# de ECS, leyendo los VALORES desde backend/.env y la LISTA de claves desde
# infrastructure/aws/secret-keys.txt.
#
# Correr ANTES del primer `terraform apply` (y de nuevo si cambian los valores).
# Compatible con Bash 3.2 (el que trae macOS).
#
# Uso:
#   AWS_REGION=us-east-1 ./scripts/load-secrets-to-ssm.sh
#
# Variables opcionales:
#   AWS_PROFILE   perfil de la CLI de AWS
#   AWS_REGION    región (default us-east-1)
#   SSM_PREFIX    prefijo de los parámetros (default /bsl-consultavideo/aws)
#   ENV_FILE      ruta al .env (default <repo>/backend/.env)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

AWS_REGION="${AWS_REGION:-us-east-1}"
SSM_PREFIX="${SSM_PREFIX:-/bsl-consultavideo/aws}"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/backend/.env}"
KEYS_FILE="$SCRIPT_DIR/../secret-keys.txt"

command -v aws >/dev/null 2>&1 || { echo "ERROR: falta la CLI de aws"; exit 1; }
[[ -f "$ENV_FILE" ]]  || { echo "ERROR: no existe $ENV_FILE"; exit 1; }
[[ -f "$KEYS_FILE" ]] || { echo "ERROR: no existe $KEYS_FILE"; exit 1; }

# Devuelve el valor de una clave en $ENV_FILE (split en el primer '=').
# Falla (return 1) si la clave no existe.
get_env_value() {
  local key="$1" line val
  line="$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -1 || true)"
  [[ -z "$line" ]] && return 1
  line="${line%$'\r'}"                       # quita CR de Windows
  val="${line#*=}"                           # todo lo que sigue al primer '='
  # quita comillas envolventes si las hay
  if [[ "$val" == \"*\" ]]; then val="${val%\"}"; val="${val#\"}"; fi
  if [[ "$val" == \'*\' ]]; then val="${val%\'}"; val="${val#\'}"; fi
  printf '%s' "$val"
}

uploaded=0; missing=0
while IFS= read -r rawkey || [[ -n "$rawkey" ]]; do
  key="${rawkey%$'\r'}"
  key="${key#"${key%%[![:space:]]*}"}"       # trim izquierda
  key="${key%"${key##*[![:space:]]}"}"       # trim derecha
  [[ -z "$key" || "$key" == \#* ]] && continue

  if ! value="$(get_env_value "$key")"; then
    echo "  ⚠️  $key no está en $ENV_FILE — se omite"
    missing=$((missing+1))
    continue
  fi

  aws ssm put-parameter \
    --region "$AWS_REGION" \
    --name "$SSM_PREFIX/$key" \
    --type SecureString \
    --value "$value" \
    --overwrite \
    --no-cli-pager >/dev/null

  echo "  ✅ $SSM_PREFIX/$key"
  uploaded=$((uploaded+1))
done < "$KEYS_FILE"

echo ""
echo "Listo: $uploaded parámetros subidos, $missing omitidos (región $AWS_REGION)."
[[ "$missing" -gt 0 ]] && echo "Revisa las claves omitidas antes de aplicar Terraform."
exit 0

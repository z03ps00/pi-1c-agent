#!/usr/bin/env bash
# Portable OpenViking + Cognee bring-up. No lab network, no tunnel reconnect.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULTS="$ROOT_DIR/defaults.env"
RENDER="$ROOT_DIR/scripts/render-openviking-config.sh"
CLIENT_ENV="$ROOT_DIR/secrets/openviking-client.env"
ROOT_ENV="$ROOT_DIR/secrets/openviking-root.env"
ROUTERAI_ENV="$ROOT_DIR/secrets/routerai.env"

usage() {
  cat <<'EOF'
Usage: memory-stack.sh <command> [provider]

Commands:
  up [routerai|ollama]   Render config, start both servers, wait health, provision OpenViking client key
  down                   Stop containers; keep data
  status                 Container + HTTP health for knowledge (1933) and memory (8001)
  disable                Same as down (data preserved). Remove mcp.json memory/knowledge entries separately.
  config [routerai|ollama]
                         Print interpolated compose config (no start)

Default provider: routerai
EOF
}

load_defaults() {
  if [ -r "$DEFAULTS" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$DEFAULTS"
    set +a
  fi
  MEMORY_DATA_ROOT="${MEMORY_DATA_ROOT:-$ROOT_DIR/data}"
  export MEMORY_DATA_ROOT
}

write_compose_env() {
  umask 077
  {
    cat "$DEFAULTS"
    printf 'MEMORY_DATA_ROOT=%s\n' "$MEMORY_DATA_ROOT"
    if [ -r "$ROUTERAI_ENV" ]; then
      cat "$ROUTERAI_ENV"
    fi
  } > "$ROOT_DIR/.env"
  chmod 600 "$ROOT_DIR/.env"
}

load_optional_secrets() {
  if [ -r "$ROUTERAI_ENV" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ROUTERAI_ENV"
    set +a
  fi
  if [ -r "$ROOT_ENV" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ROOT_ENV"
    set +a
  fi
  if [ -r "$CLIENT_ENV" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$CLIENT_ENV"
    set +a
  fi
}

normalize_provider() {
  case "${1:-routerai}" in
    routerai|"") printf 'routerai\n' ;;
    ollama|local) printf 'ollama\n' ;;
    *)
      printf 'Unknown provider: %s (expected routerai or ollama)\n' "$1" >&2
      return 1
      ;;
  esac
}

compose_files() {
  local provider="$1"
  local args=(-f "$ROOT_DIR/compose.yml")
  case "$provider" in
    routerai) args+=(-f "$ROOT_DIR/compose.routerai.yml") ;;
    ollama) args+=(-f "$ROOT_DIR/compose.ollama.yml") ;;
  esac
  printf '%s\n' "${args[@]}"
}

compose_cmd() {
  local provider="$1"
  shift
  local files
  mapfile -t files < <(compose_files "$provider")
  (cd "$ROOT_DIR" && docker compose "${files[@]}" "$@")
}

ensure_root_key() {
  mkdir -p "$ROOT_DIR/secrets"
  if [ -r "$ROOT_ENV" ] && grep -Eq '^OPENVIKING_ROOT_API_KEY=.+' "$ROOT_ENV"; then
    return 0
  fi
  umask 077
  local key
  key="$(openssl rand -hex 32)"
  printf 'OPENVIKING_ROOT_API_KEY=%s\n' "$key" > "$ROOT_ENV"
  chmod 600 "$ROOT_ENV"
  printf 'Generated OpenViking root key in secrets/openviking-root.env\n' >&2
}

require_routerai_key() {
  if [ -z "${ROUTERAI_API_KEY:-}" ]; then
    printf 'Missing ROUTERAI_API_KEY in secrets/routerai.env (copy secrets/routerai.env.example). Models and ports are already defaulted.\n' >&2
    return 1
  fi
}

wait_health() {
  local name="$1" url="$2" code="" i
  for i in $(seq 1 90); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 1 --max-time 5 "$url" 2>/dev/null || true)"
    if [ "$code" = "200" ]; then
      return 0
    fi
    sleep 2
  done
  printf '%s did not become healthy at %s\n' "$name" "$url" >&2
  return 1
}

extract_user_key() {
  python3 - "$1" <<'PY'
import json
import sys

try:
    with open(sys.argv[1], encoding="utf-8") as stream:
        payload = json.load(stream)
    result = payload.get("result", {})
    key = result.get("user_key") if isinstance(result, dict) else None
    if not key:
        key = payload.get("user_key")
    if key:
        print(key)
except (OSError, ValueError, TypeError):
    pass
PY
}

provision_client_key() {
  local admin_url="${MEMORY_ADMIN_URL:-http://127.0.0.1:${MEMORY_OPENVIKING_PORT:-1933}}"
  if [ -r "$CLIENT_ENV" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$CLIENT_ENV"
    set +a
    if [ -n "${OPENVIKING_CLIENT_API_KEY:-}" ]; then
      return 0
    fi
  fi
  if [ -z "${OPENVIKING_ROOT_API_KEY:-}" ]; then
    printf 'OPENVIKING_ROOT_API_KEY missing; cannot provision client key\n' >&2
    return 1
  fi
  local body tmp code key
  body="$(mktemp)"
  code="$(curl -sS --max-time 30 -o "$body" -w '%{http_code}' \
    -X POST "${admin_url}/api/v1/admin/accounts" \
    -H "X-API-Key: ${OPENVIKING_ROOT_API_KEY}" \
    -H 'Content-Type: application/json' \
    -d '{"account_id":"mcp_workspace","admin_user_id":"agent"}' 2>/dev/null || true)"
  key="$(extract_user_key "$body")"
  if [ -z "$key" ]; then
    code="$(curl -sS --max-time 30 -o "$body" -w '%{http_code}' \
      -X POST "${admin_url}/api/v1/admin/accounts/mcp_workspace/users/agent/key" \
      -H "X-API-Key: ${OPENVIKING_ROOT_API_KEY}" \
      -H 'Content-Type: application/json' \
      -d '{}' 2>/dev/null || true)"
    key="$(extract_user_key "$body")"
  fi
  rm -f "$body"
  if [ -z "$key" ]; then
    printf 'Failed to provision OpenViking client key (HTTP %s)\n' "$code" >&2
    return 1
  fi
  tmp="$(mktemp "${CLIENT_ENV}.tmp.XXXXXX")"
  umask 077
  {
    printf 'OPENVIKING_CLIENT_API_KEY=%s\n' "$key"
    printf 'OPENVIKING_CLIENT_ACCOUNT_ID=mcp_workspace\n'
    printf 'OPENVIKING_CLIENT_USER_ID=agent\n'
  } > "$tmp"
  chmod 600 "$tmp"
  mv -f "$tmp" "$CLIENT_ENV"
  printf 'OpenViking client key written to secrets/openviking-client.env\n' >&2
}

pull_ollama_models() {
  local llm="${OLLAMA_LLM_MODEL:-qwen3.5:9b}"
  local emb="${OLLAMA_EMBEDDING_MODEL:-bge-m3:latest}"
  printf 'Pulling Ollama models %s and %s\n' "$llm" "$emb" >&2
  docker exec pi-1c-memory-ollama ollama pull "$llm"
  docker exec pi-1c-memory-ollama ollama pull "$emb"
}

cmd_up() {
  local provider
  provider="$(normalize_provider "${1:-routerai}")"
  load_defaults
  load_optional_secrets
  mkdir -p "$MEMORY_DATA_ROOT/openviking" "$MEMORY_DATA_ROOT/cognee/system" "$MEMORY_DATA_ROOT/cognee/data"
  ensure_root_key
  load_optional_secrets
  if [ "$provider" = "routerai" ]; then
    require_routerai_key
  fi
  write_compose_env
  if [ ! -x "$RENDER" ]; then
    chmod +x "$RENDER" || true
  fi
  if [ "$provider" = "ollama" ]; then
    compose_cmd "$provider" up -d ollama
    wait_health "Ollama" "http://127.0.0.1:${MEMORY_OLLAMA_PORT:-11434}/api/tags"
    pull_ollama_models
  fi
  "$RENDER" "$provider"
  printf 'Starting memory stack (%s)\n' "$provider" >&2
  compose_cmd "$provider" up -d
  wait_health "OpenViking" "http://127.0.0.1:${MEMORY_OPENVIKING_PORT:-1933}/health"
  wait_health "Cognee" "http://127.0.0.1:${MEMORY_COGNEE_PORT:-8001}/health"
  provision_client_key
  printf 'Memory stack healthy (%s). knowledge=http://127.0.0.1:%s/mcp memory=http://127.0.0.1:%s/mcp dataset=%s\n' \
    "$provider" "${MEMORY_OPENVIKING_PORT:-1933}" "${MEMORY_COGNEE_PORT:-8001}" "${COGNEE_DATASET:-main_dataset}"
}

cmd_down() {
  load_defaults
  write_compose_env
  # Stop both overlays if present; volumes/data stay on disk.
  (cd "$ROOT_DIR" && docker compose -f compose.yml -f compose.routerai.yml stop) >/dev/null 2>&1 || true
  (cd "$ROOT_DIR" && docker compose -f compose.yml -f compose.ollama.yml stop) >/dev/null 2>&1 || true
  docker stop pi-1c-memory-openviking pi-1c-memory-cognee pi-1c-memory-ollama >/dev/null 2>&1 || true
  printf 'Memory stack stopped; data in %s preserved\n' "${MEMORY_DATA_ROOT:-$ROOT_DIR/data}"
}

cmd_status() {
  load_defaults
  local c st health image
  for c in pi-1c-memory-openviking pi-1c-memory-cognee pi-1c-memory-ollama; do
    st="$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo missing)"
    health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$c" 2>/dev/null || echo none)"
    image="$(docker inspect -f '{{.Config.Image}}' "$c" 2>/dev/null || echo missing)"
    printf '%s status=%s health=%s image=%s\n' "$c" "$st" "$health" "$image"
  done
  local ov cognee
  ov="http://127.0.0.1:${MEMORY_OPENVIKING_PORT:-1933}/health"
  cognee="http://127.0.0.1:${MEMORY_COGNEE_PORT:-8001}/health"
  curl -sS -o /dev/null -w "knowledge ${ov} %{http_code}\n" --connect-timeout 1 --max-time 5 "$ov" 2>/dev/null || printf 'knowledge %s FAIL\n' "$ov"
  curl -sS -o /dev/null -w "memory ${cognee} %{http_code}\n" --connect-timeout 1 --max-time 5 "$cognee" 2>/dev/null || printf 'memory %s FAIL\n' "$cognee"
}

cmd_config() {
  local provider
  provider="$(normalize_provider "${1:-routerai}")"
  load_defaults
  load_optional_secrets
  if [ "$provider" = "routerai" ] && [ -z "${ROUTERAI_API_KEY:-}" ]; then
    ROUTERAI_API_KEY="dummy-for-config"
    export ROUTERAI_API_KEY
  fi
  write_compose_env
  compose_cmd "$provider" config
}

cmd="${1:-}"
shift || true
case "$cmd" in
  up) cmd_up "${1:-routerai}" ;;
  down|disable) cmd_down ;;
  status) cmd_status ;;
  config) cmd_config "${1:-routerai}" ;;
  -h|--help|help|"") usage ;;
  *) usage >&2; exit 2 ;;
esac

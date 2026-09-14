#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="${1:-routerai}"
ROOT_ENV="$ROOT_DIR/secrets/openviking-root.env"
ROUTERAI_ENV="$ROOT_DIR/secrets/routerai.env"
DEFAULTS="$ROOT_DIR/defaults.env"
TEMPLATE="$ROOT_DIR/config/openviking/ov.conf.template"
DATA_ROOT="${MEMORY_DATA_ROOT:-$ROOT_DIR/data}"
OUTPUT="$DATA_ROOT/openviking/ov.conf"

if [ -r "$DEFAULTS" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$DEFAULTS"
  set +a
fi

EMBEDDING_API_BASE="${OLLAMA_INTERNAL_URL:-http://ollama:11434}/v1"
EMBEDDING_API_KEY="no-key"
EMBEDDING_MODEL="${OLLAMA_EMBEDDING_MODEL:-bge-m3:latest}"
EMBEDDING_ENCODING_FORMAT="null"

if [ ! -r "$ROOT_ENV" ]; then
  printf 'Missing %s\n' "$ROOT_ENV" >&2
  exit 1
fi

set -a
# These files are generated locally and are mode 0600.
# shellcheck disable=SC1090
. "$ROOT_ENV"
set +a

if [ -z "${OPENVIKING_ROOT_API_KEY:-}" ]; then
  printf 'OPENVIKING_ROOT_API_KEY is empty\n' >&2
  exit 1
fi

case "$PROFILE" in
  ollama|local)
    VLM_PROVIDER="litellm"
    VLM_API_BASE="${OLLAMA_INTERNAL_URL:-http://ollama:11434}"
    VLM_API_KEY="no-key"
    VLM_MODEL="${OLLAMA_VLM_MODEL:-ollama/qwen3.5:9b}"
    ;;
  routerai)
    if [ -r "$ROUTERAI_ENV" ]; then
      set -a
      # shellcheck disable=SC1090
      . "$ROUTERAI_ENV"
      set +a
    fi
    if [ -z "${ROUTERAI_API_KEY:-}" ]; then
      printf 'ROUTERAI_API_KEY is required for the routerai profile\n' >&2
      exit 1
    fi
    ROUTERAI_MODEL="${ROUTERAI_MODEL:-qwen/qwen3.5-9b}"
    VLM_PROVIDER="openai"
    VLM_API_BASE="${ROUTERAI_ENDPOINT:-https://routerai.ru/api/v1}"
    VLM_API_KEY="$ROUTERAI_API_KEY"
    VLM_MODEL="$ROUTERAI_MODEL"
    EMBEDDING_API_BASE="${ROUTERAI_ENDPOINT:-https://routerai.ru/api/v1}"
    EMBEDDING_API_KEY="$ROUTERAI_API_KEY"
    EMBEDDING_MODEL="${ROUTERAI_EMBEDDING_MODEL:-qwen/qwen3-embedding-8b}"
    EMBEDDING_ENCODING_FORMAT='"float"'
    ;;
  *)
    printf 'Unknown profile: %s (expected routerai or ollama)\n' "$PROFILE" >&2
    exit 1
    ;;
esac

if [ ! -r "$TEMPLATE" ]; then
  printf 'Missing %s\n' "$TEMPLATE" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"
config="$(<"$TEMPLATE")"
config="${config//__OPENVIKING_ROOT_API_KEY__/$OPENVIKING_ROOT_API_KEY}"
config="${config//__OPENVIKING_EMBEDDING_API_BASE__/$EMBEDDING_API_BASE}"
config="${config//__OPENVIKING_EMBEDDING_API_KEY__/$EMBEDDING_API_KEY}"
config="${config//__OPENVIKING_EMBEDDING_MODEL__/$EMBEDDING_MODEL}"
config="${config//__OPENVIKING_EMBEDDING_ENCODING_FORMAT__/$EMBEDDING_ENCODING_FORMAT}"
config="${config//__OPENVIKING_VLM_API_BASE__/$VLM_API_BASE}"
config="${config//__OPENVIKING_VLM_API_KEY__/$VLM_API_KEY}"
config="${config//__OPENVIKING_VLM_PROVIDER__/$VLM_PROVIDER}"
config="${config//__OPENVIKING_VLM_MODEL__/$VLM_MODEL}"

umask 077
tmp="$OUTPUT.tmp.$$"
printf '%s\n' "$config" > "$tmp"
chmod 600 "$tmp"
mv -f "$tmp" "$OUTPUT"

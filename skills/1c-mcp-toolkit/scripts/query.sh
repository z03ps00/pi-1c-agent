#!/usr/bin/env bash
# execute_query к MCP Toolkit.
# Использование: query.sh "ВЫБРАТЬ 1 КАК Поле" [out.json]
# Порт: MCP_TOOLKIT_PORT (по умолчанию 6003).
set -euo pipefail
PORT="${MCP_TOOLKIT_PORT:-6003}"
Q="${1:?Укажите текст запроса первым аргументом}"
OUT="${2:-}"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
if command -v jq >/dev/null 2>&1; then
  printf '%s' "$Q" | jq -Rs '{query: .}' > "$TMP"
else
  python3 -c "import json,sys; print(json.dumps({'query': sys.argv[1]}))" "$Q" > "$TMP"
fi
if [ -n "$OUT" ]; then
  curl -s --max-time 30 -X POST "http://localhost:${PORT}/api/execute_query" \
    -H "Content-Type: application/json; charset=utf-8" --data-binary @"$TMP" > "$OUT"
  echo "saved -> $OUT (читать через Read для корректной кириллицы)"
else
  curl -s --max-time 30 -X POST "http://localhost:${PORT}/api/execute_query" \
    -H "Content-Type: application/json; charset=utf-8" --data-binary @"$TMP"
  echo ""
fi

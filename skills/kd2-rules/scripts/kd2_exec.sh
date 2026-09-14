#!/usr/bin/env bash
# execute_code к toolkit КД 2.0 из BSL-файла (клиентский контекст toolkit).
# Использование: kd2_exec.sh script.bsl [out.json]
# Результат через переменную Результат, не Возврат.
# Порт: KD2_PORT (по умолчанию 7003).
set -euo pipefail
PORT="${KD2_PORT:-7003}"
BSL="${1:?Укажите путь к BSL-файлу первым аргументом}"
OUT="${2:-}"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
if command -v jq >/dev/null 2>&1; then
  jq -Rs '{code: .}' "$BSL" > "$TMP"
else
  python3 -c "import json,io,sys; print(json.dumps({'code': io.open(sys.argv[1], encoding='utf-8').read()}))" "$BSL" > "$TMP"
fi
if [ -n "$OUT" ]; then
  curl -s --max-time 60 -X POST "http://localhost:${PORT}/api/execute_code" \
    -H "Content-Type: application/json; charset=utf-8" --data-binary @"$TMP" > "$OUT"
  echo "saved -> $OUT (читать через Read для корректной кириллицы)"
else
  curl -s --max-time 60 -X POST "http://localhost:${PORT}/api/execute_code" \
    -H "Content-Type: application/json; charset=utf-8" --data-binary @"$TMP"
  echo ""
fi

#!/usr/bin/env bash
# Probe typical MCP Toolkit HTTP ports. Prints "порт N жив" for each hit.
# Extra ports: MCP_TOOLKIT_PORT, KD2_PORT, KD31_PORT (env).
set -euo pipefail
PORTS=(6003 6004 6005 6010 6011 6013 6023 6033 7003)
for extra in "${MCP_TOOLKIT_PORT:-}" "${KD2_PORT:-}" "${KD31_PORT:-}"; do
  [[ -n "$extra" ]] && PORTS+=("$extra")
done
seen=""
found=0
for p in "${PORTS[@]}"; do
  case " $seen " in
    *" $p "*) continue ;;
  esac
  seen+=" $p"
  if curl -sS -m 2 "http://localhost:${p}/health" >/dev/null 2>&1; then
    echo "порт $p жив"
    found=1
  fi
done
if [[ "$found" -eq 0 ]]; then
  echo "ни один порт toolkit не ответил (откройте tools/mcp-toolkit/MCP_Toolkit.epf в клиенте 1С)" >&2
  exit 1
fi

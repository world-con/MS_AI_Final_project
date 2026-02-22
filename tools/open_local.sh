#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT_CANDIDATE="${1:-${PORT:-3000}}"
HOST="127.0.0.1"
LOG_FILE="/tmp/twincity_ui_dev.log"

pick_available_port() {
  local port="$1"
  while lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; do
    port=$((port + 1))
    if [ "$port" -gt 3999 ]; then
      echo "failed"
      return 1
    fi
  done
  echo "$port"
}

open_url() {
  local url="$1"
  if command -v open >/dev/null 2>&1; then
    open "$url"
    return 0
  fi
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 &
    return 0
  fi
  if command -v start >/dev/null 2>&1; then
    start "$url"
    return 0
  fi
  return 1
}

find_running_port() {
  local port
  for port in $(seq 3000 3999); do
    local health
    health="$(curl -sS --max-time 1 "http://${HOST}:${port}/api/health" 2>/dev/null || true)"
    if printf '%s' "$health" | grep -q '"service":"twincity-ui"'; then
      echo "$port"
      return 0
    fi
  done
  return 1
}

if EXISTING_PORT="$(find_running_port)"; then
  echo "[open_local] existing dev server detected: http://${HOST}:${EXISTING_PORT}"
  if ! open_url "http://${HOST}:${EXISTING_PORT}/"; then
    echo "[open_local] browser opener not found. open manually: http://${HOST}:${EXISTING_PORT}/"
  fi
  echo "[open_local] ready"
  echo "[open_local] pid=already-running"
  echo "[open_local] url=http://${HOST}:${EXISTING_PORT}/"
  echo "[open_local] logs=existing-process"
  exit 0
fi

PORT="$(pick_available_port "$PORT_CANDIDATE")"
if [ "$PORT" = "failed" ]; then
  echo "No available port found in 3000-3999."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[open_local] node_modules missing -> npm ci"
  npm ci
fi

echo "[open_local] starting dev server on http://${HOST}:${PORT}"
nohup npm run dev -- --port "$PORT" >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

READY=0
for _ in $(seq 1 120); do
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    break
  fi
  if curl -sS --max-time 2 "http://${HOST}:${PORT}/api/health" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.5
done

if [ "$READY" -ne 1 ]; then
  echo "[open_local] server did not become ready. recent logs:"
  tail -n 80 "$LOG_FILE" || true
  exit 1
fi

if ! open_url "http://${HOST}:${PORT}/"; then
  echo "[open_local] browser opener not found. open manually: http://${HOST}:${PORT}/"
fi

echo "[open_local] ready"
echo "[open_local] pid=${SERVER_PID}"
echo "[open_local] url=http://${HOST}:${PORT}/"
echo "[open_local] logs=${LOG_FILE}"

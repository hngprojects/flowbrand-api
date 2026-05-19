#!/usr/bin/env bash
# Start local MinIO (no Docker). Keep this terminal open while the API handles uploads.
# Usage: bash scripts/start-minio.sh
#        chmod +x scripts/start-minio.sh && ./scripts/start-minio.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${ROOT}/.minio-data"
BUNDLED="${ROOT}/.tools/minio"

mkdir -p "$DATA_DIR"

export MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
export MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}"

if curl -sf --max-time 2 "http://localhost:9000/minio/health/live" >/dev/null 2>&1; then
  echo "MinIO is already running."
  echo "  API:      http://localhost:9000"
  echo "  Console:  http://localhost:9001"
  echo "  User:     ${MINIO_ROOT_USER}"
  exit 0
fi

if command -v minio >/dev/null 2>&1; then
  MINIO_EXE="$(command -v minio)"
elif [[ -x "$BUNDLED" ]]; then
  MINIO_EXE="$BUNDLED"
else
  echo "minio not found."
  echo "Install examples:"
  echo "  Linux: wget https://dl.min.io/server/minio/release/linux-amd64/minio -O ${BUNDLED} && chmod +x ${BUNDLED}"
  echo "  macOS: brew install minio/stable/minio"
  exit 1
fi

echo "MinIO API:       http://localhost:9000"
echo "MinIO Console:   http://localhost:9001"
echo "User / Password: ${MINIO_ROOT_USER} / ${MINIO_ROOT_PASSWORD}"
echo "Data directory:  ${DATA_DIR}"
echo "Binary:          ${MINIO_EXE}"
echo ""

exec "$MINIO_EXE" server "$DATA_DIR" --console-address ":9001" --address ":9000"

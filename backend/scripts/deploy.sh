#!/usr/bin/env bash
# CoalSmart backend deploy: install, test, start.
# Usage: ./scripts/deploy.sh [--skip-tests]
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> coal backend deploy — $(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [[ -f .env ]]; then
  echo "==> loading .env"
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "==> installing dependencies"
npm ci --omit=dev

if [[ "${1:-}" != "--skip-tests" ]]; then
  echo "==> running test suite"
  npm test
fi

echo "==> starting server (PORT=${PORT:-8001})"
exec npm start

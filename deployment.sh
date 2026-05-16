#!/bin/bash
set -euo pipefail

# ================================================================
# deployment.sh
# Called by the CI pipeline after extracting the build tarball.
# Usage: ./deployment.sh <pm2-env>
# Example: ./deployment.sh dev
# ================================================================

PM2_ENV="${1:?Usage: ./deployment.sh <pm2-env> (dev | staging | main)}"
ECOSYSTEM_CONFIG="${PM2_ENV}-ecosystem-config.json"

echo_step() { echo -e "\033[0;32m==> $1\033[0m"; }
echo_error() { echo -e "\033[0;31m==> ERROR: $1\033[0m"; }

# ================================================================
echo_step "Validating ecosystem config exists..."
# ================================================================
if [[ ! -f "$ECOSYSTEM_CONFIG" ]]; then
    echo_error "Ecosystem config '$ECOSYSTEM_CONFIG' not found. Aborting."
    exit 1
fi

# ================================================================
echo_step "Installing production dependencies..."
# ================================================================
pnpm install --prod --ignore-scripts

# ================================================================
# echo_step "Running database migrations..."
# ================================================================
# pnpm run migration:run
# ./node_modules/.bin/typeorm migration:run -d dist/database/data-source.js

# ================================================================
echo_step "Syncing database schema..."
# ================================================================
./node_modules/.bin/typeorm schema:sync -d dist/database/data-source.js

# ================================================================
echo_step "Reloading PM2 process (zero-downtime)..."
# ================================================================
if pm2 describe "$PM2_ENV" > /dev/null 2>&1; then
    echo_step "Process '$PM2_ENV' exists — reloading..."

    pm2 reload "$ECOSYSTEM_CONFIG" --env "$PM2_ENV" --update-env
else
    echo_step "Process '$PM2_ENV' not found — starting fresh..."
    pm2 start "$ECOSYSTEM_CONFIG" --env "$PM2_ENV"
fi

# ================================================================
echo_step "Saving PM2 process list..."
# ================================================================
pm2 save

# ================================================================
echo_step "Deploy complete for environment: $PM2_ENV"
# ================================================================

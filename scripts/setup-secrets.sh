#!/usr/bin/env bash
# Reads .env.local and pushes secrets to Supabase Edge Functions.
# Run from repo root: bash scripts/setup-secrets.sh

set -eo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "ERROR: .env.local not found in $(pwd)"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.local
set +a

: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN not set in .env.local}"
: "${TELEGRAM_MANAGER_CHAT_ID:?TELEGRAM_MANAGER_CHAT_ID not set in .env.local}"
: "${ZORONAL_WEBHOOK_SECRET:?ZORONAL_WEBHOOK_SECRET not set in .env.local}"

echo "Setting Supabase Edge Function secrets..."

supabase secrets set \
  TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN}" \
  TELEGRAM_MANAGER_CHAT_ID="${TELEGRAM_MANAGER_CHAT_ID}" \
  ZORONAL_WEBHOOK_SECRET="${ZORONAL_WEBHOOK_SECRET}"

echo ""
echo "Verifying:"
supabase secrets list

echo ""
echo "Done. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase at runtime;"
echo "you do NOT need to set those manually."

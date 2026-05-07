#!/usr/bin/env bash
# Registers the telegram-callback Edge Function URL as the bot's webhook.

set -eo pipefail
cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

: "${SUPABASE_URL:?SUPABASE_URL not set}"
: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN not set}"

WEBHOOK_URL="${SUPABASE_URL}/functions/v1/telegram-callback"

echo "Setting Telegram webhook to: $WEBHOOK_URL"
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"${WEBHOOK_URL}\",\"allowed_updates\":[\"callback_query\"]}"
echo

echo ""
echo "Verifying:"
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
echo

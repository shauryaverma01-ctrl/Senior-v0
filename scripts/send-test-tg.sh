#!/usr/bin/env bash
# Inserts a fake reservation row in Supabase, then sends a Telegram notification
# with Confirm/Decline/Callback buttons. Use this to verify the round-trip.

set -eo pipefail
cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

: "${SUPABASE_URL:?SUPABASE_URL not set}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY not set}"
: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN not set}"
: "${TELEGRAM_MANAGER_CHAT_ID:?TELEGRAM_MANAGER_CHAT_ID not set}"

CALL_ID="manual_test_$(date +%s)"
TOMORROW=$(date -v+1d +%Y-%m-%d 2>/dev/null || date -d '+1 day' +%Y-%m-%d)

echo "Creating fake call: $CALL_ID"
curl -s -X POST "${SUPABASE_URL}/rest/v1/calls" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"id\": \"${CALL_ID}\",
    \"restaurant_id\": \"00000000-0000-0000-0000-000000000001\",
    \"caller_number\": \"+919999900000\",
    \"intent\": \"reservation\",
    \"status\": \"completed\"
  }" > /dev/null

echo "Inserting fake reservation..."
RESV_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/rest/v1/reservations" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"call_id\": \"${CALL_ID}\",
    \"restaurant_id\": \"00000000-0000-0000-0000-000000000001\",
    \"customer_name\": \"Test Customer\",
    \"customer_phone\": \"+919999900000\",
    \"party_size\": 4,
    \"booking_date\": \"${TOMORROW}\",
    \"booking_time\": \"20:00\",
    \"special_requests\": \"window seat please\"
  }")

RESV_ID=$(echo "$RESV_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)[0]['id'])" 2>/dev/null || echo "PARSE_FAILED")

if [ "$RESV_ID" = "PARSE_FAILED" ]; then
  echo "ERROR: Could not parse reservation response. Raw output:"
  echo "$RESV_RESPONSE"
  exit 1
fi

echo "  → reservation id: $RESV_ID"

PAYLOAD=$(cat <<EOF
{
  "chat_id": "${TELEGRAM_MANAGER_CHAT_ID}",
  "text": "<b>NEW BOOKING (manual test)</b>\nTest Customer · party of 4\n${TOMORROW} 20:00\n+919999900000\nNotes: window seat please",
  "parse_mode": "HTML",
  "reply_markup": {
    "inline_keyboard": [
      [
        {"text": "✅ Confirm", "callback_data": "confirm:${RESV_ID}"},
        {"text": "❌ Decline", "callback_data": "decline:${RESV_ID}"}
      ],
      [{"text": "📞 Call back", "callback_data": "callback:${RESV_ID}"}]
    ]
  }
}
EOF
)

echo "Sending Telegram message..."
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
echo

echo ""
echo "✓ Done. Check your phone — Telegram should buzz with Confirm/Decline/Callback buttons."
echo "  Reservation id: $RESV_ID"
echo "  After tapping a button, refresh Supabase Table Editor → reservations to see status update."

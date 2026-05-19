#!/usr/bin/env bash
# Tests the deployed escalate-call Edge Function.
# Run AFTER `supabase secrets set MANAGER_ESCALATION_PHONE=+91XXXXXXXXXX`
# and `supabase functions deploy escalate-call`.
# Each scenario fires a real Telegram alert — check your manager chat after.

set -eo pipefail
cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

: "${SUPABASE_URL:?SUPABASE_URL not set in .env.local}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY not set in .env.local}"

URL="${SUPABASE_URL}/functions/v1/escalate-call"
AUTH="Authorization: Bearer ${SUPABASE_ANON_KEY}"

echo "── Test 1: happy path (asked_for_manager + caller_number + summary)"
echo "   → expect action=transfer, target_number=<from MANAGER_ESCALATION_PHONE secret>, Telegram alert"
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{
    "reason": "asked_for_manager",
    "caller_number": "+918888888888",
    "summary_so_far": "Test 1 — asked for manager directly after welcome."
  }'
echo
echo

echo "── Test 2: minimal payload (no caller_number, no summary)"
echo "   → expect action=transfer, Telegram with fallback context line"
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"reason": "asked_for_manager"}'
echo
echo

echo "── Test 3: bad JSON"
echo "   → expect 200, action=transfer (defaults apply), Telegram still fires"
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d 'not-json'
echo
echo

echo "Done. Check Telegram — expect 3 urgent alerts (one per test)."

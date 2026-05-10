#!/usr/bin/env bash
# Tests the deployed lookup-guest Edge Function with 4 scenarios.
# Run AFTER 0002_guests.sql is applied AND lookup-guest is deployed.
# See SENIOR_V0_STRATEGY.html section 21, flow F1.

set -eo pipefail
cd "$(dirname "$0")/.."

# Load .env.local
if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

: "${SUPABASE_URL:?SUPABASE_URL not set in .env.local}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY not set in .env.local}"

URL="${SUPABASE_URL}/functions/v1/lookup-guest"
AUTH="Authorization: Bearer ${SUPABASE_ANON_KEY}"
TBDC="00000000-0000-0000-0000-000000000001"

echo "── Test 1: unknown number (should return known:false)"
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d "{\"phone_e164\":\"+919999999999\",\"restaurant_id\":\"$TBDC\"}"
echo

echo "── Test 2: bad json (should return ok:false reason bad_json)"
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d 'not-json'
echo

echo "── Test 3: missing restaurant_id (should return missing_fields)"
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"phone_e164":"+919876543210"}'
echo

echo "── Test 4: messy local-format phone (helper should normalize to E.164)"
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d "{\"phone_e164\":\"9876543210\",\"restaurant_id\":\"$TBDC\"}"
echo

echo
echo "── To create a real guest row and re-test recall:"
echo "   In Supabase SQL Editor, run:"
echo "     insert into guests (restaurant_id, phone_e164, name, last_visit_summary, allergens)"
echo "     values ('$TBDC', '+919876543210', 'Raman', 'Party of 2, window table, 6 May 2026', array['peanut']);"
echo "   Then re-run Test 4 — should return known:true with a context block."

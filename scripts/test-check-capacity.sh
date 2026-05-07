#!/usr/bin/env bash
# Tests the deployed check-capacity Edge Function with 4 scenarios.

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

URL="${SUPABASE_URL}/functions/v1/check-capacity"
AUTH="Authorization: Bearer ${SUPABASE_ANON_KEY}"

echo "── Test 1: weekday Tuesday 19:30 party 4 (should be available)"
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"date":"2026-05-12","time":"19:30","party_size":4}'
echo

echo "── Test 2: Saturday 11:00 party 2 (should refuse — weekend walk-in)"
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"date":"2026-05-09","time":"11:00","party_size":2}'
echo

echo "── Test 3: Saturday 19:00 party 2 (should be available)"
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"date":"2026-05-09","time":"19:00","party_size":2}'
echo

echo "── Test 4: bad input (missing party_size — should 400)"
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"date":"2026-05-12","time":"19:30"}'
echo

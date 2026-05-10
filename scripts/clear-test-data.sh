#!/usr/bin/env bash
# Wipes all calls + reservations rows so we can do a clean test call.
# Restaurant + knowledge_card + capacity_caps stay intact.

set -eo pipefail
cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  set -a; source .env.local; set +a
fi

: "${SUPABASE_URL:?SUPABASE_URL not set}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY not set}"

echo "Wiping reservations..."
curl -s -X DELETE "${SUPABASE_URL}/rest/v1/reservations?id=neq.00000000-0000-0000-0000-000000000000" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Prefer: return=minimal"

echo "Wiping calls..."
curl -s -X DELETE "${SUPABASE_URL}/rest/v1/calls?id=neq.__never_match__" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Prefer: return=minimal"

echo ""
echo "Done. Calls + reservations are empty. Make a fresh test call."

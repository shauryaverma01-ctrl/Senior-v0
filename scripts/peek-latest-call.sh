#!/usr/bin/env bash
# Pretty-prints the latest call + its reservation (if any) from Supabase.
# Run after a test call to see exactly what Zoronal sent and what we wrote.

set -eo pipefail
cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  set -a; source .env.local; set +a
fi

: "${SUPABASE_URL:?SUPABASE_URL not set}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY not set}"

echo "════════════════════════════════════════════════════════════"
echo " LATEST CALL"
echo "════════════════════════════════════════════════════════════"
LATEST=$(curl -s "${SUPABASE_URL}/rest/v1/calls?order=created_at.desc&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

echo "$LATEST" | python3 -m json.tool 2>/dev/null || echo "$LATEST"

CALL_ID=$(echo "$LATEST" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')" 2>/dev/null)

if [ -z "$CALL_ID" ]; then
  echo ""
  echo "(no calls in DB yet)"
  exit 0
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo " RESERVATION FOR THIS CALL (if any)"
echo "════════════════════════════════════════════════════════════"
curl -s "${SUPABASE_URL}/rest/v1/reservations?call_id=eq.${CALL_ID}" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" | python3 -m json.tool 2>/dev/null || echo "(none)"

echo ""
echo "════════════════════════════════════════════════════════════"
echo " RAW PAYLOAD (what Zoronal sent us)"
echo "════════════════════════════════════════════════════════════"
echo "$LATEST" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d and d[0].get('raw_payload'):
    print(json.dumps(d[0]['raw_payload'], indent=2))
else:
    print('(no raw_payload stored)')
" 2>/dev/null

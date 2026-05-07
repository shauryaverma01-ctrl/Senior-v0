#!/usr/bin/env bash
# Deploys all three Edge Functions to Supabase.
# --no-verify-jwt because Zoronal and Telegram won't be sending Supabase JWTs.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "Deploying check-capacity..."
supabase functions deploy check-capacity --no-verify-jwt

echo "Deploying zoronal-webhook..."
supabase functions deploy zoronal-webhook --no-verify-jwt

echo "Deploying telegram-callback..."
supabase functions deploy telegram-callback --no-verify-jwt

echo ""
echo "All three functions deployed."
echo ""
echo "Function URLs:"
echo "  check-capacity:    https://${SUPABASE_PROJECT_REF:-xslbbnbsyuklayewuhsc}.supabase.co/functions/v1/check-capacity"
echo "  zoronal-webhook:   https://${SUPABASE_PROJECT_REF:-xslbbnbsyuklayewuhsc}.supabase.co/functions/v1/zoronal-webhook"
echo "  telegram-callback: https://${SUPABASE_PROJECT_REF:-xslbbnbsyuklayewuhsc}.supabase.co/functions/v1/telegram-callback"

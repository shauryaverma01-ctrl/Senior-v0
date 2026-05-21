#!/usr/bin/env bash
# Deploys all Edge Functions to Supabase.
# --no-verify-jwt because Zoronal and Telegram won't be sending Supabase JWTs.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "Deploying check-capacity..."
supabase functions deploy check-capacity --no-verify-jwt

echo "Deploying zoronal-webhook..."
supabase functions deploy zoronal-webhook --no-verify-jwt

echo "Deploying telegram-callback..."
supabase functions deploy telegram-callback --no-verify-jwt

echo "Deploying lookup-guest..."
supabase functions deploy lookup-guest --no-verify-jwt

echo "Deploying menu-query..."
supabase functions deploy menu-query --no-verify-jwt

echo "Deploying ringg-webhook..."
supabase functions deploy ringg-webhook --no-verify-jwt

echo "Deploying lookup-caller..."
supabase functions deploy lookup-caller --no-verify-jwt

echo "Deploying transfer-call..."
supabase functions deploy transfer-call --no-verify-jwt

echo "Deploying transfer-xml..."
supabase functions deploy transfer-xml --no-verify-jwt

echo ""
echo "All functions deployed."
echo ""
echo "Function URLs:"
echo "  check-capacity:    https://${SUPABASE_PROJECT_REF:-xslbbnbsyuklayewuhsc}.supabase.co/functions/v1/check-capacity"
echo "  zoronal-webhook:   https://${SUPABASE_PROJECT_REF:-xslbbnbsyuklayewuhsc}.supabase.co/functions/v1/zoronal-webhook"
echo "  telegram-callback: https://${SUPABASE_PROJECT_REF:-xslbbnbsyuklayewuhsc}.supabase.co/functions/v1/telegram-callback"
echo "  lookup-guest:      https://${SUPABASE_PROJECT_REF:-xslbbnbsyuklayewuhsc}.supabase.co/functions/v1/lookup-guest"
echo "  menu-query:        https://${SUPABASE_PROJECT_REF:-xslbbnbsyuklayewuhsc}.supabase.co/functions/v1/menu-query"
echo "  ringg-webhook:     https://${SUPABASE_PROJECT_REF:-xslbbnbsyuklayewuhsc}.supabase.co/functions/v1/ringg-webhook"
echo "  lookup-caller:     https://${SUPABASE_PROJECT_REF:-xslbbnbsyuklayewuhsc}.supabase.co/functions/v1/lookup-caller"

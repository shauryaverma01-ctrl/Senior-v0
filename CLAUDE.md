# Senior — Voice AI Concierge for Indian Restaurants (v0)

## What this project is
Senior is an inbound voice AI that picks up restaurant phone calls, captures reservations,
answers FAQs, and routes complex requests to the manager via Telegram. v0 is internal test
at The Blue Door Cafe (TBDC), Khan Market, Delhi. 5-day build window.

## Architecture (do not change without explicit approval)
- Voice plane: Zoronal (vendor, configured via dashboard, not code)
- Data plane: Supabase Postgres (region ap-south-1, Mumbai)
- Backend: 3 Supabase Edge Functions in Deno/TypeScript
- Ops plane: Telegram bot (manager confirms via inline buttons)

## Edge Functions (the only code in this repo)
- `check-capacity/`  → during-call tool. Reads capacity_caps + reservations. Returns {available, alternate_slots}. <300ms target.
- `zoronal-webhook/` → end-of-call. Writes calls + reservations rows. Sends Telegram notification.
- `telegram-callback/` → manager taps Confirm/Decline. Updates reservation.status.
- `lookup-guest/`  → pre-call tool. Reads `guests` by phone_e164. Returns recall context block. <200ms target. (D1, shipped May 10)

## Hard rules — Claude Code, follow these without exception
1. Max 150 lines per Edge Function file. Split into _shared/ helpers if longer.
2. Never import Zoronal-specific types into business logic. Quarantine in `parse-payload.ts`.
3. All time math goes through `_shared/time.ts`. No `new Date()` outside that file.
4. All phone numbers go through `_shared/phone.ts` to E.164 (+91XXXXXXXXXX).
5. All DB writes are idempotent. Use `INSERT ... ON CONFLICT DO NOTHING` on calls.id.
6. No new npm/deno dependencies without asking the founder. Use stdlib first.
7. No localStorage, sessionStorage, or any browser APIs — these are server functions.
8. Validate all inputs with zod before touching the database.
9. Return 200 with descriptive body even on duplicate-retry. Never 500 on Zoronal retries.
10. console.log liberally — Supabase Logs is our only observability.

## Time zone — read this before writing any date code
Restaurant lives in Asia/Kolkata (IST = UTC+5:30). Postgres stores timestamptz.
Customer says "tonight 8 PM" → store as `booking_date=YYYY-MM-DD, booking_time=20:00`
where YYYY-MM-DD is the IST date. Never store naive UTC times in `booking_time`.

## Schema (do not modify without coordinating with the founder)
See `supabase/migrations/0001_init.sql` and `0002_guests.sql`. Tables:
- restaurants (id, name, zoronal_agent_id, plivo_did, telegram_chat_id, ...)
- knowledge_cards (json_content, version, ...)
- capacity_caps (day_of_week, slot_start, slot_end, max_bookings)
- calls (id=zoronal_call_id, intent, status, transcript_url, guest_id, ...)
- reservations (call_id, customer_name, customer_phone, party_size, booking_date, booking_time,
                status, telegram_message_id, guest_id, ...)
- guests (phone-keyed profile: name, visit_count, tier, allergens, occasions,
          last_visit_summary, ...) — 0002_guests.sql, shipped May 10. Unique on (restaurant_id, phone_e164).

## What this codebase explicitly does NOT do (yet)
- Send WhatsApp or SMS to customer (v1)
- Custom dashboard / UI (v1.5)
- Voice ordering (v3)
- Multi-tenant routing logic (v1.5)
- POS or EazyDiner integration (v1.5)

## Test commands
- `./scripts/test-check-capacity.sh` — curl with sample params
- `./scripts/test-zoronal-webhook.sh` — curl with fixture payload
- `./scripts/set-tg-webhook.sh` — register Telegram bot webhook
- `./scripts/deploy.sh` — supabase functions deploy --all

## Deployment
- Staging: project `senior-staging` (sql region ap-south-1)
- Production: project `senior-prod` (only after Day 5 gate passes)
- All secrets via `supabase secrets set`. NEVER commit .env.

## Where to find the prompt
`docs/maya-prompt.md` — version controlled. Currently v6 (returning-guest recall via
pre-call lookup-guest hook). Edit there, then run `./scripts/sync-prompt.sh`
to push to Zoronal via API. Do NOT edit the prompt directly in Zoronal dashboard once
this script exists; the file is the source of truth.

## Strategy & contract docs
- `SENIOR_V0_STRATEGY.html` — the full strategy doc (open in Chrome). Section 16 is the
  11-day plan to May 21. Section 21 is the user-flow contract (F1–F11) — every Edge
  Function implements one of these. Use it as the spec when writing new code.
- `SENIOR_V0_STRATEGY_BRAINSTORM.md` and `SENIOR_V0_STRATEGY_ADDENDUM_RESTAURANT_BRAIN.md` —
  the source markdown docs the HTML was built from.

## Build progress
- **D1 (May 10) — DONE.** `0002_guests.sql` migration applied to staging. `_shared/guests.ts`
  helper with `getGuestContext()` and `upsertGuestFromCall()`. `lookup-guest/` Edge Function
  deployed. End-to-end recall validated via curl (returns name + context block + tier when
  caller is in `guests`).
- **D2 (May 11) — IN PROGRESS.** maya-prompt.md bumped to v6 (returning-guest aware). Pending:
  Zoronal dashboard config to wire pre-call hook → lookup-guest, response.context → {{GUEST_CONTEXT}}
  template variable in prompt. Also pending: 0003_restaurant_brain.sql for menu graph (D3 prep)
  and a Google Sheets template for TBDC menu data entry.
- **D3–D11** — see `SENIOR_V0_STRATEGY.html` section 16.

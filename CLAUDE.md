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
11. Vendor-specific code lives only in the vendor's webhook directory (e.g. `zoronal-webhook/`) and `_shared/parse-payload.ts`. Every other module — `_shared/guests.ts`, `_shared/telegram.ts`, `_shared/time.ts`, `_shared/phone.ts`, `lookup-guest/`, `check-capacity/`, `menu-query/` — operates on `InternalCallEvent` from `_shared/types.ts` only. No vendor SDK imports, no vendor field names, no vendor status strings outside those two locations. See "Voice Vendor Abstraction" below.

## Voice Vendor Abstraction
Senior is designed to swap voice vendors. Zoronal is V0; our own voice platform takes over in
V1. The contract between any voice vendor and Senior's business logic is the
`InternalCallEvent` type in `_shared/types.ts`.

Vendor-coupled code lives in exactly two places:
- The vendor's webhook directory: `zoronal-webhook/` (and future `<vendor>-webhook/`).
- The vendor's payload parser: `_shared/parse-payload.ts` today; will split into
  `parse-zoronal-payload.ts` + `parse-<vendor>-payload.ts` when the second vendor lands.

Everything else operates on `InternalCallEvent` only. When the second vendor lands, the
post-parse business logic (calls upsert + guests bump + reservations insert + Telegram
notification) should be extracted into `_shared/handle-call-event.ts` so both webhooks
share it. See the TODO at the top of `zoronal-webhook/index.ts` for the exact seam.

## Time zone — read this before writing any date code
Restaurant lives in Asia/Kolkata (IST = UTC+5:30). Postgres stores timestamptz.
Customer says "tonight 8 PM" → store as `booking_date=YYYY-MM-DD, booking_time=20:00`
where YYYY-MM-DD is the IST date. Never store naive UTC times in `booking_time`.

## Schema (do not modify without coordinating with the founder)
See `supabase/migrations/0001_init.sql`, `0002_guests.sql`, `0003_bump_guest.sql` (atomic guest UPSERT function), and `0004_voice_vendor_neutral.sql` (vendor-neutral column rename). Tables:
- restaurants (id, name, voice_agent_id, voice_did, plivo_did, telegram_chat_id, ...)
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
- **D2 (May 11) — IN PROGRESS.** maya-prompt.md bumped to v6 (returning-guest aware).
  zoronal-webhook now calls `upsertGuestFromCall` and threads `guest_id` onto calls and
  reservations (closes F1 post-call write-back). `0003_bump_guest.sql` makes visit_count
  increments atomic at the DB level. Voice Vendor Abstraction principle codified as rule
  11 + section + `0004_voice_vendor_neutral.sql` rename of `zoronal_agent_id`/`zoronal_did`
  to `voice_agent_id`/`voice_did`. End-to-end verified against staging.
  Pending: Zoronal dashboard config to wire pre-call hook → lookup-guest, response.context
  → {{GUEST_CONTEXT}} template variable in prompt. Follow-up commit needed for replay
  idempotency (visit_count double-bumps when Zoronal retries the same call_id).
- **D3 (May 12+) — NEXT.** `0005_restaurant_brain.sql` (menu graph for F3) and `menu-query/`
  Edge Function. Migration numbering shifted up by two (0003/0004 taken by D2 closure).
- **D4–D11** — see `SENIOR_V0_STRATEGY.html` section 16.

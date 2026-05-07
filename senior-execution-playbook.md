# SENIOR — 5-Day Wartime Execution Playbook

**Author context:** generated for solo founder, non-technical, AI-assisted execution via Claude Code in VS Code/Cursor. Pin this tab open. Single source of truth.

**Today:** Thu May 7, 2026 · **v0 internal-test gate:** Tue May 12 · **First real-customer calls:** ~Mon May 11 · **Investor deck cutoff:** Thu May 21

**Hard constraints baked into the plan:**
1. Solo founder. No second engineer to parallelize.
2. 14-day runway to investor pitch — v0 must work AND produce real-call data for the deck.
3. Zoronal already has a working agent (`a1d34519-0ffe-48af-b17c-a367b0c45f6b`) with 5 successful test calls + visible transcripts. We refine, not rebuild.
4. Plivo DID arrives ~Day 1–2; Zoronal-managed temp number bridges the gap.
5. Wallet currently $6.733. At ~₹3–4/min, that's ~50–60 minutes of test calling. Top up to $20 before Day 4.

---

## 0. The Three Decisions That Determine Whether v0 Ships

If any of these three go wrong, v0 slips past Day 5. Everything else is recoverable.

**Decision 1 — Welcome Message location.** Zoronal exposes a separate "Welcome Message" field BEFORE the prompt fires. Put the DPDP recording notice there as a fixed string. It cannot drift, cannot be skipped, and cannot be hallucinated. Prompt handles everything after. PRD §9.3 said leave it blank — overriding that based on the dashboard screenshot.

**Decision 2 — Webhook payload shape.** Zoronal's "Outgoing Payload (JSON)" is editable. Don't ingest Zoronal's default schema and parse it — *define your own schema* in the Outgoing Payload editor and have Zoronal fill it in. Your Edge Function then receives a clean, predictable shape. This single decision eliminates ~70% of webhook integration risk.

**Decision 3 — Don't write a custom dashboard.** Supabase Studio is your dashboard for v0 AND v1 demo. The owner views reservations there. The investor sees Studio + a recorded call playback in the deck. Time spent on a custom UI is time stolen from getting Maya right.

---

## 1. System Breakdown — Components, Difficulty, Risk

| # | Component | Layer | Code? | Difficulty | AI-Codeable? | Risk | Notes |
|---|---|---|---|---|---|---|---|
| 1 | Supabase project + schema | Data | SQL | Trivial | High | Low | One-shot from §9.6. Do in Studio UI, not migrations folder. |
| 2 | Seed data (restaurant, KC, caps) | Data | SQL | Trivial | High | Low | Insert once, version in repo. |
| 3 | `check_capacity` Edge Function | Backend | TS/Deno | Easy | High | Med | Latency-sensitive. <300ms target. |
| 4 | `zoronal-webhook` Edge Function | Backend | TS/Deno | Medium | High | High | Idempotency, payload mapping, time zones. |
| 5 | `telegram-callback` Edge Function | Backend | TS/Deno | Easy | High | Med | **Missing from PRD.** Handles Confirm/Decline button taps. |
| 6 | Telegram bot setup | Ops | Config | Trivial | n/a | Low | @BotFather, 5 min. Founder action. |
| 7 | Zoronal agent config | Voice | UI | Medium | n/a | Med | Founder action. Welcome msg + prompt + tool + webhook. |
| 8 | Zoronal `check_capacity` tool registration | Voice | UI | Easy | n/a | Med | Founder action. Paste schema, set URL. |
| 9 | Zoronal `Outgoing Payload` shape | Voice | UI | Medium | n/a | High | **Critical.** Define the shape *we* want. |
| 10 | Maya system prompt | Voice | Markdown | Hard | High | Critical | Hallucinations, refusal rule, weekend rule. |
| 11 | Knowledge card JSON | Content | Data | Easy | High | Med | Single source of truth. Embed in prompt. |
| 12 | Plivo DID assignment | Telephony | UI | Easy | n/a | Med | KYC-dependent. Use Zoronal temp until ready. |
| 13 | Trap-question eval set | QA | CSV | Easy | High | Med | 20 questions. Run nightly Day 4–5. |
| 14 | Routing test script | QA | Bash | Easy | High | Low | Prove DID → correct restaurant. |
| 15 | Manual happy-path test scripts | QA | Markdown | Easy | High | Med | 20 scenarios for Day 4 session. |

**Counts:** 5 code components (~600–900 LoC total), 5 config tasks, 4 QA artifacts, 1 telephony dependency.

**Total executable surface is small.** The risk is concentrated in components #4, #9, and #10. Spend 60% of your engineering time there.

---

## 2. Build Order & Dependency Graph

```
                         ┌─────────────────────────┐
                         │  Day 0 (tonight) prep   │
                         └────────────┬────────────┘
                                      ▼
          ┌──────────────────────────────────────────────┐
          │  Supabase project (ap-south-1) + schema      │ ← #1, #2
          └────┬───────────────────────────┬─────────────┘
               ▼                           ▼
   ┌───────────────────────┐   ┌─────────────────────────┐
   │ check_capacity Fn     │   │  Telegram bot creation  │ ← #3, #6
   │ deployed + curl-tested│   │  + chat_id captured     │
   └───────────┬───────────┘   └────────────┬────────────┘
               │                            │
               ▼                            ▼
   ┌─────────────────────────────────────────────────────┐
   │  zoronal-webhook Fn (echoes payload to logs first)  │ ← #4 stub
   └───────────────────────┬─────────────────────────────┘
                           ▼
   ┌─────────────────────────────────────────────────────┐
   │  Real test call → capture actual webhook payload     │ ← critical gate
   └───────────────────────┬─────────────────────────────┘
                           ▼
   ┌─────────────────────────────────────────────────────┐
   │  Customize Outgoing Payload in Zoronal (#9)         │
   │  → matches our internal schema                       │
   └───────────────────────┬─────────────────────────────┘
                           ▼
   ┌─────────────────────────────────────────────────────┐
   │  zoronal-webhook full logic: write DB + fire TG     │ ← #4 full
   └───────────────────────┬─────────────────────────────┘
                           ▼
   ┌─────────────────────────────────────────────────────┐
   │  telegram-callback Fn (Confirm/Decline status)      │ ← #5
   └───────────────────────┬─────────────────────────────┘
                           ▼
   ┌─────────────────────────────────────────────────────┐
   │  End-to-end test: call → DB write → TG → confirm    │ ← gate
   └───────────────────────┬─────────────────────────────┘
                           ▼
   ┌─────────────────────────────────────────────────────┐
   │  Maya prompt iteration (v1, v2, v3) + KC tightening │ ← #10
   └───────────────────────┬─────────────────────────────┘
                           ▼
   ┌─────────────────────────────────────────────────────┐
   │  20-call session w/ owner + manager + trap eval     │ ← Day 4 gate
   └───────────────────────┬─────────────────────────────┘
                           ▼
                    ┌──────────────┐
                    │  v0 SHIPPED  │
                    └──────────────┘
```

**Mock vs real strategy:**
- Day 1 Edge Functions are tested with curl + fixture payloads. No real calls yet.
- Day 2 fires the *first real test call* with the webhook stub deployed — the only goal is capturing the actual payload shape.
- Days 3–5 use real calls exclusively.

**Parallelization (limited, you're solo):**
- While Supabase is provisioning (5 min), create Telegram bot via @BotFather.
- While `check_capacity` is being written, send the Plivo KYC application.
- While Day 4 test calls are running, draft the investor deck slide for "Live Maya Demo".

---

## 3. Claude Code Execution Strategy

### 3.1 The CLAUDE.md template — drop into repo root before writing any code

Save as `/Users/shauryaverma/Desktop/Senior/Senior v0/CLAUDE.md` (or wherever you clone the GitHub repo). This file is what Claude Code reads first every session.

```markdown
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
See `supabase/migrations/0001_init.sql`. Tables:
- restaurants (id, name, zoronal_agent_id, plivo_did, telegram_chat_id, ...)
- knowledge_cards (json_content, version, ...)
- capacity_caps (day_of_week, slot_start, slot_end, max_bookings)
- calls (id=zoronal_call_id, intent, status, transcript_url, ...)
- reservations (call_id, customer_name, customer_phone, party_size, booking_date, booking_time,
                status, telegram_message_id, ...)

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
`docs/maya-prompt.md` — version controlled. Edit there, then run `./scripts/sync-prompt.sh`
to push to Zoronal via API. Do NOT edit the prompt directly in Zoronal dashboard once
this script exists; the file is the source of truth.
```

### 3.2 Per-feature prompting pattern

Use this exact structure when asking Claude Code to implement anything. Copy-paste, fill in the blanks:

```
TASK: [one sentence — what to build]
CONTEXT: @CLAUDE.md @supabase/migrations/0001_init.sql @docs/maya-prompt.md
WRITE TO: supabase/functions/[name]/index.ts
CONSTRAINTS:
- Max 150 lines.
- Use only @_shared helpers (do not duplicate logic).
- Validate input with zod.
- Idempotent: same input twice = same DB state.
- Return JSON with shape: { ok: boolean, data?: T, error?: string }
- console.log every external call (Supabase, Telegram).
ACCEPTANCE TEST:
- ./scripts/test-[name].sh exits 0
- Logs show [specific log lines]
- DB shows [specific row state]
DO NOT:
- Add new dependencies.
- Touch other Edge Functions.
- Modify the schema.
- Inline Zoronal types — quarantine in parse-payload.ts.
```

### 3.3 Where Claude Code reliably fails on this stack — pre-emptive defenses

| Failure mode | Symptom | Defense |
|---|---|---|
| Imports Node.js syntax in Deno | `process is not defined` | Always say "Deno Edge Function" in prompt; reject if Claude writes `process.env`. |
| Hallucinated Telegram inline_keyboard JSON shape | TG returns 400 | Provide a known-good fixture in `_shared/telegram.ts` and tell Claude to use it. |
| Silent timezone bug | Wrong-day reservations | All date logic must call `_shared/time.ts` helpers. Audit every PR. |
| Off-by-one on phone number normalization | SMS later won't deliver | One regex in `_shared/phone.ts`. Unit test with 4 input variants. |
| Adds OpenAI/LangChain/Express deps "for convenience" | Build breaks | "No new deps without asking" rule in CLAUDE.md. Reject in review. |
| Refactors working code "for clarity" mid-task | Silent regressions | Commit before every Claude session. Diff after. |
| Long files (>200 lines) drift from spec | Cascading bugs | 150-line ceiling, hard. Split via _shared/. |

### 3.4 Context discipline

- One Edge Function per Claude Code session. Don't let it touch two functions in one conversation.
- Use `/clear` between major tasks. Stale context corrupts.
- Reference files with `@docs/prd.md` not by pasting content.
- After each working feature: `git add -A && git commit -m "feat: <thing>"`. Always commit before refactoring.
- When iterating on prompts: edit `docs/maya-prompt.md`, push via API. Never edit Zoronal dashboard directly.

### 3.5 What only the founder can do (don't try to delegate to Claude)

- Click "Create Agent" in Zoronal dashboard
- Click "Create Tool Call" in Zoronal dashboard
- Get manager's Telegram chat_id (you message bot → /start → getUpdates)
- Plivo KYC submission
- Real test phone calls (you literally need a phone)
- Listening to call recordings to judge prompt quality
- Owner + manager joint test session on Day 4

---

## 4. The 5-Day Wartime Execution Plan

### Day 0 — Tonight (3 hours, before sleep)

**Objective:** Bootstrap done. Day 1 starts with code, not setup.

| Hour | Task | Done When |
|---|---|---|
| 0:00–0:20 | Sign up Supabase, create project `senior-staging`, **region: ap-south-1 (Mumbai)**. Capture project URL + anon key + service_role key into a `.env.local` file (not committed). | Project shows green status. |
| 0:20–0:40 | Open SQL editor in Supabase Studio. Paste Appendix A schema. Run. Paste Appendix C seed. Run. | Tables exist; restaurants table has Blue Door row. |
| 0:40–1:00 | Open Telegram. Message @BotFather → `/newbot` → name = `Senior — Blue Door`, username `senior_bluedoor_bot` (or similar). Save HTTP API token. Message your new bot anything → call `https://api.telegram.org/bot<TOKEN>/getUpdates` → capture `chat.id` from response. Update `restaurants.telegram_chat_id` for Blue Door row in Studio. | You can post a message to the bot and see it in getUpdates. chat_id stored. |
| 1:00–1:20 | Clone empty `Senior v0` repo. Create folder structure (Section 5). Drop in CLAUDE.md (Section 3.1). Commit. | `git log` shows initial commit. |
| 1:20–1:40 | Install Supabase CLI (`brew install supabase/tap/supabase` if Mac). Run `supabase login`. Run `supabase link --project-ref <ref>`. | `supabase functions list` works. |
| 1:40–2:10 | Create stub Edge Functions: `supabase functions new check-capacity` and `supabase functions new zoronal-webhook` and `supabase functions new telegram-callback`. Each one returns `Response(JSON.stringify({ok:true, stub:"<name>"}))`. Deploy with `supabase functions deploy --no-verify-jwt`. | curl to each URL returns 200. |
| 2:10–2:30 | Plivo KYC application started (so it ferments overnight). Top up Zoronal wallet to $20 (needed by Day 4). | Confirmation emails received. |
| 2:30–3:00 | Read Appendix B (Maya prompt v1) end-to-end. Mark anything that feels off about TBDC. Sleep. | Prompt understood. |

**Day 0 commit message:** `chore: bootstrap project, schema deployed, edge functions stubbed`

**If Day 0 stretches to 4 hours, that's fine.** If it stretches to 6, you have a problem — call me before Day 1 starts.

---

### Day 1 — Backend foundation, Telegram round-trip

**Objective:** All three Edge Functions work end-to-end against curl + fixtures. No real calls yet.

| Block | Task | Time | Owner |
|---|---|---|---|
| AM-1 | Implement `check_capacity` Edge Function. Read `capacity_caps` + count `reservations` for that slot. Return `{available: bool, alternate_slots: [...]}`. Use Appendix G template. | 1.5h | Claude Code + Founder |
| AM-2 | Write `scripts/test-check-capacity.sh`. Test 4 cases: weekday available, weekend before 1PM (refuse), capacity full, malformed input. | 0.5h | Claude Code |
| AM-3 | Implement `_shared/telegram.ts` helpers: `sendMessageWithButtons()`, `answerCallback()`, `editMessage()`. Use raw fetch, no library. | 1h | Claude Code |
| LUNCH | Don't skip. | 0.5h | Founder |
| PM-1 | Implement `zoronal-webhook` v0 — JUST log the incoming payload + return 200. No DB writes yet. Deploy. | 0.5h | Claude Code |
| PM-2 | Implement `telegram-callback` skeleton — receive update, parse callback_query, log it, return 200. Deploy. | 1h | Claude Code |
| PM-3 | Set Telegram webhook: `curl https://api.telegram.org/bot<TOKEN>/setWebhook?url=<edge_fn_url>`. Verify with `getWebhookInfo`. | 0.25h | Founder |
| PM-4 | Test Telegram round-trip: write a script `scripts/send-test-tg.sh` that posts a fake reservation message with Confirm/Decline buttons. Tap a button on your phone. Verify `telegram-callback` logs the tap in Supabase Function Logs. | 1h | Founder + Claude Code |

**Day 1 gate (must pass before sleep):**
- ✅ curl to `check_capacity` with sample params returns plausible JSON
- ✅ Test Telegram message arrives on your phone with two buttons
- ✅ Tapping a button writes a log line to Supabase Logs
- ✅ All three Edge Functions deployed to staging

**Likely blockers:**
- Telegram chat_id wrong type (string vs number) — log it, fix in DB
- Edge Function CORS / auth mode — deploy with `--no-verify-jwt` for v0
- Supabase RLS blocking writes — disable RLS on all tables for v0 (Studio → Auth → Policies)

**Don't waste time on:** types beyond zod schemas, error wrapping classes, retry libraries, rate limiting.

**Day 1 commit:** `feat: edge functions deployed; tg round-trip working`

---

### Day 2 — First real call, payload capture, Zoronal wiring

**Objective:** A real test call from your phone reaches Maya, fires the webhook, the webhook receives a real payload, and we shape both sides to match.

| Block | Task | Time | Owner |
|---|---|---|---|
| AM-1 | In Zoronal: open existing "Reservation mystery shopper" agent → **duplicate** it → rename `Maya — Blue Door v0` (don't edit the original; it's your safety net). | 0.25h | Founder |
| AM-2 | Configure new agent (Step 1): voice Tarini, speed 0, Primary=English, Secondary=Hindi. | 0.25h | Founder |
| AM-3 | Configure agent (Step 2): paste Appendix B Maya prompt. **Welcome Message**: paste the DPDP opening line (Appendix B opening). Leave tool_call empty for now (will add in PM-1). | 0.5h | Founder |
| AM-4 | Configure agent (Step 3): post-call webhook → URL = `https://<project>.supabase.co/functions/v1/zoronal-webhook` → Method POST → Add header `Authorization: Bearer <ZORONAL_WEBHOOK_SECRET>` (any random string; store in Supabase secrets). **Outgoing Payload**: edit it to match Appendix F template. | 0.75h | Founder |
| AM-5 | Configure "Collect Information": add 7 fields — customer_name, customer_phone, party_size, booking_date, booking_time, special_requests, intent. Each as text. | 0.25h | Founder |
| AM-6 | **First real test call.** From your personal phone, call the Zoronal-managed temp number. Speak the happy-path reservation script ("I'd like to book Saturday 7 PM for 4 under Raman, ending 5900"). Hang up. | 0.25h | Founder |
| AM-7 | Open Supabase Function Logs → find the webhook log → copy the payload to `tests/fixtures/webhook-real-1.json`. **This is the gold-standard fixture from now on.** | 0.25h | Founder |
| LUNCH | | 0.5h | |
| PM-1 | In Zoronal "Tool Call" section → Add Tool Call → paste Appendix B's `check_capacity` JSON → Message field: "One moment while I check availability." → Make API Call → URL = `https://<project>.supabase.co/functions/v1/check-capacity`. Save. Associate with Maya agent. | 0.5h | Founder |
| PM-2 | Implement `zoronal-webhook` full version: parse payload (using your fixture), normalize phone, write `calls` row, write `reservations` row if `intent=reservation`, fire Telegram with inline buttons. Use Appendix G template. | 2.5h | Claude Code + Founder |
| PM-3 | Implement `telegram-callback` full version: parse `callback_query.data` (format: `confirm:<reservation_id>` / `decline:<reservation_id>` / `callback:<reservation_id>`), update `reservations.status`, edit Telegram message to show confirmation. | 1h | Claude Code |
| PM-4 | **End-to-end test #1**: real call → check_capacity fires during call → webhook fires after → DB rows created → Telegram message arrives → tap Confirm → DB status flips → message edits to "✅ Confirmed". | 0.5h | Founder |

**Day 2 gate:**
- ✅ Real call captured in `webhook-real-1.json`
- ✅ check_capacity called during a real call (visible in Logs with timestamp during call)
- ✅ Reservation row appears in Studio within 10 seconds of hangup
- ✅ Telegram message with buttons arrives
- ✅ Tapping Confirm updates `reservations.status` to `confirmed` and edits the TG message

**Likely blockers (rank-ordered by probability):**
1. Field names in real payload differ from what you set in Outgoing Payload editor → adjust mapping in `parse-payload.ts`
2. `check_capacity` returns 500 mid-call → Maya stalls or hallucinates availability → check Logs, add timeout handling
3. Telegram message HTML escaping → use plain text for v0
4. `booking_time` arrives as "8 PM" instead of "20:00" → add small parser; have Maya enforce 24-hour format in prompt
5. Bearer auth header rejected → drop auth for v0, add IP allowlist later

**Don't waste time on:** retries, exponential backoff, error tracking, structured logging libraries.

**Day 2 commit:** `feat: end-to-end real call → tg confirm working`

---

### Day 3 — Robustness, edge cases, latency

**Objective:** The pipeline is resilient. The prompt produces correct slot-fill 90%+ of the time.

| Block | Task | Time | Owner |
|---|---|---|---|
| AM-1 | Run 5 calls covering: weekday reservation, weekend Saturday 11AM (refuse), weekend Saturday 8PM (accept), FAQ-only ("are you open Sunday morning?"), complaint escalation. Listen to recordings. Note prompt failures. | 1.5h | Founder |
| AM-2 | Iterate Maya prompt v2 in `docs/maya-prompt.md`. Update Zoronal agent (paste). | 1h | Founder + Claude Code |
| AM-3 | Latency check: open 3 recordings, count time-to-first-word and turn gaps. If p50 > 2.5s, flag specific turn (most likely tool call). | 0.5h | Founder |
| LUNCH | | 0.5h | |
| PM-1 | Add idempotency: ensure `INSERT INTO calls (id) VALUES (...) ON CONFLICT DO NOTHING`. Test by replaying a fixture twice → only 1 reservation row. | 0.5h | Claude Code |
| PM-2 | Add `auto_confirm_at` SLA logic to `reservations` row at insert time (NOT a cron — just compute the deadline). v0 doesn't auto-confirm; v1 does. But populate the field. | 0.5h | Claude Code |
| PM-3 | Add Plivo DID to Zoronal IF KYC is approved. Run routing test: call Plivo DID, confirm Maya answers (correct restaurant name in greeting). | 0.5h | Founder |
| PM-4 | Run another 5 calls including 3 Hinglish ("haan, 8 baje 4 log"). | 1h | Founder |
| PM-5 | Build 20-question trap eval CSV (Appendix D). Pick 5 to test now manually. Note which Maya hallucinates on. | 1h | Founder |

**Day 3 gate:**
- ✅ 10+ calls completed across reservation/FAQ/escalation/Hinglish
- ✅ Idempotency proven
- ✅ p50 latency under 2.5s on at least 3 calls
- ✅ Zero duplicate reservations across 10 calls
- ✅ At most 1 hallucination across 5 trap questions (target = 0)

**Day 3 commit:** `feat: robustness + prompt v2`

---

### Day 4 — Joint test session, prompt v3, dry run for owner gate

**Objective:** Owner + Manager + Founder run the test together. Surface every UX flaw.

**Pre-session prep (AM, alone):**
- Top up Zoronal wallet to ensure 20 calls don't drain you mid-session
- Print/share screen Appendix D trap questions
- Open Supabase Studio to `reservations` table — full screen
- Open Telegram on owner's phone (or have manager beside you)
- Have your phone ready as the "customer"

**Joint session (PM, 2.5 hours, owner + manager + you):**

| Block | Test | Pass criteria |
|---|---|---|
| 1 | Reservation happy path × 3 (3 different times/sizes) | All 3 rows correct in Supabase, all 3 TG messages arrive, manager taps Confirm on all 3 |
| 2 | Weekend Saturday 11 AM call (should refuse) | Maya explains walk-in rule; no reservation row created |
| 3 | Weekend Saturday 8 PM call (should accept) | Reservation row created |
| 4 | Capacity full call (book until cap, then try one more) | 2nd attempt offered alternate_slots |
| 5 | 5 FAQs from knowledge card (vegan, hours, alcohol, parking, kids) | All correct |
| 6 | 5 trap questions (chef name, GST number, exact dish price, halal status, owner name) | Maya refuses with "I don't have that detail..." |
| 7 | Complaint escalation | Telegram fires priority callback, no reservation row |
| 8 | Group of 17 | Escalation, no reservation row |
| 9 | Customer asks Maya "are you a robot?" | Maya: "I'm Maya, Blue Door's AI assistant" |
| 10 | Manager taps Decline on a confirmed booking | Status flips to declined, message edits |
| 11 | Hinglish: "haan, table chahiye 4 log ke liye, kal raat 8 baje" | Reservation captured correctly |
| 12 | Mid-call silence (5+ sec, no reply from caller) | Maya gracefully exits, incomplete row created |

**Post-session (evening):**
- Score: 12/12 = ship. 10–11/12 = patch and re-test 2 specific tests Day 5 morning. <10 = serious problem, raise it.
- Write `docs/test-results-day4.md` with timestamps, audio links, pass/fail per test.
- Owner says "I'd actually use this" → you have the v0 gate signal.

**Day 4 commit:** `test: joint session 12/12 (or X/12) + prompt v3`

---

### Day 5 — Polish, gate, ship

**Objective:** Owner says go. v0 is shipped. Investor demo material exists.

| Block | Task | Time |
|---|---|---|
| AM-1 | Fix the 1–2 issues from Day 4. Re-test those scenarios only. | 2h |
| AM-2 | Run full trap eval (all 20 questions) and document results. Target: 0 hallucinations. | 1h |
| AM-3 | Build the demo asset: pick best 2-call recordings, create a `docs/demo-assets.md` with timestamps + transcript + Supabase Studio screenshots. | 1h |
| LUNCH | | 0.5h |
| PM-1 | **v0 gate review meeting** with owner + manager. 30 min. Three questions: (a) Do you trust the captured data? (b) Will manager use Telegram in service hours? (c) Can we go to v1 next week? | 0.5h |
| PM-2 | If gate passes → tag `v0.0.0` in git, create `senior-prod` Supabase project, deploy functions to prod, swap Plivo DID to prod webhook. | 2h |
| PM-3 | If gate fails → write `docs/v0-blockers.md`, schedule Day 6 fix sprint, do not ship. | n/a |
| EVE | Pre-write the v1 sprint plan: WhatsApp Business application starts Day 6, MSG91 setup, daily digest cron, knowledge-card-update flow. | 1h |

**Day 5 commit:** `release: v0.0.0 — internal gate passed`

**By 9 PM Day 5, you should have:** working production deployment, 30+ recorded test calls, owner verbal commit to v1 production at TBDC.

---

## 5. Repo Structure (final)

```
Senior v0/
├── CLAUDE.md
├── README.md
├── .env.example
├── .gitignore
│
├── docs/
│   ├── prd.md                          ← convert HTML PRD to MD
│   ├── maya-prompt.md                  ← Appendix B (versioned)
│   ├── knowledge-card.json             ← Appendix C
│   ├── webhook-payload-spec.json       ← Appendix F (the shape we asked Zoronal to send)
│   ├── runbook.md                      ← how to debug, rotate keys, redeploy
│   ├── decisions.md                    ← architectural decisions log
│   ├── test-results-day4.md            ← created Day 4
│   └── demo-assets.md                  ← created Day 5
│
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   └── 0001_init.sql               ← Appendix A
│   ├── seed.sql                        ← Appendix C as INSERTs
│   └── functions/
│       ├── _shared/
│       │   ├── supabase.ts             ← createClient() helper
│       │   ├── telegram.ts             ← sendMessage, answerCallback, editMessage
│       │   ├── time.ts                 ← IST helpers
│       │   ├── phone.ts                ← normalizePhone() to E.164
│       │   ├── types.ts                ← internal domain types
│       │   └── parse-payload.ts        ← Zoronal-shape quarantine
│       ├── check-capacity/
│       │   └── index.ts
│       ├── zoronal-webhook/
│       │   └── index.ts
│       └── telegram-callback/
│           └── index.ts
│
├── scripts/
│   ├── deploy.sh
│   ├── seed.sh
│   ├── set-tg-webhook.sh
│   ├── sync-prompt.sh                  ← pushes maya-prompt.md to Zoronal
│   ├── test-check-capacity.sh
│   ├── test-zoronal-webhook.sh
│   ├── send-test-tg.sh
│   └── routing-test.sh                 ← call DID, verify greeting matches restaurant
│
├── tests/
│   ├── fixtures/
│   │   ├── webhook-real-1.json         ← captured Day 2 (THE gold fixture)
│   │   ├── webhook-faq.json
│   │   └── webhook-escalation.json
│   ├── trap-questions.csv              ← Appendix D
│   └── happy-paths.md                  ← 20 test scenarios
│
└── eval/
    └── (deferred to v1 — manual audit for v0)
```

---

## 6. Deployment & Stability

### 6.1 Two-environment setup
- `senior-staging` — Supabase project for Days 0–4. Connected to Zoronal `Maya — Blue Door v0` agent. Plivo DID points here.
- `senior-prod` — Supabase project created Day 5 PM after gate. Plivo DID swaps over for v1.

### 6.2 Secrets
All in `supabase secrets set --env staging` and `--env prod`:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_MANAGER_CHAT_ID` (just for testing — production reads from `restaurants` table)
- `ZORONAL_WEBHOOK_SECRET` (Bearer token Zoronal sends; verify in webhook fn)
- `SUPABASE_SERVICE_ROLE_KEY` (only used inside functions; never in client)

Never commit `.env`. Use `.env.example` with placeholders only.

### 6.3 Logging strategy
- One `console.log({ event: 'webhook_received', call_id, intent, latency_ms })` per major step in each function.
- Use Supabase Function Logs (built-in). Filter by function name, by call_id.
- Add a `console.error()` with full stack on every catch. Never swallow.
- No Sentry, no Datadog, no Logflare for v0. Defer.

### 6.4 Rollback strategy
- Every "feat:" commit is deployable. If today's deploy breaks, `git revert HEAD && supabase functions deploy --all`. Takes 90 seconds.
- Maya prompt rollback: keep `docs/maya-prompt-v1.md`, `v2.md`, `v3.md` files. To roll back, copy old version into `maya-prompt.md` and run `sync-prompt.sh`. The Zoronal API has versioning eventually — for v0, manual.
- Plivo DID rollback: swap back to Zoronal temp number from Zoronal dashboard. <2 min.

### 6.5 Crash recovery
- Zoronal down: customer hears Plivo fallback "Technical issue, please call back." (configure in Plivo dashboard Day 3.)
- Supabase down: Zoronal logs the call but our webhook 5xx's. Zoronal retries; on next-day repair we replay fixtures from Zoronal's call history. **Do not lose call recordings — those exist in Zoronal for 80 days.**
- Telegram down: manager misses notifications. v1 adds WhatsApp + email backup. v0 acceptable risk.

### 6.6 Manual override
- Owner can edit `reservations.status` directly in Supabase Studio. Document this in `runbook.md`.
- Founder can disable the entire Zoronal agent via dashboard toggle. Calls go to Plivo fallback.
- Founder can edit Maya prompt in Zoronal dashboard for emergency hotfix; sync back to repo within 24h.

---

## 7. Reality Check — Brutal Edition

### 7.1 Most likely failure modes (ranked)

1. **Zoronal STT fails on Indian names with thick accents.** The transcript I saw worked for "Ananya" — that's a clean reading-voice case. Real callers will say "Yashasvini" and "Pratyush" and Maya will write "Vashvini" and "Patrish." Mitigation: spell-back is mandatory in the prompt; 2 retries before escalation; if same field misread twice → escalate.
2. **The Outgoing Payload editor in Zoronal has limits you don't know about yet.** You may not be able to fully customize it. Fallback: ingest the default and map in `parse-payload.ts`. Day 2 will reveal which.
3. **`check_capacity` adds 800ms+ to a turn, breaking the latency target.** Caused by Edge Function cold-start in non-Mumbai region or by an N+1 query. Mitigation: ap-south-1 + single SELECT with all needed counts.
4. **Telegram callback `data` field is limited to 64 bytes.** A UUID is 36 chars + a "confirm:" prefix = 44, fine. But if you encode JSON, you'll blow the limit. Always use `<verb>:<uuid>` format.
5. **Manager will not check Telegram during peak service.** This is the OPS risk that doesn't show up in code. v1 adds WhatsApp + auto-confirm SLA. v0: accept some bookings will sit pending past 30 min during testing.
6. **Day 4 joint session reveals "the manager is not actually willing to use this."** Lower-than-zero probability you've already validated, but if it surfaces, v0 gate fails and the entire premise needs revisiting. Better to find out Day 4 than Day 30.
7. **You burn through Zoronal credits faster than expected.** Top up to $30 by Day 3. Per-minute cost is ~₹3–4 not ₹4/call as PRD assumed.
8. **Plivo KYC takes longer than 24h.** Use Zoronal temp number for entire 5 days if needed. Don't gate v0 on Plivo. Production swap can happen Day 6+.

### 7.2 Where engineering time will disappear

- Telegram inline_keyboard JSON debugging (1–3 hours)
- The first webhook payload mismatch (2–4 hours)
- Time zone bugs (2–6 hours over the week — minimize via discipline)
- Maya prompt iteration to eliminate hallucinations (5–10 hours total — biggest single sink)
- Manager "what does this button mean?" UX questions (1–2 hours per round)

### 7.3 Where to accept tech debt

- No tests beyond curl scripts and the trap eval CSV.
- No CI/CD beyond `./scripts/deploy.sh`.
- No structured logging.
- No retries in webhook handler (Zoronal retries for us).
- Single Maya prompt embedded with full knowledge card. Don't extract knowledge card to separate prompt-time injection until v1.5 multi-tenant.
- Hardcoded restaurant ID lookup — no multi-tenant routing logic.
- No staff RBAC — owner has Studio access, that's it.

### 7.4 Where polish is unnecessary

- Telegram message formatting beyond bold + buttons.
- Edge Function response shape consistency.
- README.md.
- Supabase Studio customization.
- Code comments beyond function-level.

### 7.5 What absolutely cannot fail for the May 21 demo

- One real customer reservation captured end-to-end with TG confirm
- Two clean call recordings playable in the deck
- Supabase Studio screenshot showing the reservations table populated
- The 15% direct-discount mention in at least one recorded call (it's the GTM thesis)
- A single calculated number: `confirmed_reservations × 80% × 80% × ₹2000` for actual Blue Door volume

If those five exist on May 20 evening, you have a deck. Everything else is bonus.

### 7.6 Investor deck — what to build between v0 ship (May 12) and pitch (May 21)

- Days 12–14: Production at TBDC, real customer calls
- Days 15–17: Capture 30+ real reservations, watch capture rate
- Days 18–19: Build the 8-slide deck. Focus: one slide of the Maya call audio + transcript, one slide of the Supabase Studio screenshot, one slide of the recovered-revenue math, one slide of the Voice OS vision.
- Day 20: Internal review, polish.
- Day 21: Pitch.

**Don't try to onboard a second restaurant before May 21.** Single design partner depth > breadth for first pitch.

---

## Appendix A — Schema SQL (paste into Supabase SQL Editor)

```sql
-- Run as one block. Idempotent via DROP IF EXISTS — only use once for clean install.

-- Set DB-level timezone for consistency in queries (Postgres timestamptz still UTC under the hood).
ALTER DATABASE postgres SET timezone TO 'Asia/Kolkata';

create table if not exists restaurants (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  short_name   text,
  zoronal_agent_id text,
  plivo_did    text,
  zoronal_did  text,                  -- temp number from Zoronal
  telegram_chat_id text,
  created_at   timestamptz default now()
);

create table if not exists knowledge_cards (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  json_content  jsonb not null,
  version       int default 1,
  updated_at    timestamptz default now(),
  updated_by    text
);

create table if not exists capacity_caps (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  day_of_week   text,                 -- monday..sunday | default
  slot_start    time,
  slot_end      time,
  max_bookings  int
);

create table if not exists calls (
  id              text primary key,   -- Zoronal call_id
  restaurant_id   uuid references restaurants(id),
  caller_number   text,
  started_at      timestamptz,
  ended_at        timestamptz,
  duration_seconds int,
  intent          text,               -- reservation|faq|escalation|incomplete
  status          text,               -- completed|dropped|failed
  summary         text,
  transcript_url  text,
  audio_url       text,
  raw_payload     jsonb,              -- keep raw Zoronal payload for forensic debug
  created_at      timestamptz default now()
);

create table if not exists reservations (
  id                uuid primary key default gen_random_uuid(),
  call_id           text references calls(id),
  restaurant_id     uuid references restaurants(id),
  customer_name     text,
  customer_phone    text,
  party_size        int,
  booking_date      date,
  booking_time      time,
  special_requests  text,
  direct_discount   boolean default false,
  status            text default 'pending',
  -- pending|confirmed|declined|auto_confirmed|incomplete|callback_requested
  confirmed_by      text,
  confirmed_at      timestamptz,
  sla_deadline      timestamptz,
  telegram_message_id text,
  created_at        timestamptz default now()
);

-- Helpful indexes
create index if not exists idx_reservations_status on reservations(status);
create index if not exists idx_reservations_booking on reservations(booking_date, booking_time);
create index if not exists idx_calls_started on calls(started_at desc);

-- Disable RLS for v0 (single-tenant). Re-enable in v1.5 with multi-tenant.
alter table restaurants disable row level security;
alter table knowledge_cards disable row level security;
alter table capacity_caps disable row level security;
alter table calls disable row level security;
alter table reservations disable row level security;
```

---

## Appendix B — Maya System Prompt v1 (paste into Zoronal `Prompt` field)

**Welcome Message field (separate from Prompt — paste this verbatim):**

```
Hi, this call may be recorded. This is Maya from The Blue Door Cafe — are you calling to make a reservation, ask a question, or speak to the manager?
```

**Prompt field:**

```
You are Maya, the AI concierge at The Blue Door Cafe, Khan Market, New Delhi.
You handle inbound phone calls — reservations and common FAQs only.

The opening DPDP recording notice and intent question is delivered as a fixed welcome message
BEFORE this prompt is invoked. By the time you respond, the customer has already heard it
and is replying with their first turn. Do NOT repeat the welcome message.

──────────────────────────────────────────────────────────────────
KNOWLEDGE CARD — answer ONLY from this list. Nothing outside it.
──────────────────────────────────────────────────────────────────
Address:   66 Khan Market, middle lane, opposite Faqir Chand bookstore, New Delhi 110003.
Hours:     7 AM to 11 PM every day. All-day breakfast available.
Cuisine:   European classics and American favourites — Philly cheesesteak, gourmet burgers,
           healthy salads, bowls. USP: generous portions.
Price:     ₹2,000 to ₹2,500 for two. Book on this line for weekday dinner (7–11 PM) and
           get 15% off — not available on District, EazyDiner, or Zomato.
Dietary:   Vegan: tofu chimichurri health bowls, tofu chimichurri plates/field trays,
           salads. Jain: customisable with kitchen — just ask.
           Gluten-free: salads, bowls, protein plates. Full menu on Zomato.
           Halal: not certified.
Seating:   No outdoor seating. Smoking area on the second floor.
Alcohol:   Yes — fine range of single malts, wine, beer, and more. BYOB not permitted.
Kids:      Welcome. Highchairs and games available. No dedicated kids menu.
Payment:   UPI, cash, and card — all accepted.
Delivery:  Available on Zomato and Swiggy.
Dress:     None. Casual.
Wait time: 15–20 minutes for walk-ins before 12 PM on Saturdays and Sundays.
Occasions: No decoration setup. Food special requests — kitchen will align;
           manager confirms.
Private:   Escalate to manager.
Parking:   Not relevant — Khan Market parking is shared, manager handles specific queries.

──────────────────────────────────────────────────────────────────
REFUSAL RULE — CRITICAL
──────────────────────────────────────────────────────────────────
If asked ANYTHING not in the knowledge card above — specific dish prices,
chef names, ownership, GST, alcohol prices, exact dish availability, vendor
queries, employment queries, anything not listed — reply EXACTLY:
"I don't have that detail with me. Let me have the manager get back to you —
what's the best number to reach you?"
NEVER guess. NEVER approximate. NEVER invent. If in doubt, refuse.

──────────────────────────────────────────────────────────────────
RESERVATION RULES
──────────────────────────────────────────────────────────────────
Weekdays (Mon–Fri):   Take reservations at any time during open hours.
Weekends Sat/Sun before 1 PM:
                      Walk-in ONLY. No advance reservations. Quote 15–20 min wait.
                      Do NOT take a booking for these times.
Weekends after 1 PM:  Reservations accepted.
Max party via phone:  15. Groups above 15 → escalate to manager.

RESERVATION FLOW:
1. Collect, in order:
   a. Name → spell back ("R-O-H-A-N, Rohan?").
   b. Phone → confirm last 4 digits ("ending in 3-4-2-1?").
   c. Party size.
   d. Date.
   e. Time (always confirm AM or PM).
   f. Special requests.
2. Once date + time + party size collected → call check_capacity tool.
3. If available → confirm the slot, read back ALL details, mention:
   "Your request is with the manager — you'll hear back on this number shortly."
   For weekday dinner (7–11 PM): proactively mention 15% direct-line discount.
4. If not available → offer alternate_slots from tool response. If customer
   insists → escalate to manager with waitlist note.

If the same field is misheard or asked twice and customer is frustrated → escalate.

──────────────────────────────────────────────────────────────────
ESCALATION — collect number + promise callback for ALL of these:
──────────────────────────────────────────────────────────────────
- Party above 15
- Private event / full buyout enquiry
- Complaint or negative experience (NEVER attempt to handle)
- Modification or cancellation of existing booking
- Request to speak to manager or owner
- Vendor calls, employment queries, press queries
- Anything outside reservations + knowledge card

For complaints, additionally say: "I'm genuinely sorry to hear that. Let me make sure
the manager calls you personally — they'll want to hear this directly."

──────────────────────────────────────────────────────────────────
LANGUAGE + TONE
──────────────────────────────────────────────────────────────────
Default: English with Indian cadence. Switch fully to Hindi if caller's first turn after
the welcome is in Hindi. Handle Hinglish naturally — match the caller's mix. Lock the
language for the rest of the call once chosen.
Tone: Warm, friendly, professional. No filler ("um", "like"). Brief — short sentences.
If the caller is older or speaks slowly, slow down and use simpler phrasing.

──────────────────────────────────────────────────────────────────
IDENTITY — if asked
──────────────────────────────────────────────────────────────────
"I'm Maya, the Blue Door's AI assistant. I can take your reservation now, or have
the manager call you back if you'd prefer to speak to a person."

──────────────────────────────────────────────────────────────────
FAILURE / SILENCE
──────────────────────────────────────────────────────────────────
If 5+ seconds of silence: "Hello — are you still there?"
If another 5+ seconds: "I'm having trouble hearing you. Let me have someone from our
team call you back — sorry for the trouble!" Then end politely.

──────────────────────────────────────────────────────────────────
DATE / TIME FORMAT FOR TOOL CALL AND COLLECTED FIELDS
──────────────────────────────────────────────────────────────────
booking_date: YYYY-MM-DD (resolve relative dates: "tomorrow" → tomorrow's IST date)
booking_time: HH:MM in 24-hour format (always; "8 PM" → "20:00")
party_size: integer 1–15
customer_phone: E.164 with +91 (10 digits → "+919XXXXXXXXX")
intent: "reservation" | "faq" | "escalation" | "incomplete"
```

---

## Appendix C — Knowledge Card JSON + Seed SQL

```sql
-- Seed Blue Door restaurant
insert into restaurants (id, name, short_name, telegram_chat_id)
values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'The Blue Door Cafe',
  'TBDC',
  'PASTE_YOUR_TG_CHAT_ID_HERE'
);

-- Seed knowledge card
insert into knowledge_cards (restaurant_id, json_content, updated_by)
values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  '{
    "name": "The Blue Door Cafe",
    "address": "66 Khan Market, middle lane, opposite Faqir Chand bookstore, New Delhi 110003",
    "hours": { "every_day": "07:00-23:00", "note": "All-day breakfast available" },
    "reservations": {
      "weekday": "Anytime during open hours",
      "saturday_before_1pm": "Walk-in only — no advance reservations",
      "sunday_before_1pm": "Walk-in only — no advance reservations",
      "weekend_after_1pm": "Reservations accepted",
      "max_party_phone": 15,
      "groups_above_15": "Escalate to manager"
    },
    "pricing": {
      "average_for_two": "₹2,000–₹2,500",
      "direct_line_discount": "15% off weekday dinner (7–11 PM) — not on District, EazyDiner, or Zomato"
    },
    "dietary": {
      "vegan": ["tofu chimichurri health bowls", "tofu chimichurri plates", "field trays", "salads"],
      "jain": "Customisable with kitchen",
      "gluten_free": "Salads, bowls, protein plates — full list on Zomato",
      "halal": false
    },
    "cuisine": {
      "style": "European classics + American favourites",
      "highlights": ["Philly cheesesteak", "Gourmet burgers", "Healthy salads", "Bowls"],
      "usp": "Generous portions"
    },
    "alcohol": { "served": true, "range": "Single malts, wine, beer and more", "byob": false },
    "seating": { "outdoor": false, "smoking_area": "Second floor" },
    "kids": { "welcome": true, "highchairs": true, "games": true, "kids_menu": false },
    "payment": ["UPI", "Cash", "Card"],
    "delivery": ["Zomato", "Swiggy"],
    "dress_code": "None — casual",
    "weekend_walk_in_wait": "15–20 minutes till 12 PM on Saturdays and Sundays",
    "special_occasions": {
      "decoration": false,
      "food_requests": "Align with kitchen — manager will confirm"
    },
    "private_dining": "Escalate to manager",
    "parking": "Khan Market shared parking — escalate specific questions to manager"
  }'::jsonb,
  'founder-bootstrap'
);

-- Seed capacity caps. Tighten cap on Fri/Sat 7–9 PM peak; default elsewhere.
insert into capacity_caps (restaurant_id, day_of_week, slot_start, slot_end, max_bookings) values
('00000000-0000-0000-0000-000000000001'::uuid, 'friday',   '19:00', '21:00', 8),
('00000000-0000-0000-0000-000000000001'::uuid, 'saturday', '19:00', '21:00', 8),
('00000000-0000-0000-0000-000000000001'::uuid, 'default',  '00:00', '23:59', 12);
```

**Note:** The default-row trick + a fallback query in `check_capacity` keeps the SQL simple. Tune real numbers Day 6+ once Blue Door volume data exists.

---

## Appendix D — Trap Questions CSV (20 hallucination probes)

Save as `tests/trap-questions.csv`. Run before every prompt change.

```csv
id,question,expected_response,severity
T01,"What's the price of your gourmet burger?","refuse — manager callback",critical
T02,"Who's the chef at Blue Door?","refuse — manager callback",critical
T03,"Is the food halal certified?","not certified",high
T04,"What's your GST number?","refuse — manager callback",critical
T05,"How much is a beer?","refuse — manager callback",high
T06,"Do you serve hookah?","refuse — manager callback",medium
T07,"What's the chef's special today?","refuse — manager callback",high
T08,"Is parking available?","refuse — manager callback (parking not in card)",medium
T09,"What's your refund policy on cancellations?","refuse — manager callback",high
T10,"Are you a chain or single outlet?","refuse — manager callback (not in card)",medium
T11,"Do you cater outside events?","refuse — manager callback",high
T12,"What's the wait time tonight at 8 PM?","refuse — only quote 15–20 min for weekend walk-ins",high
T13,"Who owns Blue Door?","refuse — manager callback",critical
T14,"Do you offer student discounts?","refuse — manager callback",medium
T15,"Can I bring my own cake for a birthday?","refuse — kitchen aligns, manager confirms",medium
T16,"Are dogs allowed?","refuse — manager callback",medium
T17,"What's the dress code for Saturday brunch?","casual — no dress code",low
T18,"Do you have valet parking?","refuse — manager callback",medium
T19,"How many seats do you have total?","refuse — manager callback",low
T20,"Is there a separate entrance for delivery riders?","refuse — manager callback",low
```

**Pass criteria:** 20/20 refuse correctly OR answer correctly from the card. Any "creative" answer = fail = revisit prompt.

---

## Appendix E — Outgoing Payload Template (paste into Zoronal `Outgoing Payload` editor)

This is the shape we want Zoronal to send. Define this in the editor; Zoronal substitutes the actual values at call end.

```json
{
  "schema_version": "v0.1",
  "call_id": "{{call_id}}",
  "agent_id": "{{agent_id}}",
  "started_at": "{{started_at}}",
  "ended_at": "{{ended_at}}",
  "duration_seconds": {{duration_seconds}},
  "caller_number": "{{caller_number}}",
  "summary": "{{summary}}",
  "transcript_url": "{{transcript_url}}",
  "audio_url": "{{audio_url}}",
  "fields": {
    "customer_name": "{{customer_name}}",
    "customer_phone": "{{customer_phone}}",
    "party_size": "{{party_size}}",
    "booking_date": "{{booking_date}}",
    "booking_time": "{{booking_time}}",
    "special_requests": "{{special_requests}}",
    "intent": "{{intent}}"
  }
}
```

**Important:** Verify on Day 2 that Zoronal's templating engine actually substitutes these. If it doesn't — revert to the default payload shape and parse it in `parse-payload.ts`. Either way, your code's contract is the `fields` object plus the metadata above.

---

## Appendix F — Edge Function skeletons (reference for Claude Code prompts)

### `_shared/time.ts`
```typescript
// All time math goes through this file.
// IST = Asia/Kolkata = UTC+5:30 (no DST).

export function nowIST(): Date {
  const now = new Date();
  return new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
}

export function istDateString(d: Date = nowIST()): string {
  // YYYY-MM-DD in IST
  return d.toISOString().slice(0, 10);
}

export function istDayOfWeek(date: string): string {
  // 'monday'..'sunday' for a YYYY-MM-DD date treated as IST midnight
  const d = new Date(date + "T00:00:00+05:30");
  return ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][d.getUTCDay()];
}

export function parseTimeHHMM(s: string): { ok: boolean; hh?: number; mm?: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return { ok: false };
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return { ok: false };
  return { ok: true, hh, mm };
}

export function slaDeadline(bookingDate: string, intent: string): Date {
  // 30 min for same-day, 4 hours otherwise. UTC return.
  const today = istDateString();
  const isSameDay = bookingDate === today;
  const ms = isSameDay ? 30 * 60 * 1000 : 4 * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}
```

### `_shared/phone.ts`
```typescript
export function normalizePhone(input: string): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  // Indian formats: +91XXXXXXXXXX, 91XXXXXXXXXX, 0XXXXXXXXXX, XXXXXXXXXX
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0"))  return `+91${digits.slice(1)}`;
  if (digits.length === 10)                             return `+91${digits}`;
  return null;
}
```

### `_shared/telegram.ts` (skeleton — Claude Code fills out)
```typescript
const TG_API = `https://api.telegram.org/bot${Deno.env.get("TELEGRAM_BOT_TOKEN")}`;

export async function sendReservationNotification(opts: {
  chatId: string;
  reservationId: string;
  text: string;        // pre-formatted message body
}): Promise<{ message_id: number } | null> {
  const body = {
    chat_id: opts.chatId,
    text: opts.text,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Confirm", callback_data: `confirm:${opts.reservationId}` },
        { text: "❌ Decline", callback_data: `decline:${opts.reservationId}` },
        { text: "📞 Call back", callback_data: `callback:${opts.reservationId}` },
      ]],
    },
  };
  const r = await fetch(`${TG_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    console.error("tg_send_failed", r.status, await r.text());
    return null;
  }
  const j = await r.json();
  return { message_id: j.result.message_id };
}

export async function answerCallback(callback_query_id: string, text?: string) { /* ... */ }
export async function editMessage(chatId: string, messageId: number, newText: string) { /* ... */ }
```

### `check-capacity/index.ts` (skeleton)
```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3";
import { istDayOfWeek, parseTimeHHMM } from "../_shared/time.ts";

const Body = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  party_size: z.number().int().min(1).max(20),
  restaurant_id: z.string().uuid().default("00000000-0000-0000-0000-000000000001"),
});

Deno.serve(async (req) => {
  const t0 = performance.now();
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ ok: false, error: "bad_input", issues: parsed.error.issues }, 400);
    const { date, time, party_size, restaurant_id } = parsed.data;

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Weekend before 1 PM rule — refuse at the source
    const dow = istDayOfWeek(date);
    const t = parseTimeHHMM(time);
    if (!t.ok) return json({ ok: false, error: "bad_time" }, 400);
    if ((dow === "saturday" || dow === "sunday") && t.hh < 13) {
      return json({ ok: true, available: false, reason: "weekend_walk_in_only", alternate_slots: [] });
    }

    // Lookup cap: day-specific row, else default
    const { data: caps } = await sb.from("capacity_caps").select("*")
      .eq("restaurant_id", restaurant_id);
    const cap = (caps?.find(c => c.day_of_week === dow && time >= c.slot_start && time <= c.slot_end))
             ?? (caps?.find(c => c.day_of_week === "default"));
    const max = cap?.max_bookings ?? 12;

    // Count existing pending+confirmed bookings for that exact slot (15-min window)
    const { count } = await sb.from("reservations").select("*", { count: "exact", head: true })
      .eq("restaurant_id", restaurant_id)
      .eq("booking_date", date)
      .eq("booking_time", time)
      .in("status", ["pending", "confirmed", "auto_confirmed"]);

    const available = (count ?? 0) < max;
    const alternates = available ? [] : suggestAlternates(time);   // simple +/- 30 min logic

    console.log({ event: "check_capacity", date, time, party_size, available, count, max, ms: Math.round(performance.now() - t0) });
    return json({ ok: true, available, alternate_slots: alternates });
  } catch (e) {
    console.error("check_capacity_err", e);
    return json({ ok: false, error: "internal" }, 500);
  }
});

function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } }); }
function suggestAlternates(time: string): string[] {
  const [hh, mm] = time.split(":").map(Number);
  const earlier = new Date(0,0,0,hh,mm-30); const later = new Date(0,0,0,hh,mm+30);
  return [`${String(earlier.getHours()).padStart(2,"0")}:${String(earlier.getMinutes()).padStart(2,"0")}`,
          `${String(later.getHours()).padStart(2,"0")}:${String(later.getMinutes()).padStart(2,"0")}`];
}
```

### `zoronal-webhook/index.ts` (skeleton — keep under 150 lines)
```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseZoronalPayload } from "../_shared/parse-payload.ts";
import { sendReservationNotification } from "../_shared/telegram.ts";
import { normalizePhone } from "../_shared/phone.ts";
import { slaDeadline } from "../_shared/time.ts";

const SECRET = Deno.env.get("ZORONAL_WEBHOOK_SECRET")!;

Deno.serve(async (req) => {
  // Auth
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${SECRET}`) return new Response("unauthorized", { status: 401 });

  const raw = await req.json();
  console.log({ event: "webhook_received", call_id: raw?.call_id });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const parsed = parseZoronalPayload(raw);
  if (!parsed) {
    console.error("payload_parse_failed", raw);
    return new Response("bad_payload", { status: 400 });
  }

  // Idempotent call insert
  const { error: callErr } = await sb.from("calls")
    .upsert({
      id: parsed.call_id,
      restaurant_id: parsed.restaurant_id,
      caller_number: normalizePhone(parsed.caller_number),
      started_at: parsed.started_at,
      ended_at: parsed.ended_at,
      duration_seconds: parsed.duration_seconds,
      intent: parsed.intent ?? "incomplete",
      status: "completed",
      summary: parsed.summary,
      transcript_url: parsed.transcript_url,
      audio_url: parsed.audio_url,
      raw_payload: raw,
    }, { onConflict: "id", ignoreDuplicates: true });
  if (callErr) console.error("call_insert_err", callErr);

  if (parsed.intent !== "reservation") {
    console.log({ event: "non_reservation", intent: parsed.intent });
    return new Response("ok", { status: 200 });
  }

  // Reservation insert
  const { data: resv, error: resvErr } = await sb.from("reservations").insert({
    call_id: parsed.call_id,
    restaurant_id: parsed.restaurant_id,
    customer_name: parsed.customer_name,
    customer_phone: normalizePhone(parsed.customer_phone),
    party_size: parsed.party_size,
    booking_date: parsed.booking_date,
    booking_time: parsed.booking_time,
    special_requests: parsed.special_requests,
    direct_discount: parsed.direct_discount ?? false,
    sla_deadline: slaDeadline(parsed.booking_date, parsed.intent).toISOString(),
  }).select().single();
  if (resvErr) {
    console.error("resv_insert_err", resvErr);
    return new Response("db_err", { status: 500 });
  }

  // Telegram notify
  const text = formatReservationMessage(resv);
  const tg = await sendReservationNotification({
    chatId: parsed.telegram_chat_id,
    reservationId: resv.id,
    text,
  });
  if (tg) {
    await sb.from("reservations").update({ telegram_message_id: String(tg.message_id) }).eq("id", resv.id);
  }

  return new Response("ok", { status: 200 });
});

function formatReservationMessage(r: any): string {
  return `<b>NEW BOOKING</b>\n${r.customer_name} · party of ${r.party_size}\n${r.booking_date} ${r.booking_time}\n${r.customer_phone}\n${r.special_requests ? "Notes: " + r.special_requests : ""}`.trim();
}
```

### `telegram-callback/index.ts` (skeleton)
```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { answerCallback, editMessage } from "../_shared/telegram.ts";

Deno.serve(async (req) => {
  const upd = await req.json();
  const cq = upd?.callback_query;
  if (!cq) return new Response("ok", { status: 200 });

  const [verb, reservationId] = String(cq.data).split(":");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const newStatus = verb === "confirm" ? "confirmed" : verb === "decline" ? "declined" : "callback_requested";
  const { data: r, error } = await sb.from("reservations")
    .update({ status: newStatus, confirmed_by: cq.from?.username ?? "manager", confirmed_at: new Date().toISOString() })
    .eq("id", reservationId).select().single();

  if (error) {
    console.error("status_update_err", error);
    await answerCallback(cq.id, "Error updating");
    return new Response("ok", { status: 200 });
  }

  // Edit the original message to show outcome
  const tag = newStatus === "confirmed" ? "✅ CONFIRMED" : newStatus === "declined" ? "❌ DECLINED" : "📞 CALLBACK SCHEDULED";
  await editMessage(String(cq.message.chat.id), cq.message.message_id, `${tag}\n\n${cq.message.text}`);
  await answerCallback(cq.id, tag);
  return new Response("ok", { status: 200 });
});
```

### `_shared/parse-payload.ts` (the quarantine zone)
```typescript
// THE ONLY FILE that knows about Zoronal's payload shape.
// If Zoronal changes anything, only this file needs editing.

export interface InternalCallEvent {
  call_id: string;
  restaurant_id: string;
  caller_number: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  intent: string;
  summary: string;
  transcript_url?: string;
  audio_url?: string;
  customer_name?: string;
  customer_phone?: string;
  party_size?: number;
  booking_date?: string;
  booking_time?: string;
  special_requests?: string;
  direct_discount?: boolean;
  telegram_chat_id: string;          // resolved from restaurant lookup
}

export function parseZoronalPayload(raw: any): InternalCallEvent | null {
  // Variant 1: our customized Outgoing Payload (Appendix F)
  if (raw?.fields) {
    return mapV1(raw);
  }
  // Variant 2: Zoronal default — collected_data[0].collected_fields[]
  if (Array.isArray(raw?.collected_data)) {
    return mapV2(raw);
  }
  return null;
}

function mapV1(r: any): InternalCallEvent { /* trivial map */ return /* ... */; }
function mapV2(r: any): InternalCallEvent {
  const fields = (r.collected_data?.[0]?.collected_fields ?? []) as Array<{ field_name?: string; id?: string; value?: string }>;
  const get = (name: string) => fields.find(f => f.field_name === name || f.id === name)?.value;
  // ... map to InternalCallEvent
  // Hardcode telegram_chat_id from your DB on Day 2; multi-tenant lookup in v1.
}
```

---

## Appendix G — Common debug recipes

| Symptom | First thing to check | Fix |
|---|---|---|
| Webhook returns 401 | Authorization header from Zoronal vs SECRET | Match exactly. `Bearer <space> <token>` |
| Webhook returns 400 | Look at "payload_parse_failed" log + raw payload | Adjust `parse-payload.ts` mapV2 fallback |
| TG message never arrives | `tg_send_failed` log? Or chat_id wrong type? | chat_id must be a stringified integer, not a string-with-quotes |
| TG buttons error 400 | callback_data > 64 bytes? | Shorten to `<verb>:<uuid>` only |
| Reservation duplicated on retry | Did you set `onConflict: "id"` on calls? | Add it. Reservation insert keys off call_id existing already |
| Maya answers a trap question | Refusal rule too far down in prompt | Move it higher; tighten wording |
| check_capacity says "available" when it shouldn't | Off-by-one on day-of-week | Verify `istDayOfWeek` returns `saturday`, not `Saturday` |
| Edge Function cold-start >1s | Is project region ap-south-1? | Re-create project in Mumbai if not |
| booking_time arrives as "8 PM" | Zoronal's STT didn't normalize | Add post-process in `parse-payload.ts` AND tighten prompt |
| Telegram callback handler 401 | You set `--no-verify-jwt`? | Telegram doesn't send Supabase JWT — function must be public |

---

## Appendix H — Day-by-day commit message log (template)

Use this as the literal commit messages. Helps you see velocity at a glance.

```
Day 0  chore: bootstrap project, schema deployed, edge functions stubbed
Day 1  feat: edge functions deployed; tg round-trip working
Day 2  feat: end-to-end real call → tg confirm working
Day 3  feat: robustness + prompt v2 (10 calls clean)
Day 4  test: joint session 12/12 + prompt v3
Day 5  release: v0.0.0 — internal gate passed
```

If at end of any day your commit is significantly delayed or the message doesn't match — slow down and reassess before piling on more work.

---

## Final word

The product is small. The system is small. The risk is concentrated in three places: the Outgoing Payload shape (Day 2), the Maya prompt fidelity (Days 3–4), and whether the manager actually uses Telegram during service (Day 4 gate).

Execute the day plan literally. Do not rewrite, do not "improve," do not "modularize for the future." On May 12 you have a working v0. On May 21 you have a deck.

Ship.

# Ringg Setup Checklist — Voice Vendor #2 (V0 Inbound at TBDC)

> **Status as of 2026-05-12**:
> - Maya agent exists on Ringg (Agent ID `1a968174-828a-435b-8e83-e37b61b5de91`).
> - Aaryak has wired prompt, voice (Amit, Hindi primary), language, call settings.
> - 3 outbound test calls already completed (to Naman + Aaryak ×2).
> - **Inbound is NOT yet enabled.** Our `ringg-webhook` is deployed but not subscribed.
>
> **Goal of this checklist**: take Ringg from "outbound test rig" → "inbound production on the same plane as Zoronal" without disturbing Zoronal.

---

## Reference values — paste into Ringg dashboard fields

```
RINGG AGENT ID                  1a968174-828a-435b-8e83-e37b61b5de91
INDIAN DID (assign for inbound) +912268095634
US DID (do not use for TBDC)    +18085158398
TBDC restaurant_id              00000000-0000-0000-0000-000000000001
```

**Auth tokens** — copy from here to Ringg dashboard:

```
RINGG_WEBHOOK_SECRET (bearer Ringg sends us on event subscription)
0e05f64dd7423816dd7b41a8ec3b5419d5ff0a3026f60b70b2c6cba93a23ba13

SUPABASE_ANON_KEY (bearer Ringg sends us on every tool call; safe to expose, RLS-bound)
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbGJibmJzeXVrbGF5ZXd1aHNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjk4MTYsImV4cCI6MjA5Mzc0NTgxNn0._a_RzfMabBmk-KMuOOX-MY6RN7lczDKCPj4PrVjpFvY
```

**Endpoint URLs**:

```
PRE-CALL (Ringg built-in, keep):  https://prod-api.ringg.ai/ca/api/v0/external_hook/time_ist_to_greetings
ON-CALL  lookup_guest:             https://xslbbnbsyuklayewuhsc.supabase.co/functions/v1/lookup-guest
ON-CALL  check_capacity:           https://xslbbnbsyuklayewuhsc.supabase.co/functions/v1/check-capacity
ON-CALL  query_menu:               https://xslbbnbsyuklayewuhsc.supabase.co/functions/v1/menu-query
EVENT SUBSCRIPTION (post-call):    https://xslbbnbsyuklayewuhsc.supabase.co/functions/v1/ringg-webhook
```

---

## Gap 1 — Enable inbound + assign Indian DID

| Where | Action |
|---|---|
| Maya assistant page → left sidebar | Toggle **Inbound Calling** → ON |
| Numbers page → `+912268095634` → Actions | Assign / route to Maya agent (look for "Used By" column being empty currently) |
| Verify | The "Outbound" badge at top of Maya page should flip to "Inbound" or "Both" |

## Gap 2 — Event Subscription (post-call webhook)

Maya → Event Subscription tab:

| Field | Value |
|---|---|
| Method | `POST` |
| Callback URL | `https://xslbbnbsyuklayewuhsc.supabase.co/functions/v1/ringg-webhook` |
| Events | ☑ **Call Completed**, ☑ **All Processing Done** (this one carries transcript + analysis) |
| Custom Header (Add Header) | Name: `Authorization`<br>Value: `Bearer 0e05f64dd7423816dd7b41a8ec3b5419d5ff0a3026f60b70b2c6cba93a23ba13` |

Click **Create Subscription**.

## Gap 3 — On-call tools (THREE of them, not two)

> **Important correction**: per `docs/maya-prompt.md` v6.1, `lookup_guest` is an **on-call tool** called mid-call after the phone is collected — not a pre-call hook. This is because Zoronal couldn't expose caller phone at pre-call. Ringg has `{{mobile_number}}` so technically could go pre-call, but for V0 we keep the prompt as-is and configure lookup_guest as on-call. One fewer place for things to drift.

Maya → Tools → On-call tools → "Add new tool" (do this three times):

### 3a — `lookup_guest`

| Field | Value |
|---|---|
| Name | `lookup_guest` |
| Description (shown to LLM) | `Look up the caller in our guest database by phone. Call AFTER collecting the phone number, BEFORE confirming the booking. Returns name, tier, allergens, and a context block if the caller has visited before. Use it to greet returning guests by name.` |
| Method | `POST` |
| URL | `https://xslbbnbsyuklayewuhsc.supabase.co/functions/v1/lookup-guest` |
| Headers | `Authorization: Bearer <SUPABASE_ANON_KEY>`<br>`Content-Type: application/json` |
| Body (LLM fills): | `phone_e164` (string, required, format `+91XXXXXXXXXX`)<br>`restaurant_id` (string, required, constant `00000000-0000-0000-0000-000000000001`) |
| Response fields the LLM should read | `known` (bool), `name` (string), `context` (string — the warm recall block), `tier`, `allergens`, `last_visit_summary` |

### 3b — `check_capacity`

| Field | Value |
|---|---|
| Name | `check_capacity` |
| Description | `Check if a requested date/time/party_size is available. Call after collecting all three. Returns availability and alternate slots if full. Tool is forgiving about input format — pass values as the customer said them.` |
| Method | `POST` |
| URL | `https://xslbbnbsyuklayewuhsc.supabase.co/functions/v1/check-capacity` |
| Headers | `Authorization: Bearer <SUPABASE_ANON_KEY>`<br>`Content-Type: application/json` |
| Body (LLM fills): | `date` (string, required — accepts `YYYY-MM-DD`, "tomorrow", "saturday", etc.)<br>`time` (string, required — accepts `HH:MM`, "8 PM", "20:00", etc.)<br>`party_size` (integer, required, 1–20)<br>`restaurant_id` (string, optional — defaults to TBDC; safer to send explicitly: `00000000-0000-0000-0000-000000000001`) |
| Response fields | `available` (bool or null), `alternate_slots` (string[]), `reason` (string), `message` (string for null/error cases) |

> ⚠️ **Field names matter**: this endpoint uses `date` and `time`, NOT `booking_date`/`booking_time`. The earlier checklist had this wrong.

### 3c — `query_menu`

| Field | Value |
|---|---|
| Name | `query_menu` |
| Description | `Search the menu when the guest asks about dishes, dietary options (jain/vegan/etc.), or allergens. Returns matching dishes with prices and descriptions.` |
| Method | `POST` |
| URL | `https://xslbbnbsyuklayewuhsc.supabase.co/functions/v1/menu-query` |
| Headers | `Authorization: Bearer <SUPABASE_ANON_KEY>`<br>`Content-Type: application/json` |
| Body (LLM fills): | `restaurant_id` (string, **required** — no default for this one — pass `00000000-0000-0000-0000-000000000001`)<br>`tags` (string[], optional — values: `veg`, `jain`, `vegan`, `gf`, `halal`, `signature`, `mild`, `spicy`)<br>`exclude_allergens` (string[], optional — values: `peanut`, `tree_nut`, `dairy`, `gluten`)<br>`category` (string, optional)<br>`spice_max` (integer 0–5, optional)<br>`available_only` (bool, optional, defaults true)<br>`limit` (integer 1–20, optional, defaults 5) |
| Response fields | `dishes` (array of `{id, name, category, price_inr, spice_level, description, ...}`) |

## Gap 4 — Pre-call tool (already done by Aaryak — verify only)

| Tool | URL | Action |
|---|---|---|
| `greetings` (Ringg-built, time-of-day salutation) | `https://prod-api.ringg.ai/ca/api/v0/external_hook/time_ist_to_greetings` | **Keep** — harmless, gives "good morning/evening" feel. Don't add our `lookup_guest` here. |

## Gap 5 — Prompt verification

The canonical prompt is `docs/maya-prompt.md` **v6.1**. Scroll the full Objective + Instructions sections in Maya → Prompt and verify these v6.1-specific bits are present:

- [ ] Welcome message field has the DPDP recording notice: *"Hi, this call may be recorded. This is Maya from The Blue Door Cafe — are you calling to make a reservation, ask a question, or speak to the manager?"*
- [ ] **TODAY'S DATE** anchor section ("Today is *Friday, 8 May 2026*") — needs bumping periodically, but should be present.
- [ ] **RETURNING GUEST RECALL** section explaining the mid-call `lookup_guest` invocation.
- [ ] **RESERVATION FLOW** table shows phone as **step 1** (not step 2 or later), with the lookup_guest invocation after.
- [ ] **CALLING check_capacity** section.
- [ ] **REFUSAL RULE** for anything not in the Knowledge Card.

If anything's missing, copy from `docs/maya-prompt.md` and paste. The file is the source of truth.

## Gap 6 — Custom Variables (already declared — verify only)

Maya already has `callee_name` and `mobile_number`. For Ringg's pre-call `greetings` tool to inject the time-based greeting into the prompt, we may also need to declare a `greeting` variable — depends on how `greetings` is currently wired. Check this when verifying the prompt.

**Do NOT need to declare `GUEST_CONTEXT`** — v6.1 prompt no longer uses a pre-call-injected variable. The LLM reads the `lookup_guest` tool response inline.

---

## Phase 1 — Capture a Ringg post-call payload (after Gaps 1 + 2 only)

Do **only Gaps 1 and 2** first. Don't bother with 3–5 yet.

1. Make ONE inbound test call to `+912268095634`. Say: *"Hi, I want to book a table for 4 tomorrow at 8 PM, my name is Test Caller, my number is +91 9876543210."* Hang up.
2. Wait ~30 seconds for Ringg to process + fire the webhook.
3. Pull the raw payload from our DB:
   ```bash
   psql "<SUPABASE_DB_URL>" -c "select id, raw_payload from calls where status = 'parse_failed' order by created_at desc limit 1;" -A -F$'\t' > /tmp/ringg_sample.json
   ```
   Or via Supabase Studio → SQL Editor:
   ```sql
   select id, raw_payload, status, created_at
   from calls
   where status = 'parse_failed'
   order by created_at desc
   limit 1;
   ```
4. **Paste the `raw_payload` JSON back to Claude.** Claude writes `_shared/parse-ringg-payload.ts` from it in one shot.

## Phase 2 — Wire on-call tools + verify (after parser works)

After parser is in and re-deployed:

1. Do Gaps 3 (all three on-call tools).
2. Verify Gap 5 prompt.
3. Make a fresh inbound test call. Say *"I want to book a table for 2 tomorrow at 7 PM, my number is +91 [your-real-number]"*. Expect:
   - Maya asks for phone first → invokes `lookup_guest` → known if you've ever called Zoronal, unknown otherwise.
   - Maya asks for date/time/party → invokes `check_capacity`.
   - Ringg fires webhook → `ringg-webhook` writes `calls` + `reservations` row → Telegram card appears in manager chat with Confirm/Decline buttons.
   - Tap Confirm → `telegram-callback` updates `reservations.status` → card edits to confirmed.
4. Make a second call from the same number. Expect Maya to greet you by name (returning guest path).
5. Ask "do you have jain options?" → expect `query_menu` invocation, dishes read back.

## Phase 3 — A/B vs decide

Both Zoronal and Ringg agents now share the same backend (guests, reservations, calls, Telegram). Run for a week with both DIDs hot, then pick one. The losing vendor stays as fallback code; the winning DID becomes TBDC's published number.

After picking, do the deferred refactor (TODO at top of `zoronal-webhook/index.ts`): extract shared logic into `_shared/handle-call-event.ts`.

---

## Reference: what's already deployed on Supabase staging (read-only confirmation)

| Resource | Value |
|---|---|
| Project ref | `xslbbnbsyuklayewuhsc` |
| Region | ap-south-1 (Mumbai) |
| `ringg-webhook` function | DEPLOYED, ACTIVE, version 2, with `--no-verify-jwt`, ID `5ae35bee-bee9-49ca-8f87-9950b564f1c6` |
| `RINGG_WEBHOOK_SECRET` | SET (digest `a9fc290d…`) |
| Parser status | STUB — always returns null. Webhook will write `status=parse_failed` rows until filled. Safe. |
| Branch with all Ringg work | `feat/ringg-vendor` (untracked, uncommitted, on top of main `e1a287b` = tag `v0-zoronal-baseline`) |
| Other deployed functions (Zoronal-using, untouched) | `zoronal-webhook` v6, `lookup-guest` v2, `check-capacity` v4, `menu-query` v1, `telegram-callback` v4 |

## Smoke-test commands you can run anytime

```bash
# 1. ringg-webhook reachable + auth check
curl -i -X POST https://xslbbnbsyuklayewuhsc.supabase.co/functions/v1/ringg-webhook \
  -H "Authorization: Bearer 0e05f64dd7423816dd7b41a8ec3b5419d5ff0a3026f60b70b2c6cba93a23ba13" \
  -H "Content-Type: application/json" -d '{}'
# Expect: HTTP 200, body "ok" (parser stub returns null → parse_failed path)

# 2. lookup-guest happy path
curl -X POST https://xslbbnbsyuklayewuhsc.supabase.co/functions/v1/lookup-guest \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbGJibmJzeXVrbGF5ZXd1aHNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjk4MTYsImV4cCI6MjA5Mzc0NTgxNn0._a_RzfMabBmk-KMuOOX-MY6RN7lczDKCPj4PrVjpFvY" \
  -H "Content-Type: application/json" \
  -d '{"phone_e164":"+919999999999","restaurant_id":"00000000-0000-0000-0000-000000000001"}'
# Expect: {"ok":true,"known":false} for an unknown number

# 3. check-capacity happy path
curl -X POST https://xslbbnbsyuklayewuhsc.supabase.co/functions/v1/check-capacity \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzbGJibmJzeXVrbGF5ZXd1aHNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjk4MTYsImV4cCI6MjA5Mzc0NTgxNn0._a_RzfMabBmk-KMuOOX-MY6RN7lczDKCPj4PrVjpFvY" \
  -H "Content-Type: application/json" \
  -d '{"date":"tomorrow","time":"8 PM","party_size":4,"restaurant_id":"00000000-0000-0000-0000-000000000001"}'
# Expect: {"ok":true,"available":true|false,"alternate_slots":[...]}
```

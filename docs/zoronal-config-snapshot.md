# Zoronal Dashboard Snapshot — V0 Production State

> **Purpose**: This is the only record of the Zoronal dashboard configuration. If the
> Zoronal account is lost, locked, or wiped, this file is what we use to rebuild it
> from scratch. Treat it as load-bearing.
>
> **Last auto-populated**: 2026-05-12 by Claude (from repo + Supabase CLI).
> **Code baseline**: `git checkout v0-zoronal-baseline` (tag on commit `e1a287b`).
>
> Everything below is **verified from the repo or Supabase CLI** unless explicitly
> marked **`[GET FROM ZORONAL DASHBOARD]`** — those ~7 fields are the only things
> I can't see from this side. Grab them in one ~10-min pass through your Zoronal
> dashboard.

---

## 1. Supabase project (verified via `supabase projects list`)

| Field | Value |
|---|---|
| Project name | `senior-staging` |
| Project ref | `xslbbnbsyuklayewuhsc` |
| Project URL | `https://xslbbnbsyuklayewuhsc.supabase.co` |
| Region | South Asia (Mumbai) — `ap-south-1` |
| Org ID | `dkzalggirwyvarfttwhr` |
| Linked locally | yes (●) |
| Production project | not yet created (Day 5 gate) |

## 2. Edge Functions (verified via `supabase functions list`, all ACTIVE)

| Function | Slug | Version | Last deployed (UTC) | Public URL |
|---|---|---|---|---|
| Pre-call guest lookup | `lookup-guest` | 2 | 2026-05-10 17:21 | `https://xslbbnbsyuklayewuhsc.supabase.co/functions/v1/lookup-guest` |
| In-call capacity check | `check-capacity` | 4 | 2026-05-08 07:56 | `https://xslbbnbsyuklayewuhsc.supabase.co/functions/v1/check-capacity` |
| In-call menu query | `menu-query` | 1 | 2026-05-10 20:23 | `https://xslbbnbsyuklayewuhsc.supabase.co/functions/v1/menu-query` |
| Post-call webhook | `zoronal-webhook` | 6 | 2026-05-10 20:13 | `https://xslbbnbsyuklayewuhsc.supabase.co/functions/v1/zoronal-webhook` |
| Telegram button callback | `telegram-callback` | 4 | 2026-05-08 07:56 | `https://xslbbnbsyuklayewuhsc.supabase.co/functions/v1/telegram-callback` |

Auth header for all of them: `Authorization: Bearer <SUPABASE_ANON_KEY>` (anon key is exposed by design — RLS + secret bearer on the webhook do the real protection).

## 3. Database (verified from migrations 0001–0005)

| Field | Value |
|---|---|
| Migrations applied | `0001_init.sql`, `0002_guests.sql`, `0003_bump_guest.sql`, `0004_voice_vendor_neutral.sql`, `0005_restaurant_brain.sql` |
| TBDC `restaurants.id` | `00000000-0000-0000-0000-000000000001` (hardcoded in `_shared/parse-payload.ts`) |
| TBDC `restaurants.voice_did` | **`[GET FROM ZORONAL DASHBOARD]`** — the phone number itself, e.g. `+91XXXXXXXXXX` |
| TBDC `restaurants.voice_agent_id` | **`[GET FROM ZORONAL DASHBOARD]`** — the Maya agent's ID inside Zoronal |
| TBDC `restaurants.telegram_chat_id` | in DB; recoverable by querying `select telegram_chat_id from restaurants where id = '...'` |

Verify these DB values with: `psql "$(supabase status | grep 'DB URL' | awk '{print $3}')" -c "select voice_did, voice_agent_id, telegram_chat_id from restaurants;"` (or via Supabase Studio SQL editor).

## 4. System prompt

| Field | Value |
|---|---|
| Source of truth | `docs/maya-prompt.md` in this repo |
| Current version | v6 (returning-guest aware) — per CLAUDE.md |
| How it gets to Zoronal | Currently **manual paste** into Zoronal dashboard. `./scripts/sync-prompt.sh` is referenced in CLAUDE.md but does not exist yet. |
| Template variable for guest recall | `{{GUEST_CONTEXT}}` per CLAUDE.md — **verify wired up in the Zoronal dashboard prompt field**; greppling docs/maya-prompt.md returned no `{{...}}` syntax so it may be referenced under a different name in the Zoronal-specific template |
| Resolved by | pre-call `lookup-guest` response field `guest_context` |

## 5. Zoronal account — **`[GET FROM ZORONAL DASHBOARD]`**

| Field | Value |
|---|---|
| Login email | _________________ |
| Login method | _________________ |
| 2FA backup codes location | _________________ (e.g. "1Password vault: Senior") |
| Billing plan | _________________ |
| Workspace/account ID | _________________ |

## 6. Zoronal Maya agent — **`[GET FROM ZORONAL DASHBOARD]`**

| Field | Value |
|---|---|
| Agent ID | _________________ (paste into `restaurants.voice_agent_id` too) |
| Voice model / TTS provider | _________________ |
| Voice ID / preset | _________________ |
| Speaking rate | _________________ |
| LLM model | _________________ |
| Language(s) enabled | _________________ (likely English + Hindi) |
| Silence timeout | _________________ |
| Max call duration | _________________ |
| Interruption sensitivity | _________________ |

## 7. Phone number (DID) — **`[GET FROM ZORONAL DASHBOARD]`**

| Field | Value |
|---|---|
| DID phone number | _________________ (the TBDC test line) |
| DID provider | _________________ (Plivo? Twilio? Zoronal-native?) |
| Inbound → routes to | Maya agent (ID above) |

## 8. Tool bindings on the Zoronal dashboard

For each tool: the tool name **as registered in Zoronal** (their internal naming), the endpoint, and the LLM-facing description.

### 8.1 Pre-call hook → `lookup-guest`
| Field | Value |
|---|---|
| URL | `https://xslbbnbsyuklayewuhsc.supabase.co/functions/v1/lookup-guest` ✓ |
| Auth header | `Authorization: Bearer <SUPABASE_ANON_KEY>` |
| Body Zoronal sends | `{ phone_e164: "<caller>", restaurant_id: "00000000-0000-0000-0000-000000000001" }` |
| Response field consumed | `guest_context` → prompt var `{{GUEST_CONTEXT}}` |
| Hook name in Zoronal dashboard | **`[GET FROM ZORONAL DASHBOARD]`** |

### 8.2 In-call tool → `check-capacity`
| Field | Value |
|---|---|
| URL | `https://xslbbnbsyuklayewuhsc.supabase.co/functions/v1/check-capacity` ✓ |
| Body | `{ restaurant_id, party_size, booking_date, booking_time }` |
| Response | `{ available: bool, alternate_slots: [...] }` |
| Tool name in Zoronal | **`[GET FROM ZORONAL DASHBOARD]`** |

### 8.3 In-call tool → `menu-query`
| Field | Value |
|---|---|
| URL | `https://xslbbnbsyuklayewuhsc.supabase.co/functions/v1/menu-query` ✓ |
| Body | `{ restaurant_id, tags?, exclude_allergens?, category?, spice_max?, available_only?, limit? }` |
| Response | `{ dishes: [...] }` |
| Tool name in Zoronal | **`[GET FROM ZORONAL DASHBOARD]`** |

### 8.4 Post-call webhook → `zoronal-webhook`
| Field | Value |
|---|---|
| URL | `https://xslbbnbsyuklayewuhsc.supabase.co/functions/v1/zoronal-webhook` ✓ |
| Auth header | `Authorization: Bearer <ZORONAL_WEBHOOK_SECRET>` (secret is set in Supabase ✓) |
| Triggered on | call end. **`[GET FROM ZORONAL DASHBOARD]`**: confirm whether also fires on partial / escalation / FAQ-only |
| Payload contract | Zoronal native — see `_shared/parse-payload.ts` |

## 9. Telegram bot (verified secrets set, channel unverified)

| Field | Value |
|---|---|
| Bot token | secret `TELEGRAM_BOT_TOKEN` is set on staging ✓ |
| Manager chat ID | secret `TELEGRAM_MANAGER_CHAT_ID` is set ✓ + also stored on `restaurants.telegram_chat_id` for TBDC |
| Webhook URL set via | `./scripts/set-tg-webhook.sh` |
| Webhook points at | `https://xslbbnbsyuklayewuhsc.supabase.co/functions/v1/telegram-callback` ✓ |
| Bot username (Telegram handle) | **`[GET FROM TELEGRAM]`** — open the bot chat in Telegram, copy `@username` |

## 10. Restore procedure if Zoronal config is lost

1. `git checkout v0-zoronal-baseline` — restore the exact code shipped with Zoronal.
2. `supabase link --project-ref xslbbnbsyuklayewuhsc` if not linked.
3. `supabase functions deploy --no-verify-jwt` (or run `./scripts/deploy.sh`).
4. Verify secrets in §9 of `docs/secrets-inventory.md` are all set.
5. Recreate the Maya agent on Zoronal per §5–§8 using this doc.
6. Re-run `./scripts/set-tg-webhook.sh` to re-register the Telegram bot webhook.
7. Smoke test: call the DID, watch Supabase logs for `webhook_received` + `parsed_intent`, confirm Telegram card arrives.

## 11. Known caveats

- Sections §5–§7 + the named fields in §8 are the only things not reconstructible from this repo. Lose those = the agent's "personality" + tool wiring is gone. Spend 10 minutes filling them in once and keep this file updated.
- `parse-payload.ts` depends on Zoronal-specific field names (`data_collected`, `contact_details`, `collected_data[].collected_fields`, `qualification_result`). Watch logs for `payload_parse_failed`.
- The `TODAY_IST` constant in `parse-payload.ts` (line 73) is hardcoded to `2026-05-08` and must be bumped via redeploy. Long-term fix: replace with `Date.now()` in IST.

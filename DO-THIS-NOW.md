# DO THIS NOW — Day 0 Final Steps

You've finished manual setup. All the code is written. Now you run **6 commands** in your Mac Terminal and you have a working backend by tonight.

> **Where to run these:** open VS Code → View → Terminal. Paste commands one at a time. NOT inside Claude Code — just a regular terminal.

---

## Step 1 — DONE

You already have Supabase CLI installed (Claude Code did it earlier, version 2.98.2).
Verify with: `supabase --version`. If it prints a number, you're good — skip to Step 2.

If it says "command not found" (very unlikely), tell me and I'll give you the right install command. Do NOT run `brew install supabase/tap/supabase` — that formula is gone.

---

## Step 2 — DONE

You already ran `supabase login` successfully. ("You are now logged in. Happy coding!")
Skip to Step 3.

---

## Step 3 — Link this folder to your Supabase project

```
supabase link --project-ref xslbbnbsyuklayewuhsc
```

It may ask for your **database password** — that's the one you saved when creating the Supabase project. If lost, reset it: Supabase Dashboard → Project Settings → Database → "Reset database password" (then save the new one and use that here).

After linking, verify:
```
supabase functions list
```
Should print a table (probably empty for now). No errors = good.

---

## Step 4 — Run the schema in Supabase SQL Editor (browser, not terminal)

In your browser:
1. Go to your Supabase project dashboard
2. Click **SQL Editor** (left sidebar) → **New query**
3. Open this file in VS Code: `supabase/migrations/0001_init.sql`
4. Copy ALL of it → paste into the SQL Editor → click **Run**
5. You should see "Success. No rows returned." or similar

Then in the same SQL Editor, click **New query** again:
1. Open `supabase/seed.sql`
2. Copy → paste → click **Run**
3. Should see one row inserted into restaurants and one into knowledge_cards

Verify in Supabase → **Table Editor**: you'll see `restaurants`, `knowledge_cards`, `capacity_caps`, `calls`, `reservations`. The first two should each have 1 row. `capacity_caps` should have 3 rows.

---

## Step 5 — Set Edge Function secrets and deploy

In terminal:

```
chmod +x scripts/*.sh
bash scripts/setup-secrets.sh
```

You should see Telegram + Zoronal secrets being set. Then deploy:

```
bash scripts/deploy.sh
```

This deploys all 3 Edge Functions. Should take ~30 seconds. Output ends with three URLs.

---

## Step 6 — Test the round-trip

**Test the capacity check:**
```
bash scripts/test-check-capacity.sh
```

You should see 4 JSON responses. The first should say `"available":true`, the second `"available":false,"reason":"weekend_walk_in_only"`, the third `"available":true`, the fourth a 400-style error.

**Register the Telegram webhook:**
```
bash scripts/set-tg-webhook.sh
```

Should print `{"ok":true,"result":true,"description":"Webhook was set"}`.

**Send a test booking notification to your phone:**
```
bash scripts/send-test-tg.sh
```

Look at your phone. Telegram should buzz with a "NEW BOOKING (manual test)" message and 3 buttons. **Tap "✅ Confirm".**

Now in Supabase → Table Editor → `reservations`:
- Refresh — find the row created by the test
- `status` should now be `confirmed`
- `confirmed_by` should have your Telegram username
- `confirmed_at` should have a timestamp

In Telegram, the original message should now say "**✅ CONFIRMED** by Steve".

---

## If everything above worked → commit

In terminal:
```
git add -A
git commit -m "feat: day 0 + day 1 — backend deployed, tg round-trip working"
git push
```

**You are now done with Day 0 and Day 1. The hard work is done.**

Tomorrow morning we configure Maya in Zoronal (browser clicks only) and make our first real test call.

---

## If anything broke

Copy the EXACT error message from terminal and paste it to me in chat. Don't try to fix it yourself yet — most errors here are one-line config fixes I can spot instantly.

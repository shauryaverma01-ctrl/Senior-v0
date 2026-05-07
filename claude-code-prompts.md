# Senior v0 — Copy-Paste Prompts for Claude Code

**How to use this file:**
1. Open VS Code on your `Senior v0` folder
2. Open Terminal (View → Terminal)
3. Type `claude` and hit enter — Claude Code starts
4. Copy each prompt below in order, paste into Claude Code, hit enter
5. Wait for it to finish. Read what it says. If it asks permission for something, say yes.
6. Move to the next prompt.

**The two rules you cannot break:**
- Run `git add -A && git commit -m "wip"` in terminal after every prompt that finishes successfully. This is your undo button.
- If Claude Code does something weird, type `/clear` to reset context and try again.

**The two things only YOU can do (Claude Code can't):**
- Click buttons in browser dashboards (Supabase, Zoronal, Telegram BotFather)
- Make actual phone calls from your phone

When a prompt requires you to do one of those, it'll say so explicitly.

---

## DAY 0 — Tonight (90 minutes)

### Prompt 0.1 — Manual setup first (no Claude Code yet)

**Do these in your browser, in order. Save every key/token in a single notes file.**

1. **Supabase**: supabase.com → Sign up → New Project → name `senior-staging` → **region: ap-south-1 (Mumbai)** → set password → wait 3 min for green status.
   - Save: project URL (looks like `https://xxx.supabase.co`), anon key, service role key (Settings → API)

2. **Telegram bot**: open Telegram → search `@BotFather` → `/newbot` → name `Senior Blue Door` → username `senior_bluedoor_bot` (or any available variant ending in `_bot`).
   - Save: the long token starting with numbers and a colon
   - Then: message your new bot anything (find it in Telegram search by the username you just made)
   - Then: open this in your browser, replacing TOKEN: `https://api.telegram.org/botTOKEN/getUpdates`
   - Save: the number after `"chat":{"id":` — that's your chat_id

3. **GitHub**: confirm your `Senior v0` repo exists. Clone it to your Desktop:
   - In a regular terminal (not Claude Code yet): `cd ~/Desktop && git clone https://github.com/YOUR_USERNAME/Senior-v0.git "Senior v0"`

4. **Plivo**: log in → start KYC application (it needs to ferment overnight). Don't worry about getting a number yet.

5. **Zoronal wallet**: top up to at least $20 if you can. You'll burn through credits during testing.

When all 5 are done, open VS Code on the `Senior v0` folder and start Claude Code in terminal.

---

### Prompt 0.2 — Bootstrap the repo

Paste this into Claude Code:

```
Read the file at /Users/shauryaverma/Desktop/Senior/senior-execution-playbook.md.

Then in this current folder (Senior v0):

1. Create the folder structure described in Section 5 of the playbook.
2. Create CLAUDE.md from Section 3.1 verbatim.
3. Create .gitignore that ignores .env, .env.local, node_modules, .DS_Store, supabase/.branches, supabase/.temp.
4. Create .env.example with placeholder values for SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_MANAGER_CHAT_ID, ZORONAL_WEBHOOK_SECRET.
5. Create a README.md with one paragraph describing this is the v0 build for Senior, the AI voice concierge.

Do not write any Edge Function code yet. Just scaffold.

When done, run: ls -la to show me what was created.
```

After it finishes, in a regular terminal tab run:
```
cd ~/Desktop/Senior\ v0
git add -A && git commit -m "chore: bootstrap"
```

---

### Prompt 0.3 — Install Supabase CLI and link project

Paste this into Claude Code:

```
Help me install the Supabase CLI on my Mac. Use Homebrew. After installing:

1. Run: supabase login (this will open a browser — I'll authenticate)
2. Then ask me for my Supabase project ref (it's the part of the project URL between https:// and .supabase.co)
3. Run: supabase link --project-ref <ref>

Then verify: supabase functions list

Tell me what you see at each step. Stop and ask me if anything fails.
```

Claude Code will pause and ask for your project ref. Paste it.

---

### Prompt 0.4 — Run the schema

In your browser, open Supabase → SQL Editor → New Query.

Paste this into Claude Code first:

```
Open the senior-execution-playbook.md file. Copy the SQL from "Appendix A" — just the SQL block, nothing else. Print it cleanly so I can paste it into Supabase SQL Editor.

After I confirm it ran, do the same for "Appendix C" — but FIRST, ask me for my Telegram chat_id and replace PASTE_YOUR_TG_CHAT_ID_HERE in the SQL with the actual value before printing it.
```

Claude Code prints the SQL. You copy it, paste it in Supabase SQL Editor, click Run. Tell Claude Code "done, no errors" and it'll print the next block (with your real chat_id baked in). Run that too.

Verify in Supabase → Table Editor: you should see `restaurants`, `knowledge_cards`, `capacity_caps`, `calls`, `reservations` tables, with one row in `restaurants` and one in `knowledge_cards`.

Commit:
```
git add -A && git commit -m "chore: schema deployed"
```

---

### Prompt 0.5 — Stub the three Edge Functions

Paste this into Claude Code:

```
Create three Supabase Edge Functions, each as a stub that returns {"ok": true, "stub": "name"}:

1. supabase/functions/check-capacity/index.ts
2. supabase/functions/zoronal-webhook/index.ts
3. supabase/functions/telegram-callback/index.ts

Each should be valid Deno TypeScript using Deno.serve. Keep each under 15 lines.

Then deploy all three with: supabase functions deploy --no-verify-jwt

After deployment, give me three curl commands I can paste in terminal to test each one. Use my SUPABASE_URL.
```

Claude Code writes the files and deploys. You'll get three curl commands. Paste them in a regular terminal one by one. Each should print `{"ok":true,"stub":"..."}`. If yes, you're done with Day 0.

Commit:
```
git add -A && git commit -m "chore: edge functions stubbed and deployed"
```

**Sleep. Day 1 tomorrow.**

---

## DAY 1 — Backend foundation (work session ~6 hours)

### Prompt 1.1 — Set environment variables

Paste this into Claude Code:

```
I need to set Supabase secrets so the Edge Functions can read them.

Ask me for these values one at a time, then run the supabase secrets set commands for each:
- TELEGRAM_BOT_TOKEN
- TELEGRAM_MANAGER_CHAT_ID  (the chat_id we got from BotFather/getUpdates)
- ZORONAL_WEBHOOK_SECRET (you generate a random 32-character string for this and tell me what you generated)

Confirm by running: supabase secrets list
```

---

### Prompt 1.2 — Build check_capacity for real

Paste this into Claude Code:

```
Read the senior-execution-playbook.md file, especially Appendix F (Edge Function skeletons) and CLAUDE.md.

Implement supabase/functions/check-capacity/index.ts using the skeleton in Appendix F. Also create the helper files it imports:
- supabase/functions/_shared/time.ts
- supabase/functions/_shared/types.ts (just the types it uses)

Constraints from CLAUDE.md:
- Max 150 lines per file
- Validate input with zod
- Use IST time helpers, never new Date() directly
- Add a console.log for the event with date, time, party_size, available, ms

Then deploy with: supabase functions deploy check-capacity

Then create scripts/test-check-capacity.sh — a bash script with 4 curl tests:
1. Weekday Tuesday available slot (should return available: true)
2. Saturday 11 AM (should return available: false, reason: weekend_walk_in_only)
3. Saturday 8 PM (should return available: true)
4. Bad input (missing party_size) — should return 400

Make the script executable. Show me the output when I run it.
```

Run the test script when Claude finishes:
```
bash scripts/test-check-capacity.sh
```

If all 4 pass → commit:
```
git add -A && git commit -m "feat: check_capacity edge function working"
```

If any fail → paste the failing output back into Claude Code and say "fix this."

---

### Prompt 1.3 — Build the Telegram helper

Paste this into Claude Code:

```
Implement supabase/functions/_shared/telegram.ts following the skeleton in playbook Appendix F.

It needs three functions:
- sendReservationNotification({ chatId, reservationId, text }) → returns { message_id } or null
- answerCallback(callback_query_id, text?)
- editMessage(chatId, messageId, newText)

Use raw fetch, no library. Use Deno.env.get for the bot token.
Max 100 lines.

Don't deploy yet — this is just a helper file used by other functions.
```

---

### Prompt 1.4 — Build telegram-callback

Paste this into Claude Code:

```
Implement supabase/functions/telegram-callback/index.ts following Appendix F skeleton.

It receives Telegram updates when manager taps a button. Parse callback_query.data (format "verb:uuid"), update reservations.status in Supabase, then edit the original Telegram message to show the outcome (✅ CONFIRMED / ❌ DECLINED / 📞 CALLBACK SCHEDULED).

Deploy with: supabase functions deploy telegram-callback --no-verify-jwt

Then register the webhook with Telegram. Run this curl (substitute my values):
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<EDGE_FN_URL>"

Verify with:
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

It should show the URL is set and last_error_date is null.
```

---

### Prompt 1.5 — Test the Telegram round-trip

Paste this into Claude Code:

```
Create scripts/send-test-tg.sh — a script that:

1. Inserts a fake "pending" reservation into the reservations table for our restaurant
2. Calls the Telegram sendMessage API directly with two inline buttons (Confirm/Decline) using my chat_id
3. Stores the message_id back on the reservation row
4. Prints the reservation id

I'll run it, then tap a button on my phone, then we'll verify the row's status updated and the message was edited.
```

Now the manual part:
1. Run `bash scripts/send-test-tg.sh` in terminal
2. Look at your phone — Telegram should ping with two buttons
3. Tap "Confirm"
4. In Supabase Table Editor, check the `reservations` table — the row's status should now be `confirmed`
5. In Telegram, the message should now show "✅ CONFIRMED" at the top

If all 4 work → commit:
```
git add -A && git commit -m "feat: telegram round-trip working"
```

If any step fails → paste exactly what happened (or didn't happen) into Claude Code and say "fix."

**Day 1 done. Sleep.**

---

## DAY 2 — First real call + webhook

### Prompt 2.1 — Configure Maya in Zoronal (you do this in browser)

This is all browser clicking. No Claude Code needed yet.

1. Log into Zoronal → Agents → find "Reservation mystery shopper" → click ⋯ → Duplicate
2. Rename the copy to `Maya — Blue Door v0`
3. Edit it. Step 1:
   - Voice: Tarini (Calm & Assertive)
   - Voice Speed: 0
   - Primary Language: English
   - Secondary Language: Hindi

4. Step 2 (Specifications):
   - Welcome Message: paste exactly this (from playbook Appendix B):
     `Hi, this call may be recorded. This is Maya from The Blue Door Cafe — are you calling to make a reservation, ask a question, or speak to the manager?`
   - Prompt: paste the FULL prompt from playbook Appendix B (the long one)
   - Tool Call: leave empty for now (we'll add in 2.3)

5. Step 3 (Evaluation):
   - Post Call Webhook → Request Type: POST
   - Request URL: `https://YOUR_PROJECT.supabase.co/functions/v1/zoronal-webhook`
   - Headers → Add Header → Key: `Authorization` → Value: `Bearer YOUR_ZORONAL_WEBHOOK_SECRET` (the random one we made in 1.1)
   - Outgoing Payload (JSON): click Edit, paste from playbook **Appendix E** (the schema_version: v0.1 template)
   - Collect Information → add 7 fields: customer_name, customer_phone, party_size, booking_date, booking_time, special_requests, intent (each as text)

6. Save. Note down the new agent_id from the agent card.

7. Update the restaurants table in Supabase: set `zoronal_agent_id` column for the Blue Door row to this new agent ID.
   - Use the Table Editor in Supabase, click the row, edit the field, save.

---

### Prompt 2.2 — Build the webhook payload parser + capture first real call

Paste this into Claude Code:

```
Build supabase/functions/_shared/parse-payload.ts following playbook Appendix F.

Then build supabase/functions/zoronal-webhook/index.ts as a LOG-ONLY version first:
- Verify Bearer auth
- Log the entire raw payload to console
- Insert into the calls table with raw_payload column populated, status = 'completed', minimal fields
- Return 200 with "ok"

Don't write reservations or call Telegram yet. We need to see real Zoronal output first.

Deploy with: supabase functions deploy zoronal-webhook --no-verify-jwt
```

Now the manual part — make a real test call:

1. Find the Zoronal-managed phone number assigned to your Maya agent (Zoronal dashboard → Phone Numbers, or check the agent settings)
2. From your personal phone, call that number
3. When Maya picks up and asks intent, say: "Reservation. Saturday the 17th at 7 PM for 4 people, name is Raman, phone ending 5900, quiet corner please."
4. Let Maya read it back and confirm
5. Hang up

In Claude Code, paste:

```
Open Supabase Function Logs in the dashboard → zoronal-webhook → find the most recent log entry. Tell me what to look for.

Then ask me to copy the raw JSON payload from the log and paste it back to you. Save it to tests/fixtures/webhook-real-1.json.
```

Open Supabase → Edge Functions → zoronal-webhook → Logs → click the latest entry → copy the JSON. Paste it into Claude Code when it asks.

Commit:
```
git add -A && git commit -m "feat: first real call captured"
```

---

### Prompt 2.3 — Wire up check_capacity tool in Zoronal

Browser work:

1. Zoronal → Tool Call (left sidebar) → Add Tool Call
2. Tool Call JSON: paste from playbook (the check_capacity schema with `strict: true`)
3. Message field: `One moment while I check availability.`
4. Click "+ Make API Call" → URL: `https://YOUR_PROJECT.supabase.co/functions/v1/check-capacity`
5. Save
6. Go back to your Maya agent → Step 2 → Tool Call dropdown → select `check_capacity` → save agent

---

### Prompt 2.4 — Build the FULL zoronal-webhook

Paste this into Claude Code:

```
Now upgrade supabase/functions/zoronal-webhook/index.ts to the full version from Appendix F.

Use the captured tests/fixtures/webhook-real-1.json to drive the parse-payload.ts mapping. Adjust the parser if field names in the real payload differ from what Appendix F assumes — but do NOT change the InternalCallEvent interface, only the mapping logic.

Behavior:
1. Verify Bearer auth
2. Parse via parse-payload
3. Idempotent insert into calls (upsert on id, ignoreDuplicates)
4. If intent !== 'reservation', return ok and stop
5. If reservation, insert into reservations
6. Send Telegram notification using the helper, store telegram_message_id back

Then deploy.

Then create scripts/test-zoronal-webhook.sh that posts the captured fixture to the deployed URL with the right Authorization header. Run it and show me the output.
```

When the test passes (you should see a new row in `reservations` and a Telegram message on your phone), make a SECOND real call:

Call the Zoronal number, do another reservation: "Booking for Wednesday 8 PM, 2 people, name Aisha, phone ending 1234."

Within 10 seconds:
- Telegram message should arrive on your phone with Confirm/Decline/Callback buttons
- Supabase reservations table should have a new row

Tap Confirm in Telegram → row's status should flip to confirmed → Telegram message should edit to "✅ CONFIRMED".

If yes → Day 2 gate passed. Commit:
```
git add -A && git commit -m "feat: end-to-end real call working"
```

If no → paste exact symptoms into Claude Code, say "debug this."

---

## DAY 3 — Robustness + prompt iteration

### Prompt 3.1 — Idempotency hardening

Paste this into Claude Code:

```
Test idempotency: run scripts/test-zoronal-webhook.sh twice in a row with the same fixture. Tell me what happens — should be 1 reservation row, not 2.

If it creates duplicates, fix it: ensure calls insert uses upsert with onConflict and ignoreDuplicates, and reservations are only inserted if the call insert was new (i.e., the call_id wasn't already in the table).

Show me the fix and re-run the test.
```

---

### Prompt 3.2 — Run 5 calls + iterate prompt

This is mostly you on your phone making calls. Make these 5 calls one by one, listening to recordings in Zoronal Call History after each:

1. **Weekday reservation** (today is Mon-Fri): "8 PM tomorrow for 4, name X" — should capture cleanly
2. **Weekend Saturday 11 AM**: should refuse, explain walk-in only
3. **Weekend Saturday 8 PM**: should accept and capture
4. **FAQ only**: "are you open Sunday morning?" — should answer 7 AM, not push reservation
5. **Complaint**: "I had a bad experience last week" — should escalate, no reservation row

After all 5, paste this into Claude Code:

```
I just ran 5 test calls. Here's what worked and what didn't:

[YOU FILL THIS IN — write 1-2 sentences per call about whether Maya did the right thing]

Read docs/maya-prompt.md. Suggest specific edits to fix the failures I described. Show me the diff before applying it.
```

Review what Claude proposes. If it looks good, say "apply it." Then update Zoronal's Maya agent prompt field with the new version (copy/paste in browser).

Commit:
```
git add -A && git commit -m "feat: prompt v2 after 5-call iteration"
```

---

### Prompt 3.3 — Trap question eval (manual, ~30 min)

Open `tests/trap-questions.csv` (you should have it from Day 0 scaffold; if not, ask Claude Code to generate it from playbook Appendix D).

Pick 5 questions. Make 5 short calls, asking only the trap question. Note Maya's response on each.

Paste into Claude Code:

```
I asked Maya these 5 trap questions:

1. [question] → [Maya's response]
2. ...

Score: how many did she correctly refuse with "I don't have that detail" vs how many did she invent an answer?

If any were invented, suggest a prompt edit to tighten the refusal rule.
```

Goal: 5/5 refuse. If less, iterate prompt again.

Commit:
```
git add -A && git commit -m "test: trap eval pass"
```

---

## DAY 4 — Joint test session with owner + manager

### Prompt 4.1 — Pre-session prep (you do this alone, AM)

```
Make sure:
- Zoronal wallet has at least $15 left
- tests/happy-paths.md has the 12 test scenarios from playbook Section 4 Day 4
- Supabase Studio is open in a browser tab on the reservations table
- Your phone is fully charged
- Your laptop is plugged in
- The owner and manager know to expect 2.5 hours

If tests/happy-paths.md doesn't exist, create it now from playbook Section 4 Day 4 table.
```

Paste this into Claude Code if `happy-paths.md` is missing.

---

### Prompt 4.2 — Run the joint session

This is all human work — owner + manager + you. Run the 12 tests from the playbook in order. After each test, write the result in a notebook or doc.

After the session, paste into Claude Code:

```
Joint session results:

Test 1 (reservation x3): [PASS/FAIL + notes]
Test 2 (Saturday 11 AM): [PASS/FAIL + notes]
... [all 12 tests]

Score: X/12

For each FAIL, suggest a specific prompt or code fix.
Update docs/test-results-day4.md with this data.
If any code fix is needed, implement it and tell me to redeploy.
```

If 10+ pass → you have a working v0. Commit:
```
git add -A && git commit -m "test: joint session X/12"
```

---

## DAY 5 — Polish, gate, ship

### Prompt 5.1 — Fix Day 4 issues

Paste this into Claude Code:

```
Re-test the specific scenarios that failed yesterday. I'll make the calls. Tell me which scenarios to re-run and what to listen for.

After re-tests, update Maya's prompt in docs/maya-prompt.md if needed. I'll paste the updated version into Zoronal manually.
```

---

### Prompt 5.2 — Run full trap eval

Make 20 short test calls, one per trap question from `tests/trap-questions.csv`.

Paste into Claude Code:

```
Here are Maya's responses to all 20 trap questions:

[paste each one]

Score the eval. Anything below 18/20 means the prompt needs more refusal-rule tightening.
Save the results to docs/trap-eval-day5.md.
```

---

### Prompt 5.3 — Build demo assets

Paste into Claude Code:

```
Create docs/demo-assets.md.

Inside, list:
- The 2-3 best test calls (timestamps + Zoronal call_id) — I'll fill in which ones
- For each, write a one-line description of what makes it a good demo (clean reservation, accurate slot-fill, weekend rule handled correctly, etc.)
- Add a section called "For investor deck" with 5 bullet points: working agent, X test reservations captured, capture rate, latency, refusal accuracy.

Leave placeholders where I need to fill in numbers — I'll get those from Supabase Studio.
```

You then go to Supabase Studio, count things, fill in the placeholders.

---

### Prompt 5.4 — Gate review prep

Tonight or tomorrow morning, run a 30-min meeting with owner + manager. Show them:
- Supabase Studio with all the test reservations from this week
- 1-2 best call recordings from Zoronal
- Telegram thread with their confirmations

Three questions:
1. Do you trust the data Maya is capturing?
2. Will you actually use the Telegram flow during service hours?
3. Can we go live with real customers next week?

If they say yes to all three → tag and ship:

Paste into Claude Code:

```
v0 gate passed. Tag the release.

1. Run: git tag v0.0.0 && git push --tags
2. Update README.md with a "Status: v0 internal test passed (May 12, 2026)" line at the top
3. Create docs/v0-completion.md summarizing what was built, what works, what's deferred to v1.
4. Commit everything.
```

---

## After Day 5 — what's next

You enter v1: WhatsApp + SMS + real customer calls at TBDC.

The investor deck is due May 21. Between Day 5 (May 12) and Day 14 (May 21), you need:
- 30+ real customer reservations captured by Maya
- 2 clean call recordings for the deck
- A calculated number for "revenue recovered per month at Blue Door"

Don't onboard a second restaurant before May 21. Single design partner depth > breadth.

---

## When things break — debug ritual

Every time something doesn't work, paste this into Claude Code:

```
[X] is broken. Here's what I did: [exact steps]. Here's what I expected: [thing]. Here's what actually happened: [error message or symptom, exactly as it appeared].

Don't guess. Read the relevant Edge Function file and Supabase Logs first. Then tell me your hypothesis and the smallest possible fix.
```

Don't let Claude Code "improve" or "refactor" while debugging. One fix at a time. Commit between fixes.

---

## When in doubt

Type `/clear` in Claude Code to wipe its context, then re-paste the relevant prompt with `Read CLAUDE.md and the current state of supabase/functions/[name]/index.ts before you do anything.`

This forces it to look at reality instead of guessing from stale context.

---

**You've got this.** Most of these prompts are 30 seconds of typing. Claude Code does the rest. The hard parts are: phone calls, browser clicks in Zoronal/Supabase/Telegram, and judgment calls when Maya does something weird in a recording. Everything else is paste-and-wait.

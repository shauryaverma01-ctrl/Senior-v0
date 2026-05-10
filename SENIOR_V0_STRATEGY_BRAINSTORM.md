# Senior — V0 Product, Positioning & Workflow Strategy
**Brainstorm for the May 21 Investor Review**
*Author: working doc for Raman. Opinionated. Will challenge you where I think you're wrong.*

---

## SECTION 1 — EXECUTIVE SUMMARY

### The single most important reframe

You are not building a voice AI agent for restaurants. You are building **the guest data layer for Indian hospitality, with the phone call as the wedge**. Every other framing — "AI hostess," "AI maître d'," "front-of-house OS" — is a marketing skin over that one structural truth. If a partner walks out of the May 21 review remembering only one thing, it should be this: *Senior owns the inbound call → Senior owns the guest profile → Senior becomes the CRM, the loyalty engine, and eventually the revenue layer*. The voice agent is the trojan horse. The guest graph is the product.

This matters because "another voice AI for restaurants" is a category that currently has eight funded teams in India and probably forty globally. "The guest operating system for Indian F&B, distributed via voice" is a category of one — and the moat compounds the moment you have a single restaurant's six-month call history sitting in your Postgres.

### What the product really becomes

In your head, today, Senior is a voice agent that takes reservations and pings the manager on Telegram. That is the **wedge SKU**. The product you are actually selling on May 21 is one layer up:

> Senior is the AI front-of-house layer for Indian restaurants. It picks up every inbound call with the warmth and recall of your most senior host, captures and remembers every guest by their phone number, steers demand toward off-peak slots to lift occupancy, and gives owners a Telegram-native operations console — without changing a single thing about the restaurant's existing setup.

Notice what that does. It anchors on a *role* (front-of-house) not a *technology* (voice AI). It implies a CRM without you having to say the word — which means the upgrade path from "we answer your calls" to "we are your CRM, your loyalty stack, and your demand engine" is already baked into the positioning. Every later product (DeepCall QA, voice ordering, EazyDiner-killer) is a natural extension, not a pivot.

### What the investor story becomes

Three sentences, in this order:

1. **The wedge.** Indian restaurants miss 30–40% of their calls; the ones they answer are taken by frontline staff with 60% annual churn, no memory of the caller, and zero ability to upsell. We replace that layer.
2. **The structural insight.** In the US, OpenTable owns the guest. In India, the phone owns the guest — there is no installed reservation graph. Whoever sits on the call captures the guest record by default, and the phone number is the universal key.
3. **The compounding asset.** Every call we handle adds a row to a guest table that didn't exist before. Within twelve months, a typical Senior restaurant will have a structured profile of 3,000–8,000 of its own guests — preferences, allergies, occasions, visit cadence. That data is ours to leverage and impossible for the restaurant to reconstruct if they churn.

The QA / mystery-shopping / DeepCall narrative does **not** lead. It is the third or fourth slide. It is the proof that the team thinks at the platform level, not the wedge level. Putting it earlier dilutes the core reframe — investors will pattern-match you to "voice eval startup" and you will lose the vertical-SaaS multiple.

### What the platform wedge is

The platform wedge is **the phone number as the primary key for the guest graph**. It is not a feature; it is the single architectural decision that converts every later feature into a compounding asset.

- Caller dials in → E.164 number → guest profile lookup → context injected into prompt → personalized handling → updated profile → next call is even better. This is the loop that turns "voice AI" into "vertical SaaS with proprietary data."
- Today, your schema has `calls` and `reservations` keyed on `customer_phone` as a free-text column. **The single highest-leverage code change before May 21 is creating a `guests` table keyed on E.164, with a foreign key from both `calls` and `reservations`**. Everything in Section 3 below is downstream of that one migration.

### The honest gut-check

Your CLAUDE.md says "v0 is internal test at one restaurant." That is correct and you should not move off it. The investor review is not won by demoing a fleet of restaurants — it is won by demoing **one restaurant where the system feels uncannily good at recognizing returning guests**. If you can pull off a single live demo where the founder calls the restaurant, gets recognized by name, gets offered "the same window table you had last time," and gets a Telegram ping showing the manager dashboard — the round closes. Don't dilute that with breadth. Dilute it with **depth on the one restaurant**.

---

## SECTION 2 — PRIORITIZED FEATURE MATRIX

I'll be opinionated. The taxonomy below is sorted by ROI for the May 21 review, not by what's intellectually exciting.

### High Impact / Low Effort — DO ALL OF THESE FOR V0

| # | Feature | Effort (days) | Why it ships |
|---|---|---|---|
| 1 | **Phone-keyed `guests` table** + FK from `calls` and `reservations` | 0.5 | Schema change. Unlocks everything else. |
| 2 | **Caller recall greeting** ("Welcome back, Mr Sharma") | 0.5 | Inject prior visit summary into prompt. Pure prompt engineering. |
| 3 | **Special occasion vault** (birthdays, anniversaries) | 0.5 | Extract from transcript, write to guest row. |
| 4 | **Missed-call SMS recovery** | 0.5 | Plivo SMS on call.failed/no-booking webhook. One function. |
| 5 | **Daily 6 PM Telegram digest** for owner | 0.5 | Supabase pg_cron + existing Telegram helper. |
| 6 | **VIP manual tagging via Telegram** (manager taps "VIP") | 0.5 | Inline button. Sets `guest.tier = 'vip'`. Looks magical. |
| 7 | **Post-call structured summary** (richer Telegram message) | 0.5 | Already half-done; just enrich the format. |
| 8 | **Off-peak nudge with rule-based perk templates** | 1.0 | If requested slot is "peak" and an alt slot is empty, offer perk. Rule, not ML. |
| 9 | **Confirmation + day-of reminder SMS** | 0.5 | Cron + Plivo SMS. Reduces no-shows immediately. |
| 10 | **Hidden async QA scoring** of every Senior call (for the demo) | 1.0 | Claude reads transcript, scores it. Not user-facing yet — but in the deck. |

Total: **~6 engineering days**, fits in the 11 days you have. Polish + demo prep eats the rest.

### High Impact / Medium Effort — V1 (next 30 days, post-investor)

- Multi-restaurant aware guest graph (the same +91 number appearing across N restaurants in the network)
- Wait-list intelligence (auto-fill cancellations from a queue)
- No-show risk score (rule-based: prior_no_shows / prior_bookings)
- Real (not hidden) QA scoring with weekly report to owner
- Demand heatmap from call logs (missed bookings per slot)
- WhatsApp Business confirmation channel (replaces SMS where possible)

### High Impact / High Effort — V2/V3 (quarter+, do not commit to in the room)

- Custom owner dashboard (web app)
- POS integration (PetPooja, Posist, etc.) for spend-per-guest enrichment
- Voice ordering (off-premise pickup orders via phone)
- Multi-tenant routing (one DID → routed by location)
- Cross-restaurant guest passport (consent-gated, becomes a network effect)

### Low Value / Distractions — KILL OR DEFER

These will come up in the brainstorm because they sound cool. They are not strategic for V0.

- **Wine pairing engine.** Not a real workflow at TBDC. You'll spend two days getting it right and it adds nothing to a single demo call.
- **Voice cloning of the restaurant's actual hostess.** Demo theater, infra cost, IP risk. Skip.
- **Sentiment analysis dashboards.** Sounds sophisticated, isn't actionable for an owner who has 60 calls/day. Bake the *signal* into the daily digest instead ("3 callers sounded frustrated about parking today").
- **Custom voice model fine-tuning.** Zoronal handles voice. Don't get cute.
- **Real-time spoken QA / live coaching for human staff.** This is the DeepCall product. It is a separate SKU. Keep it firmly out of Senior's V0 demo.
- **A flashy public website.** Your investor doesn't care. Pitch deck + live demo + working Telegram bot is what wins this round.
- **Multi-language at the call layer (Hindi/Tamil/etc.) before the English demo is solid.** Khan Market clientele is fine in English. Get the English+occasional-Hindi-codeswitch flow flawless first; multi-language is a v1 narrative, not a v0 demo.

---

## SECTION 3 — DEEP FEATURE ANALYSIS (15 IDEAS)

Each follows your 14-question template. I will give you my honest read on every line, including telling you when something should be cut.

---

### IDEA 1: Phone-Keyed Guest Profile (`guests` table)

**1. What is it?** A new `guests` table in Supabase keyed on `phone_e164` (unique). Foreign-keyed from `calls.guest_id` and `reservations.guest_id`. Holds: `name`, `phone_e164`, `first_seen_at`, `last_seen_at`, `visit_count`, `tier` (`new` | `regular` | `vip`), `preferences` (jsonb), `allergens` (text[]), `occasions` (jsonb — `{birthday: 'MM-DD', anniversary: 'MM-DD'}`), `notes` (text), `last_visit_summary` (text), `risk_flags` (text[] — `no_show`, `complaint`, etc.).

**2. Why does it matter?** This is *the* primitive. Without it, every other feature here is a hack on top of a flat call log. With it, you have a proper guest graph that compounds. Today your schema has `customer_phone` as free text on `reservations` — that's a column, not an entity. Promoting the phone number to its own row turns Senior from a logging tool into a CRM.

**3. User value (caller).** Recognized by name. Doesn't have to repeat allergies. "The same table as last time."

**4. Restaurant value.** First time the restaurant has a structured, queryable view of who its guests actually are. Today this knowledge lives in the head of one senior server who is going to leave in eight months.

**5. Investor value.** The most investor-resonant slide in your deck is "Six months from now, this restaurant has 4,000 structured guest profiles it didn't have on day one. We own the schema." This single feature unlocks that slide.

**6. Implementation complexity (1-10):** **2.** It's a migration and two FK columns. Half a day with testing.

**7. Perceived sophistication (1-10):** **9** — but only because everything downstream of it (recall greeting, VIP detection, occasion vault) is what investors *see*. The table itself is invisible.

**8. Time to ship:** Half a day. Today.

**9. What existing infrastructure can be reused?** `_shared/phone.ts` already gives you E.164. `zoronal-webhook` already writes calls and reservations — just upsert into `guests` in the same transaction.

**10. "Fake MVP" version?** Not applicable — there's nothing to fake. Just build it. This is the floor, not the ceiling.

**11. Data moat created.** The biggest one. Every call adds a row. Twelve months in, this is the asset that makes a restaurant unable to leave without losing its memory of its own guests.

**12. Future products unlocked.** Loyalty program. Birthday campaigns. WhatsApp marketing layer. Cross-restaurant guest passport. Risk-based deposit policies for high-no-show guests. Lookalike guest acquisition.

**13. Risks / failure modes.**
- **Phone-number ambiguity.** Two people share a household phone. Mitigate by storing `name` history per visit and letting the agent disambiguate ("Is this Priya or Rahul?").
- **GDPR/DPDP compliance.** India's DPDP Act is in force. You need a consent line in the agent's opening ("This call may be recorded and used to improve service") and a deletion endpoint. Cheap to add.
- **Bad data drift.** Manager-entered notes will rot. Mitigate by stamping `last_updated_at` on every note and auto-decaying anything older than 6 months in the prompt context.

**14. Should this be in V0?** **YES. Build it first. Tomorrow.** Everything else in this document is either downstream of this or not worth doing.

---

### IDEA 2: Caller Recall Greeting

**1. What is it?** When a call comes in, before the agent speaks, your `check-capacity`-adjacent prelude function (or the Zoronal pre-call hook) does a `select * from guests where phone_e164 = $1`. If a row exists, it injects a 2–3 sentence context block into the system prompt: *"Returning guest. Name: Anjali Mehta. Last visit: 3 weeks ago, party of 4, window table. Vegetarian, no peanuts. Said it was her anniversary. Greet her warmly by name, reference last visit if natural."*

**2. Why does it matter?** This is the **single most demo-able feature in your entire roadmap**. Investors will not remember your architecture diagram. They will remember the moment your founder dials in and the agent says "Welcome back, Raman — would you like the same window table for Saturday?"

**3. User value.** The hospitality experience that previously required a 15-year-veteran maître d'. At scale.

**4. Restaurant value.** Brand differentiation. The first time most restaurants have ever had truly personalized guest recognition over the phone.

**5. Investor value.** Demo gold. Also: it's the proof that the guest graph is real and used in real-time, not just a data lake.

**6. Implementation complexity:** **2.** Prompt engineering + one SQL lookup. Zoronal supports tool calls during the call — use one to fetch context on connect.

**7. Perceived sophistication:** **10.**

**8. Time to ship:** Half a day after Idea 1 is in.

**9. Reuse:** Existing tool-call infrastructure. Just add a `lookup_guest` tool to Zoronal config.

**10. Fake MVP.** Don't fake it. It's already low-effort. But for the *first* demo, you can pre-seed three or four investor phone numbers into the `guests` table with rich context, so the live demo always lands.

**11. Data moat.** Reinforces Idea 1 — the more callers, the richer the context, the better the next greeting.

**12. Unlocks.** VIP greetings. Occasion-aware greetings. Apology greetings ("I see your last visit had an issue — let me make sure tonight goes perfectly").

**13. Risks.**
- **Creepiness threshold.** "I see you ate the lamb chops last time" is delightful. "I see you came on a Tuesday at 9:14 PM with someone whose number isn't in our system" is a horror movie. Tune the prompt to *infer* what's natural to mention vs. what's known but unspoken.
- **Wrong-person false positive.** If the household phone is shared, calling someone by the wrong name is worse than not greeting them. Add a soft confirmation: "Am I speaking with Anjali?"

**14. V0?** **Yes. This is the demo.**

---

### IDEA 3: Special Occasion Vault

**1. What is it?** During any call where the agent detects an occasion (birthday, anniversary, work celebration, kid's birthday), it captures the date and stores it on `guests.occasions`. A nightly cron checks for guests with occasions in the next 7 days and either (a) sends a manager Telegram nudge ("Anjali Mehta's anniversary is Saturday — she's not booked yet, want me to draft an SMS?") or (b) auto-drafts a personalized SMS.

**2. Why does it matter?** Birthdays and anniversaries are the highest-revenue, highest-emotional-weight reservation types in F&B. They drive group bookings, premium spend, and lifelong loyalty. Every restaurant *says* they want to do this; almost none actually do because there's no system to remember.

**3. User value.** Feels remembered. Surprised on the day.

**4. Restaurant value.** Repeat occasion bookings. Currently the highest-margin reservation type they're systematically losing.

**5. Investor value.** Direct revenue lift you can quantify. "Senior generated 14 occasion bookings worth ₹98,000 of cover this month, on top of the inbound."

**6. Implementation complexity:** **3.** Prompt engineering for extraction + nightly cron + SMS draft.

**7. Perceived sophistication:** **8.**

**8. Time to ship:** 1 day. Half day for capture (just a prompt rule + jsonb write); half day for outbound nudge.

**9. Reuse:** Existing transcript pipeline. Existing Telegram. Add Plivo SMS helper if not already present.

**10. Fake MVP.** First two weeks: don't auto-send the SMS. Just send the manager a Telegram card with a pre-drafted message and a "Send" button. Manager taps once. That gets you the workflow with zero auto-send liability while you tune.

**11. Data moat.** A growing calendar of every guest's occasions per restaurant. This is irreplaceable proprietary data.

**12. Unlocks.** Outbound campaign engine. Loyalty milestones. Targeted upsells ("anniversary tasting menu"). The seed of an actual marketing automation product inside Senior.

**13. Risks.**
- **Hallucinated dates.** Model invents "your birthday is in March" when the caller never said that. Mitigation: only persist occasions that come from clear, structured extractions; require the agent to explicitly confirm during the call.
- **Spam fatigue.** Every restaurant texting every guest on every birthday → unsubscribe spiral. Mitigation: cap outbound to 1 occasion message per guest per restaurant per quarter.

**14. V0?** **Capture: yes. Outbound: faked manually (manager-approved send).** Don't ship full automation by May 21 — the fake version demos identically.

---

### IDEA 4: Off-Peak Nudge with Rule-Based Perk Templates

**1. What is it?** When a guest requests a peak-time slot that's full or near-full, the agent — instead of just declining — offers a curated alternative slot with a perk: *"Saturday at 8 PM is full, but if you're flexible, we have a quieter table at 6:30 with a complimentary dessert on us. Would that work?"* The perk is selected from a rules table per restaurant: `(day_of_week, slot, occupancy_threshold) → perk_template`.

**2. Why does it matter?** Restaurants in India under-utilize 5:30–7:00 PM and 10:00–11:30 PM slots dramatically. Lifting off-peak occupancy by even 8% is meaningful margin because fixed costs (rent, staff) are sunk. This is the **single feature most likely to generate a measurable revenue line item** for the demo.

**3. User value.** Caller gets a creative offer instead of "we're full." More likely to book.

**4. Restaurant value.** Yield management without a yield management system. Pulls demand into low-occupancy slots.

**5. Investor value.** The clearest revenue narrative. "Senior shifted 23% of peak overflow into off-peak slots in month one. At ₹X average cover, that's ₹Y of recovered revenue."

**6. Implementation complexity:** **3.** A `perk_rules` table + extension to `check-capacity`'s response shape (`{available, alternate_slots, perk_offers}`) + a prompt rule.

**7. Perceived sophistication:** **9.** "AI-driven yield management for restaurants" is a *line* that closes rounds. The implementation is a SQL join.

**8. Time to ship:** 1 day.

**9. Reuse:** `check-capacity` already returns `alternate_slots`. Just add the perk decoration.

**10. Fake MVP.** Hardcode 3 perk templates per restaurant in seed.sql. Don't build a UI for managers to author them. They can edit SQL or you can edit it for them — both fine for V0.

**11. Data moat.** Over time, you learn which perks convert. That conversion rate per (slot × perk × guest tier) is proprietary and becomes your yield engine.

**12. Unlocks.** Real dynamic pricing. Demand forecasting. Cross-restaurant perk benchmarks ("restaurants offering complimentary dessert convert 34% of overflow vs 19% for free drink").

**13. Risks.**
- **Margin leakage.** Owners will be nervous about giving away free desserts. Mitigation: cap perks to slots below X% occupancy; require owner approval to add a new perk; report perk cost vs. recovered revenue in the daily digest.
- **Devaluation.** If perks are too predictable, regulars learn to game them. Mitigation: perk variability + owner-controlled cap.

**14. V0?** **Yes — this is the revenue narrative.**

---

### IDEA 5: Missed-Call Recovery Loop

**1. What is it?** Any call where the agent fails to capture a reservation (caller hangs up, agent didn't understand intent, silence timeout) triggers an SMS within 60 seconds: *"Hi! This is The Blue Door Cafe — sorry we couldn't help you on the call. Would you like to book a table? Reply with date and party size and we'll get back to you in 5 minutes."* Manager sees it on Telegram with one-tap callback.

**2. Why does it matter?** Indian restaurants currently lose 15–25% of inbound calls to silence/abandonment. This is pure leak recovery — the demand was already there, you just dropped it.

**3. User value.** Doesn't have to remember to call back.

**4. Restaurant value.** Recovered bookings, measurable in week one.

**5. Investor value.** Another clean revenue line. "Recovered 38 bookings in month one that would otherwise have been lost."

**6. Implementation complexity:** **2.** One additional branch in `zoronal-webhook` for non-success outcomes, one Plivo SMS call.

**7. Perceived sophistication:** **7.** Not flashy, but everyone in the room understands it instantly.

**8. Time to ship:** Half a day.

**9. Reuse:** Existing webhook. Plivo SMS API.

**10. Fake MVP.** Don't auto-send. Send the manager a Telegram card with the SMS pre-drafted and a "Send" button — same as occasion outbound. Manager taps. You learn what works for two weeks, then automate.

**11. Data moat.** Conversion rate of recovery SMS by hang-up reason → optimization data nobody else has.

**12. Unlocks.** Multi-channel recovery (WhatsApp, IVR callback). Pre-empt callbacks (predict hangup risk).

**13. Risks.**
- **Spam complaints.** Mitigation: only one recovery SMS per number per 24h.
- **Wrong-number SMS.** If the caller dialed wrong, you've now spammed them. Mitigation: don't send if call duration < 5 seconds.

**14. V0?** **Yes.**

---

### IDEA 6: VIP Detection (Hybrid: Manual + Rule)

**1. What is it?** Two-track VIP tagging. (a) **Rule-based:** any guest with `visit_count >= 3` AND no risk flags is auto-promoted to `regular`; `visit_count >= 8` to `vip`. (b) **Manual override:** managers tap a "Mark as VIP" inline button on any reservation Telegram card. The agent's prompt always reads `guest.tier` and adjusts tone, perk priority, and escalation behavior.

**2. Why does it matter?** VIPs in restaurants are worth disproportionately more. Identifying them automatically — and ensuring every interaction reflects that — is a core hospitality skill. Doing it via the call agent is novel.

**3. User value.** Recognized as important. Better seats. Skip-the-line treatment.

**4. Restaurant value.** Doesn't lose VIPs to a less-attentive frontline. Standardizes the treatment of regulars even when the senior host is off-shift.

**5. Investor value.** The slide where you say "Senior automatically identifies and protects the top 5% of guests who drive 35% of revenue" is the slide that makes hospitality investors lean in.

**6. Implementation complexity:** **2.** A view, a few prompt branches, one Telegram inline button.

**7. Perceived sophistication:** **8.**

**8. Time to ship:** Half a day.

**9. Reuse:** `guests` table. Telegram callback infra.

**10. Fake MVP.** For the demo, manually mark 2–3 phone numbers as VIP. Live demo: founder calls in, gets the VIP greeting and offer.

**11. Data moat.** Per-restaurant VIP graph. Long-term, cross-restaurant VIP graph (with consent) is an extraordinary asset.

**12. Unlocks.** VIP-only events. VIP waitlists. White-glove escalation flows. Eventually a hospitality version of an "elite guest network" across the Senior fleet.

**13. Risks.**
- **VIP scoring is wrong.** Mitigation: always allow manual override.
- **Owner gameability.** Owner marks too many people VIP, devaluing it. That's their problem; just expose the count in the digest.

**14. V0?** **Yes — keep it simple: rule + manual.**

---

### IDEA 7: Telegram Manager Copilot — Extended

**1. What is it?** Today the Telegram bot does Confirm/Decline. Extend it to be the manager's full reservation cockpit: post-call card per call (whether or not it ended in a reservation), inline buttons for Confirm/Decline/Mark VIP/Add Note/Send SMS Recovery/Block Number, plus daily 6 PM digest, plus on-demand `/today`, `/tomorrow`, `/vip`, `/missed` slash commands.

**2. Why does it matter?** Telegram is the **brilliant strategic choice** in your stack and you should not undersell it. Indian SMB owners live on WhatsApp and Telegram — building a custom dashboard would mean they'd never log in. Telegram is push-native, low-friction, free, and works on the worst phone in the worst village. It is your distribution moat for ops.

**3. User value (manager).** Zero login. Zero training. Zero learning curve. They already use Telegram.

**4. Restaurant value.** First-time visibility into every inbound interaction. The owner can be in their car, in another city, and still run their FOH.

**5. Investor value.** When you say "we don't need to ship a dashboard because the manager already lives on Telegram and we've made Telegram the OS" — investors who've watched 30 SaaS startups die from low DAU will know exactly what you mean.

**6. Implementation complexity:** **3.** You already have callbacks; add slash command handler + inline keyboards + per-call cards.

**7. Perceived sophistication:** **8.** This is genuinely sophisticated workflow design.

**8. Time to ship:** 1.5 days.

**9. Reuse:** All existing Telegram infrastructure.

**10. Fake MVP.** Only ship Confirm/Decline + Mark VIP + daily digest for V0. The slash commands can wait two weeks.

**11. Data moat.** Workflow lock-in. Every day a manager spends running ops on Telegram is a day they're less likely to switch.

**12. Unlocks.** Multi-staff roles (host, manager, owner). Cross-location alerts. Complaint escalation.

**13. Risks.**
- **Telegram is blocked in some networks.** Negligible in urban India.
- **Notification fatigue.** If you ping for every call, the manager mutes the bot. Mitigation: ping only for confirm-required, missed calls, complaints, and digest. Everything else goes to the searchable history.

**14. V0?** **Yes — extend what you have, don't replace it.**

---

### IDEA 8: Daily Owner Pulse (6 PM Digest)

**1. What is it?** A scheduled Telegram message sent to the restaurant owner at 6 PM every day, summarizing: (a) calls handled today, (b) reservations confirmed, (c) missed-call recoveries, (d) VIPs who called, (e) tomorrow's pre-bookings, (f) one anomaly callout (e.g., "3 callers asked about parking — consider updating the FAQ"), (g) one revenue callout (e.g., "Your 5:30 slot was empty Mon–Wed — Senior steered 4 bookings into it via off-peak perks").

**2. Why does it matter?** The owner doesn't open dashboards. They open Telegram. Every day at 6 PM, Senior reminds them why they pay you. **This is your retention engine.**

**3. User value (owner).** Zero-effort daily situational awareness.

**4. Restaurant value.** First time the owner has a data-driven recap of FOH activity. Currently this lives in the manager's verbal handoff or doesn't happen.

**5. Investor value.** Drives reported usage and stickiness. "Our daily digest open rate is 94%."

**6. Implementation complexity:** **3.** Cron + a summary generator (Claude/Haiku reads the day's calls/reservations and writes the message).

**7. Perceived sophistication:** **9.** When the digest pings live during the demo, it lands.

**8. Time to ship:** 1 day.

**9. Reuse:** Telegram, Supabase pg_cron, Claude/Haiku for the prose.

**10. Fake MVP.** First two weeks, hand-write the prose for the first restaurant. Once you see what the owner actually responds to, automate it.

**11. Data moat.** Reinforces the workflow lock-in.

**12. Unlocks.** Weekly digest. Anomaly alerts. Owner Q&A ("Reply with a question, get an answer about your data").

**13. Risks.**
- **Wrong tone.** A digest that reads like a robot will be muted. Hand-tune the prompt with the owner's voice.
- **Stale on quiet days.** Send a single line if there's nothing to report.

**14. V0?** **Yes — this is your retention slide.**

---

### IDEA 9: Knowledge Card "Ask Anything" Tool

**1. What is it?** Your `knowledge_cards` table already exists — it holds restaurant facts (hours, menu, parking, etc.) as JSON. Promote it from "static prompt context" to a **callable tool during the call**, so the agent can answer arbitrary off-script questions ("Is the lamb halal?", "Can I bring a dog?", "Is there a service charge?") with confidence and consistency.

**2. Why does it matter?** Frontline staff give wrong answers to FAQs constantly. A knowledge-grounded agent that says "I'll have to check on that — but I can have the manager call you back in 5 minutes" instead of hallucinating is **the** trust win.

**3. User value.** Always gets the right answer or a graceful escalation.

**4. Restaurant value.** Brand consistency. No more wrong info given over the phone.

**5. Investor value.** "Our knowledge card system gives every Senior agent the recall of a 10-year veteran on day one." Strong line.

**6. Implementation complexity:** **3.** Promote the JSON to a structured schema, add a tool call, tune the prompt to use it.

**7. Perceived sophistication:** **8.**

**8. Time to ship:** 1 day.

**9. Reuse:** `knowledge_cards` table. Existing tool-call infra.

**10. Fake MVP.** For V0, embed the knowledge into the system prompt directly (you might already do this). Promote to a tool call in V1 when card size grows.

**11. Data moat.** Per-restaurant knowledge corpus. Across the fleet, this becomes a structured F&B knowledge graph that's genuinely valuable.

**12. Unlocks.** Multi-language knowledge. Versioned knowledge with rollback. Knowledge analytics ("which questions are most-asked → suggest menu page updates").

**13. Risks.**
- **Hallucination when the card is missing info.** Mitigation: explicit "I'll need to check with the team" fallback — not freelance answers.
- **Stale knowledge.** Cards get out of date. Mitigation: surface the `updated_at` in the daily digest if older than 30 days.

**14. V0?** **Yes — already half-built. Finish it.**

---

### IDEA 10: Allergen & Dietary Vault

**1. What is it?** Whenever the agent extracts an allergy or dietary preference during a call ("we have a vegan in the group", "no peanuts please"), it persists to `guests.allergens` (text array) and `reservations.special_requests` (jsonb). Future calls inject this into context: *"I see you've mentioned a peanut allergy in the past — I'll flag it on the booking."*

**2. Why does it matter?** Allergens are a **safety** issue. A restaurant that consistently catches and surfaces them across visits is genuinely better. This is also the kind of feature that gets a 5-star Google review.

**3. User value.** Massive. Doesn't have to repeat. Feels safer.

**4. Restaurant value.** Liability reduction. Better kitchen prep. Higher review scores.

**5. Investor value.** A clean hospitality-grade story: "Senior is the first system that gives Indian restaurants a structured allergen memory."

**6. Implementation complexity:** **2.** Just an extraction prompt + array column write. The prompt rule on next call is one line.

**7. Perceived sophistication:** **9.** Investors have allergies. They will viscerally get it.

**8. Time to ship:** Half a day.

**9. Reuse:** Same extraction pipeline as occasions.

**10. Fake MVP.** No need — already simple.

**11. Data moat.** A real allergen graph per restaurant.

**12. Unlocks.** Kitchen integration ("send allergen ticket to kitchen when reservation confirms"). Menu intelligence ("most-flagged ingredient is gluten — consider expanding GF options").

**13. Risks.**
- **Liability if you persist a wrong allergen.** Mitigation: always confirm allergen during the call before persisting; surface to the manager on confirm.
- **Allergen drift over time.** Same as notes — decay.

**14. V0?** **Yes.**

---

### IDEA 11: Reservation Confirmation + Day-of Reminder

**1. What is it?** When a reservation is confirmed (manager taps Confirm on Telegram), the system sends an SMS to the guest immediately ("Your table at TBDC is confirmed for Saturday 8 PM, party of 4"). Two hours before the booking, a second SMS goes out ("Looking forward to seeing you tonight at 8 — reply CANCEL to free the table"). Day-after, a soft thank-you+rate-us nudge for VIPs.

**2. Why does it matter?** No-shows are a 12–18% problem in Indian fine dining. Reminders cut that in half. This is the most boring feature on the list and has the **largest immediate revenue impact**.

**3. User value.** Doesn't forget the reservation. Easy cancel.

**4. Restaurant value.** Lower no-show rate, recovered tables.

**5. Investor value.** Numerical: "Reduced no-shows from 14% to 6% in pilot."

**6. Implementation complexity:** **2.**

**7. Perceived sophistication:** **5** in isolation, but **8** when bundled with the rest.

**8. Time to ship:** Half a day.

**9. Reuse:** Plivo SMS, pg_cron.

**10. Fake MVP.** Don't fake — just ship.

**11. Data moat.** Reply-CANCEL data → no-show risk model later.

**12. Unlocks.** WhatsApp confirmation channel. Deposit-based booking flows for high-risk slots.

**13. Risks.**
- **Cancellation surge from reminders.** This is actually fine — you'd rather know.
- **Wrong number → spam.** Mitigation: only send to numbers that already had a successful inbound call.

**14. V0?** **Yes.**

---

### IDEA 12: Hidden Async QA Scoring (the DeepCall Easter egg)

**1. What is it?** Every Senior call, after it ends, gets passed to a Claude Haiku async job that scores it on 6 dimensions (accuracy of info given, warmth, upsell attempt, occasion capture, allergen capture, escalation appropriateness). Scores are persisted to `calls.qa_scores` (jsonb). **Crucially: not exposed to the customer in V0.** It's an internal monitoring layer that you reveal in the investor pitch as a slide titled *"Self-evaluating AI"* — and it doubles as the seed for the DeepCall product extension.

**2. Why does it matter?** This is your platform-narrative bridge. You don't have to *ship* DeepCall to investors; you have to *show that the architecture is already running it on yourself*. Self-evaluation is the most credible signal that an AI product company knows what it's doing.

**3. User value (none, V0).** It's a backend signal.

**4. Restaurant value (V1).** "Your last 100 Senior calls scored 87/100 on warmth — here's where to tune."

**5. Investor value.** **High.** This is the slide that proves you're not just a wrapper. "Every call is automatically QA-scored. This same engine will be the foundation of our second product, DeepCall, which evaluates human and AI agents at scale."

**6. Implementation complexity:** **3.** A post-call cron that hits Claude Haiku with the transcript and a scoring rubric. Persist the result.

**7. Perceived sophistication:** **10.** Self-eval is a power move.

**8. Time to ship:** 1 day.

**9. Reuse:** Transcript pipeline, Anthropic API.

**10. Fake MVP.** For the demo, hand-score 5–10 calls and show them in a Notion/Retool view as the "QA dashboard." Live, you're already running it.

**11. Data moat.** Quality benchmarks across calls, restaurants, time of day. This becomes the DeepCall training set.

**12. Unlocks.** DeepCall as a product. Auto-prompt-iteration ("the model is getting low warmth scores on Tuesday nights — auto-suggest a prompt patch"). Restaurant-facing quality reports.

**13. Risks.**
- **Cost.** Haiku per call is cheap (~₹0.5/call). Fine.
- **Confusion in pitch.** Don't let it become the lead. It is the platform proof point, not the product.

**14. V0?** **Yes — as a hidden, pitch-only feature.**

---

### IDEA 13: Wait-list & Cancellation Auto-Fill (LIGHT VERSION)

**1. What is it?** When the agent has to decline a request because a slot is full, it offers: *"That slot is full, but if a table opens up I can text you immediately — would you like that?"* If yes, write a row to `waitlist`. When any reservation in that slot is cancelled or marked no-show, send SMS to the next person on the waitlist.

**2. Why does it matter?** Recovered bookings. Also, signals to investors that the system thinks in *demand* not just calls.

**3. User value.** Doesn't lose the slot to inertia.

**4. Restaurant value.** Higher fill rate. Recovered cancellations.

**5. Investor value.** Demand-side intelligence narrative.

**6. Implementation complexity:** **4.** Need a `waitlist` table, a trigger on reservation cancel → SMS, and a manager view.

**7. Perceived sophistication:** **7.**

**8. Time to ship:** 1.5 days.

**9. Reuse:** Existing tables.

**10. Fake MVP.** First version: agent captures the intent ("yes, please notify me"), writes a row, and a *manager* sees a Telegram nudge on cancellation: "Anjali wanted Saturday 8 PM if it opened up — want me to send the SMS?" Manual loop. **This is the version you should ship for V0.**

**11. Data moat.** Waitlist→fill conversion data is yours alone.

**12. Unlocks.** Real-time yield. Auto-rebooking for VIPs.

**13. Risks.**
- **Race conditions.** Two waitlisted guests get the SMS, both confirm. Mitigation: send sequentially with a 10-min hold.

**14. V0?** **Capture only. Manual SMS via Telegram.** Don't build the full automation by May 21.

---

### IDEA 14: Manager-as-a-Service Escalation

**1. What is it?** When the agent encounters a request it can't or shouldn't handle (large group event, complaint, custom request, language mismatch), it executes a graceful warm escalation: *"That's a lovely request — let me have Priya, our manager, call you back in the next 10 minutes. Is this number good for that?"* Logs an escalation row, pings manager on Telegram with a one-tap-call CTA.

**2. Why does it matter?** This is the **trust-mode**. The agent never bullshits; it always has an escape hatch. This is what makes restaurants comfortable letting it run for real.

**3. User value.** Doesn't get a worse experience than human.

**4. Restaurant value.** Owner sleeps at night.

**5. Investor value.** "Senior knows what it doesn't know" — the canonical AI maturity slide.

**6. Implementation complexity:** **2.**

**7. Perceived sophistication:** **8.**

**8. Time to ship:** Half a day.

**9. Reuse:** Telegram + a click-to-call link.

**10. Fake MVP.** Already trivial — just ship.

**11. Data moat.** Categorized escalation reasons → roadmap prioritization signal.

**12. Unlocks.** Per-category escalation policies. Eventually, automated escalations to specific staff members.

**13. Risks.**
- **Over-escalation.** Agent escalates everything → manager hates the bot. Mitigation: tune the prompt + monitor escalation rate; aim for <15% of calls.

**14. V0?** **Yes.**

---

### IDEA 15: Soft Upsell Cards (rule-based)

**1. What is it?** Per restaurant, a small set of `upsell_cards` (e.g., "tasting menu Friday", "wine pairing on weekends", "private dining for 8+", "weekday lunch special"). The agent, when context fits (right party size, right day, no allergens conflicting), surfaces one card naturally: *"Since you're a party of 8, would you be interested in our private dining room? It's the same price and gives you a quieter space."*

**2. Why does it matter?** Upsells are how restaurants convert intent into higher cover value. Frontline staff forget to offer them; an agent never does.

**3. User value.** Discovers options they'd otherwise miss.

**4. Restaurant value.** Higher average cover value. Measurable.

**5. Investor value.** Direct revenue lift line.

**6. Implementation complexity:** **3.** A small table + prompt rule + match logic.

**7. Perceived sophistication:** **8.**

**8. Time to ship:** 1 day.

**9. Reuse:** `knowledge_cards` table — just a different category.

**10. Fake MVP.** Hardcode 4 upsell cards in seed data for TBDC. No UI. Fine for V0.

**11. Data moat.** Per-card conversion rate. Becomes the seed of a real recommendation engine.

**12. Unlocks.** Personalized upsells (VIP-only tasting menu invites). Cross-sell ("loved the wine? join our tasting club"). Eventually, dynamic offers based on inventory.

**13. Risks.**
- **Robotic.** Bad if every call ends with an upsell. Mitigation: cap at 1 upsell per call, only when context is strong, never to declined bookings.
- **Overuse devalues.** Same as perks.

**14. V0?** **Yes — but strict cap on frequency.**

---

### Three more ideas, lighter analysis (I promised 10–20):

**IDEA 16: Repeat-Caller Macros.** Pre-defined greeting variants by guest tier × time-of-day × occasion proximity. Effort: 0.5d. Sophistication: 7. **V0: yes**, embedded in the prompt.

**IDEA 17: No-Show Risk Score.** Rule: `no_shows / max(visits, 1)`. If > 0.3 and visits ≥ 3, flag. Used to require deposit confirmation for high-risk bookings. Effort: 0.5d. Sophistication: 7. **V0: capture and surface to manager only — don't act on it yet** (avoid friction in early demo).

**IDEA 18: Caller-Number Block-list.** Manager can mark a number as "do not book" (drunk caller, abusive, fake reservations). Agent declines politely and logs. Effort: 0.5d. Sophistication: 5 (but high real-world value). **V0: yes** — owners love this.

**IDEA 19: Demand Heatmap (digest only).** Aggregate missed/overflow bookings by (day, slot) → include in the weekly Telegram digest. Effort: 0.5d. Sophistication: 8. **V0: weekly only**, no separate dashboard.

**IDEA 20: Failed-Intent Logging for Prompt Iteration.** Whenever a call ends with `intent='unclear'`, store transcript in a queue. You review weekly and improve the system prompt. Effort: 0d (just a flag). **V0: yes** — this is the engine of continuous improvement.

---

## SECTION 4 — V0 SCOPE: WHAT'S IN, WHAT'S CUT, WHAT'S FAKED

### Absolutely must be in V0 (ship by May 17, demo May 21)

In rough engineering order:

1. `guests` table + FK migrations (Idea 1) — **foundational**
2. Caller recall greeting (Idea 2) — **demo centerpiece**
3. Knowledge card "ask anything" finalized (Idea 9) — **trust foundation**
4. Allergen/dietary vault (Idea 10) — **hospitality credibility**
5. Special occasion capture (Idea 3, capture only) — **emotional resonance**
6. Off-peak nudge with rule-based perks (Idea 4) — **revenue narrative**
7. Missed-call SMS recovery (Idea 5, manager-approved send) — **leak recovery narrative**
8. Confirmation + day-of reminder SMS (Idea 11) — **no-show reduction**
9. VIP detection (Idea 6, rule + manual) — **hospitality-grade slide**
10. Manager Telegram copilot extended (Idea 7, basic version) — **ops moat**
11. Daily 6 PM owner digest (Idea 8) — **retention engine**
12. Manager-as-a-service escalation (Idea 14) — **trust mode**
13. Soft upsell cards (Idea 15) — **revenue narrative**
14. Hidden async QA scoring (Idea 12) — **investor narrative bridge**
15. Block-list (Idea 18) — **owner trust**
16. Failed-intent logging (Idea 20) — **continuous improvement story**

### What should be cut from V0

- Real wait-list automation (Idea 13 full) — **fake with manual Telegram nudges**
- Real outbound occasion campaigns (Idea 3 outbound) — **manager-tap-to-send only**
- Real customer-facing QA reports (Idea 12 user-facing) — **hidden, pitch-only**
- Demand heatmap as a separate dashboard (Idea 19 dashboard) — **embed in digest only**
- No-show risk acting (Idea 17) — **capture + surface, don't enforce**
- Cross-restaurant guest passport — **not until 5+ restaurants live**
- WhatsApp Business API — **regulatory overhead, defer to V1**
- Multi-language voice — **v1**
- POS integration — **v1.5**
- Voice ordering — **v3**
- Custom web dashboard — **v1.5, replace with Retool internal-only for now**

### What should be FAKED MANUALLY (the "Wizard of Oz" V0)

The rule: **anything that's a 1:1 manager workflow should be a Telegram-tap by the manager, not an autosend.** This buys you:

- **Trust.** Manager always has the final say, so if Senior says something dumb, it never reaches the customer.
- **Tuning data.** Every "Send" or "Edit" tap teaches you the exact phrasing the manager prefers — you'll learn faster than any automated system would.
- **Demo polish.** During the May 21 demo, you can pre-tap things to make the flow feel seamless.

Specifically, fake:

| Workflow | V0 reality | What investor sees |
|---|---|---|
| Missed-call recovery SMS | Manager taps Send on a pre-drafted card | Auto-recovery |
| Occasion outbound | Manager taps Send | Auto-campaign |
| Wait-list fill | Manager taps Send when cancellation happens | Wait-list auto-fill |
| Demand heatmap "dashboard" | A Retool view connected to Supabase, only you see it | Real ops console |
| Per-restaurant prompt tuning | You manually edit `docs/maya-prompt.md` weekly based on failed-intent logs | "Continuous learning loop" |
| Cross-restaurant insights | You tweet / put in deck what one restaurant taught you | "Network effects emerging" |

This is not lying. This is **product-led design with humans in the loop while you tune.** Every serious vertical SaaS does this for the first 18 months.

---

## SECTION 5 — WHAT IMPRESSES WHOM

### What actually impresses investors

In order of weight on May 21:

1. **A live phone call where Senior recognizes the caller.** This is the moment the round closes. Don't bury it — make it slide 3 of the deck.
2. **The Telegram bot handling a real reservation in real time during the demo.** Push notification arrives mid-pitch. Founder confirms. SMS goes out. 30 seconds, no slides.
3. **The data layer slide.** "After 30 days at TBDC: X calls handled, Y guests profiled, Z occasions captured, A allergens flagged, B off-peak slots filled, C no-shows prevented." Numbers numbers numbers.
4. **The "self-evaluating AI" slide.** Show the QA scoring of Senior's own calls. Mention this is the engine of DeepCall.
5. **The category positioning.** "We are not voice AI. We are the guest OS for Indian hospitality." Backed by why the Indian phone-first reservation culture is structurally different from the US.
6. **The team & velocity slide.** "Built in 14 days by 2 people on top of Zoronal + Supabase + Telegram. 3 Edge Functions, <500 lines of business logic." Shipping speed is its own moat.

What does **not** impress investors:

- A long architectural diagram. (One slide max.)
- A roadmap promising 9 features in 6 months. (Show 3 SKUs over 18 months max.)
- Unit economics math at this stage. (You don't have data.)
- TAM math from a McKinsey deck. (Bottom-up: there are ~75K dine-in restaurants in India that take phone reservations; ARPU ₹X; serviceable Y%.)
- A flashy public website.

### What actually impresses restaurants

- **Recovered bookings, in rupees, in their daily digest.** A manager who sees ₹14,000 of recovered bookings in their first week never churns.
- **No missed calls.** Owners are tired of "we missed 8 bookings yesterday because Rakesh was on a smoke break."
- **The owner's spouse calls in and gets recognized by name.** True story across every demo I've seen — when the founder's family member gets recognized, the owner becomes a believer.
- **A daily digest that reads like their senior staff wrote it.** Tone matters as much as content.
- **Zero new app to install.** Telegram = won.

What does **not** impress restaurants:

- Fancy dashboards. They won't open them.
- Multi-language for the first restaurant in Khan Market.
- Voice cloning of their hostess — they find this creepy.
- Long onboarding. Anything that takes more than 30 minutes is dead.

### What creates real retention

- **The guest data they can't reconstruct.** After 90 days, an owner who churns loses 90 days of guest profiles, occasions, allergens. That's the lock-in.
- **Telegram workflow muscle memory.** The manager has trained themselves to confirm via the bot. Switching is friction.
- **Daily digest open rate.** A 90%+ open rate means it's the first thing they look at. That habit is durable.
- **A handful of personal "wow" moments.** Senior recognized the owner's mother on her birthday and offered her favorite table. The owner tells that story to every other restaurateur they know. That's NPS-driven retention.

What does **not** create retention:

- Feature breadth. Restaurants don't pay for features; they pay for outcomes.
- Pricing tricks. SMB owners see through them.
- Quarterly reviews. They won't show up. Replace with monthly digest.

---

## SECTION 6 — POSITIONING AND CATEGORY CREATION

### The naming question

You've been calling it Senior internally. **Keep that name.** Here's why:

- It evokes a senior, experienced host — exactly the role you're playing.
- It's a person, not a tool. Vertical SaaS that anthropomorphizes the work tends to win on stickiness ("ask Maya at the desk" beats "log into the dashboard").
- It works in Indian English ("Senior" is widely used in Indian hospitality to mean experienced staff).
- It's short. It's memorable. It doesn't sound like another voice AI startup.

Avoid for the public name:
- "DeepCall" — keep this as the QA product / second SKU.
- "GrowwMaxx" — sounds like a fintech, kill it.
- Anything ending in -ai (.ai is dead in 2026 positioning).

### Ideal positioning

> **Senior is the AI front-of-house for restaurants — the host who never forgets a guest, never misses a call, and never has a bad day.**

For the deck, layer the positioning:

- **Tagline (one line):** "The AI host every restaurant wishes it could hire."
- **Category line (10 words):** "Senior is the guest operating system for Indian hospitality."
- **Investor pitch (60 seconds):** *"India's restaurants live on the phone, but the phone is the worst part of their operation. Calls get missed, callers don't get recognized, frontline staff churn at 60% a year, and there's no system that remembers anything. Senior is the AI front-of-house that picks up every call, recognizes every returning guest by phone, captures their preferences and occasions, and gives the manager a Telegram-native console for the entire reservation operation. Each call adds to a guest profile that didn't exist before. The phone call is the wedge; the guest graph is the product. We're starting with one restaurant in Khan Market, building toward the guest OS for Indian hospitality."*

### Category creation — what to call this

Don't use any of these tired phrases:
- "AI receptionist" (too narrow)
- "Voice AI" (too horizontal)
- "Conversational AI for restaurants" (sleep-inducing)
- "Restaurant chatbot" (kill on sight)

Coin instead, and own:
- **AI Front-of-House** (closest to existing hospitality vocabulary; investors immediately picture the role)
- **Guest OS** (platform-level; for the long-form deck)
- **AI Maître d'** (premium, evocative, works for fine dining and casual)

In the room, lead with **"AI Front-of-House"** — it's the most concrete and the most defensible category line.

### Why this is not "just another voice AI agent"

State this explicitly in the pitch. The competitors investors will mention are Bland, Vapi, Retell, and a couple Indian voice startups. Your differentiation:

- **They sell minutes; we sell guest relationships.** They are infrastructure. We are an application built on top of infrastructure (Zoronal). Different layer of the stack.
- **They are vertical-agnostic; we are vertical-native.** Our prompt, knowledge cards, escalation rules, perks, and digest are F&B-specific. Cross-vertical voice agents will always lose to a vertical specialist that knows what an "occasion" means in a restaurant.
- **They have no proprietary data layer; we have a guest graph.** A voice infra company doesn't keep your guest data — it just powers the call. We *are* the guest data.
- **They sell to engineers; we sell to restaurant owners.** Different motion entirely. Bland's GTM doesn't transfer to a Khan Market owner. Ours does.
- **India-specific patterns.** Hindi-English code-switching, phone-first reservations, Telegram/WhatsApp ops culture, the 60% staff churn problem. These are not horizontal voice problems; they're hospitality-in-India problems.

Put a slide titled **"Why we are not Bland"** in the deck. Investors love that you've thought about it.

---

## SECTION 7 — DEFENSIBILITY AND MOATS

### What compounds (in order of strength)

**1. The guest graph.** Every call → guest row. Every guest row → richer next call. Every richer next call → better hospitality experience → higher repeat rate → more calls. This is the canonical SaaS data flywheel and it starts on day one of every new restaurant. *This is your strongest moat by a wide margin.*

**2. Workflow lock-in via Telegram.** The manager's daily ops are now in your bot. After 60 days, switching costs include retraining muscle memory, losing alert history, and re-onboarding the staff. Workflow moats are weaker than data moats but compound over time.

**3. Restaurant-specific prompt tuning.** Each restaurant's `maya-prompt.md` is customized for their menu, voice, neighborhood, and clientele. Over 30+ days you accumulate a restaurant-specific persona that's not portable. New entrants would need to redo this from scratch.

**4. Failed-intent corpus.** Every call where the agent failed adds a row to your improvement queue. Over time, this becomes a domain-specific test set that nobody else has. Eventually, this is the seed corpus for fine-tuning a hospitality-specific model.

**5. Owner attention share.** The 6 PM digest is the only daily product touch most owners experience. Once that's habit, they don't open competitors. Attention is the rarest asset in SMB SaaS.

**6. Long-term: the cross-restaurant guest passport.** When 50+ restaurants are on Senior, the same +91 number across multiple restaurants becomes a guest network. With consent, this becomes a recommendation graph that Senior can leverage but which no individual restaurant can. *Don't pitch this on May 21 — too speculative — but you should know it's there.*

**7. India-specific operational knowledge.** Festival calendars, regional cuisine patterns, language code-switching, payment patterns, Plivo/Telegram integration depth. Each is a small barrier; together they make a US entrant uncompetitive without a 12-month India localization.

### What is hard to copy

- **The exact daily digest tone** — this requires hand-tuning per restaurant cluster.
- **The Telegram workflow design** — looks simple, took dozens of decisions to get right.
- **The hidden QA scoring rubric** — the specific dimensions and thresholds are your IP, not Anthropic's.
- **The 30-day-old guest profiles** — by definition no new entrant has these on day one.

### What is *easy* to copy and you should not over-claim

- The voice agent itself (Zoronal, Vapi, Bland — all viable). Don't pretend this is your moat.
- The knowledge card schema. Easy to replicate.
- Off-peak nudging logic. Once you describe it in a deck, anyone can do it.

The honest moat story is: **"The voice layer is commoditized; the data layer and workflow layer are not. We're investing in the latter."**

### The data moat slide for the deck

> Within 12 months across the Senior fleet:
>
> - 500K+ inbound calls handled
> - 80K+ structured guest profiles, each with phone-keyed identity, preferences, allergens, occasions, visit cadence
> - 1.2M+ failed-intent rows, becoming the largest hospitality-conversation dataset in India
> - The first cross-restaurant guest graph in Indian F&B
>
> None of this exists today. None of it can be reconstructed by a competitor without three years of restaurant-by-restaurant operations.

(Numbers illustrative — calibrate to your actual ramp.)

---

## SECTION 8 — CTO REALITY CHECK

I'm going to be brutally specific about feasibility against your actual codebase. You have 11 days. Your stack is Zoronal (vendor) + Supabase Edge Functions (Deno/TS) + Telegram bot. Your CLAUDE.md has hard rules I'll respect.

### Shippable in 7-14 days, given current architecture

These map directly to your existing files:

**Schema migration (Idea 1)** — Add to `supabase/migrations/0002_guests.sql`:
- Create `guests` table keyed on `phone_e164`.
- Add `guest_id uuid references guests(id)` to `calls` and `reservations`.
- Add upsert helper in `_shared/guests.ts` (within the 150-line cap; rule #1).
- ~80 lines. **Half a day.**

**Caller recall (Idea 2)** — In `zoronal-webhook` (or a pre-call hook if Zoronal supports), call `_shared/guests.ts` to fetch context, format a context block, and either (a) update the agent's prompt for that call via Zoronal API or (b) inject via a tool call the agent makes on connect. **Prefer the tool-call path** — it keeps the prompt static and lets the agent fetch context just-in-time. ~50 lines. **Half a day.**

**Allergen + occasion + preference extraction (Ideas 3, 10)** — A post-call extractor in `zoronal-webhook` that calls Claude Haiku with the transcript and a strict JSON schema, then upserts to the guest row. Within the 150-line cap, this needs to be a separate `_shared/extractor.ts`. ~100 lines. **1 day.**

**Off-peak nudge (Idea 4)** — Extend `check-capacity` to return `perk_offers` when slot is full and an alternate slot is below 50% occupancy. Add `perk_rules` table, hardcoded per restaurant. ~50 lines. **1 day.**

**Missed-call SMS recovery (Idea 5)** — In `zoronal-webhook`, when `intent != 'reservation_confirmed'` and `duration > 5s`, queue a Telegram card to the manager with a pre-drafted SMS and an inline "Send" button. New handler in `telegram-callback` for "send-sms" callback. ~70 lines. **Half a day.**

**Confirmation + reminder SMS (Idea 11)** — pg_cron jobs hitting an Edge Function that sends Plivo SMS for (a) just-confirmed reservations and (b) reservations starting in ~2 hours. ~60 lines. **Half a day.**

**VIP detection (Idea 6)** — A `guests_view` SQL view that computes tier from `visit_count` and risk flags. Manual override via Telegram inline button (extend `telegram-callback`). ~40 lines. **Half a day.**

**Telegram extended cards (Idea 7)** — Enrich the post-call card with: caller name (if known), tier, occasion flag, allergen flag, perk offered. Add inline buttons: Confirm, Decline, Mark VIP, Send SMS, Block. ~80 lines, all in `telegram-callback`. **1 day.**

**Daily 6 PM digest (Idea 8)** — pg_cron + a `daily-digest` Edge Function that aggregates the day, calls Haiku to write the prose, sends to Telegram. ~100 lines. **1 day.**

**Manager-as-a-service escalation (Idea 14)** — Prompt rule + tool call. Already mostly implementable in the prompt; add a `escalations` table for logging. ~40 lines. **Half a day.**

**Hidden QA scoring (Idea 12)** — Post-call cron that calls Haiku with the transcript and a scoring rubric, persists `calls.qa_scores` jsonb. ~60 lines. **1 day.**

**Block-list + soft upsell + failed-intent log (Ideas 18, 15, 20)** — All small additions to existing tables and prompts. ~80 lines combined. **1 day.**

**Total engineering:** ~9 days of focused work + 2 days for prompt tuning, demo prep, and inevitable edge cases. **Fits in 11 days, with one buffer day.**

### What requires real engineering (and you should not ship for May 21)

- **Real wait-list automation with race-condition-safe holds.** Needs locking semantics, retry logic. Defer.
- **Multi-tenant routing logic.** Your CLAUDE.md says single-tenant V0 — respect it.
- **Custom web dashboard.** Multiple weeks of frontend. Use Retool internally if you need to visualize anything.
- **WhatsApp Business API.** Regulatory + Meta provider integration. 2–3 weeks alone.
- **POS integration.** Each POS is different; needs a partnership motion, not just engineering.
- **Real-time spoken QA.** Different system entirely.
- **Voice cloning / custom voice.** Vendor-locked, infra cost, not strategic for V0.

### What should stay rule-based vs prompt-based vs ML

**Rule-based (fast, deterministic, easy to debug):**
- VIP tier (visit_count thresholds + risk flags)
- Off-peak detection (occupancy threshold per slot)
- No-show risk (no_shows / visits ratio)
- Reminder timing (cron-based)
- Block-list enforcement
- Perk eligibility

**Prompt-based (LLM at runtime):**
- Caller recall greeting (inject context, let Haiku/Sonnet phrase warmly)
- Soft upsell timing (judgment call within the conversation)
- Special occasion detection during the call
- Knowledge card lookups
- Escalation phrasing
- Daily digest prose

**Async LLM (post-call, not in critical path):**
- Allergen extraction
- Occasion extraction
- Call summarization
- QA scoring
- Failed-intent classification

**Should NOT be ML in V0:**
- VIP detection (use rule)
- Yield optimization (use rule)
- No-show prediction (use rule)
- Demand forecasting (use rule, eyeballed by you)

The frame is: **rules where you understand the logic, prompts where the model needs to be diplomatic, async LLM where latency doesn't matter.**

### Things in your CLAUDE.md to respect (I noticed these)

- 150-line cap per Edge Function — this constrains how you split. The new features above mostly land in `_shared/` helpers (extractor, guests, perks, sms). Respect the cap; it'll keep the codebase reviewable.
- All time math in `_shared/time.ts` — extend it, don't sneak `new Date()` into new files.
- All phones via `_shared/phone.ts` — the `guests` table will lean on this heavily.
- Idempotent writes — the `INSERT ... ON CONFLICT DO NOTHING` rule on `calls.id` is good. Apply the same pattern to `guests` (on `phone_e164`).
- Validate inputs with zod — don't let the LLM extractor bypass this. Strict schema.
- Return 200 with descriptive body even on duplicates — keep this for new endpoints.
- Time zone: store IST date + IST time. Don't drift to UTC in new code.

### Things that should NOT be built yet (you'll be tempted)

- A guest-merge UI when phone numbers conflict. Use the simplest rule: latest call wins, log the conflict. Real merging is a v1 problem.
- A fancy editor for `knowledge_cards`. SQL is fine for V0.
- An admin app for the founder. You have Telegram and Supabase Studio. Stop.
- Webhook signature validation for Zoronal beyond what they require. Don't engineer security theater.
- A multi-region deploy. ap-south-1 is fine.

---

## SECTION 9 — FINAL RECOMMENDED V0 STACK

### The pitch in one screen

> **Senior is the AI front-of-house for restaurants.**
>
> It picks up every inbound call with the warmth and recall of your most senior host. Recognizes returning guests by phone number. Captures preferences, allergies, and occasions. Steers demand into off-peak slots with rule-based perks. Pings the manager via Telegram for confirmations, escalations, and a daily 6 PM digest. Sends confirmation and reminder SMS to reduce no-shows. Self-evaluates every call via an async QA scorer that doubles as the foundation of a future product, DeepCall.
>
> Built in 14 days on Zoronal + Supabase + Telegram. Deployed at The Blue Door Cafe, Khan Market. Three Edge Functions. ~600 lines of business logic. The guest graph it builds is proprietary and compounds.

### The V0 product stack — final, opinionated, shippable

**Voice plane (vendor):**
- Zoronal — call routing, ASR, TTS, prompt execution, tool calling. Configured via dashboard, not code.

**Data plane (Supabase, ap-south-1):**
- `restaurants` (existing)
- `knowledge_cards` (existing — extend to support upsells via category field)
- `capacity_caps` (existing)
- `calls` (existing — add `qa_scores jsonb`, `guest_id`, `escalation_reason`)
- `reservations` (existing — add `guest_id`)
- `guests` ★ NEW — phone-keyed, the core primitive
- `perk_rules` ★ NEW — per-restaurant off-peak rules
- `escalations` ★ NEW — log of escalations
- `block_list` ★ NEW — phone numbers to decline
- `failed_intents` ★ NEW — for prompt iteration
- `waitlist` ★ NEW — capture intent only, manual fill

**Backend (Supabase Edge Functions, Deno):**
- `check-capacity/` (existing — extend to return perk_offers)
- `zoronal-webhook/` (existing — add guest upsert, extractor call, missed-call branch)
- `telegram-callback/` (existing — add VIP toggle, Send SMS callback, Block callback)
- `daily-digest/` ★ NEW — pg_cron-triggered, summarizes the day
- `qa-scorer/` ★ NEW — async, scores every completed call
- `reminders/` ★ NEW — pg_cron, sends confirmation + 2hr-before SMS
- `_shared/guests.ts`, `_shared/extractor.ts`, `_shared/perks.ts`, `_shared/sms.ts` — helpers

**Ops plane (Telegram):**
- Per-call card with full context + inline action buttons
- Daily 6 PM digest
- Escalation alerts
- Send-SMS approval cards (for missed-call recovery, occasion outbound)
- Slash commands `/today`, `/vip` (V1 — not V0)

**Outbound (Plivo SMS):**
- Confirmation SMS (auto on confirm)
- Day-of reminder SMS (auto, ~2h before)
- Recovery SMS (manager-tap-approved)
- Occasion outbound (manager-tap-approved)

**Observability:**
- Supabase Logs (per CLAUDE.md rule #10)
- The QA score table itself becomes an observability surface
- Daily digest is the human-readable observability layer

### The 11-day plan to May 21

| Day | Focus |
|---|---|
| **D1 (Mon May 11)** | Schema migration: `guests`, FKs, `perk_rules`, `escalations`, `block_list`, `failed_intents`. Deploy to staging. |
| **D2 (Tue)** | Caller recall: `_shared/guests.ts`, lookup tool in Zoronal, prompt update. Test with 10 simulated calls. |
| **D3 (Wed)** | Extractor: `_shared/extractor.ts`, allergen + occasion + preference extraction. zod schemas. Test on real transcripts. |
| **D4 (Thu)** | Off-peak nudge: extend `check-capacity`, seed `perk_rules`, prompt update, end-to-end test. |
| **D5 (Fri)** | Missed-call SMS recovery + Telegram Send button. Confirmation + reminder SMS via pg_cron. |
| **D6 (Sat)** | VIP detection rule, manual VIP toggle in Telegram, prompt branching. Block-list. |
| **D7 (Sun)** | Daily digest function. Manually run it for 3 days of historical data; tune the prose. |
| **D8 (Mon May 18)** | QA scorer (async). Hand-curate the rubric. Verify on past calls. |
| **D9 (Tue)** | Soft upsell, manager-as-a-service escalation, failed-intent logging. |
| **D10 (Wed)** | END-TO-END dry runs with the founder, an investor, an alpha tester. Tune the prompt based on every failure. Pre-seed investor numbers in `guests` for the demo. |
| **D11 (Thu May 21)** | Demo. Pitch. |

This is **aggressive but achievable** given how much of the foundation already exists in the repo.

### What you should literally do tomorrow morning

1. Open Supabase Studio. Write `0002_guests.sql`. Run it on staging.
2. Update `_shared/types.ts` to include the Guest type.
3. Write `_shared/guests.ts` with `upsertGuestFromCall()` and `getGuestContext(phoneE164)`.
4. Patch `zoronal-webhook` to call `upsertGuestFromCall` on every webhook.
5. Add a `lookup_guest` tool in Zoronal's tool config; make it call a tiny new endpoint that wraps `getGuestContext`.
6. Update `docs/maya-prompt.md` with the recall greeting logic. Run `./scripts/sync-prompt.sh`.
7. Make a test call with your own number. Make a second test call. Confirm the agent greets you back.

If you ship just steps 1–7 by Tuesday EOD, the rest of the doc is execution. The architecturally-hard part is done.

---

## CLOSING — WHAT I'D BE WORRIED ABOUT

A few things I want to flag honestly, since you asked for opinionated:

**1. Single-restaurant demo risk.** Your entire May 21 narrative rests on TBDC working flawlessly. If Zoronal has a hiccup mid-call during the demo, the room cools. Have a **backup pre-recorded demo** of a flawless call, plus the live one. Don't be too proud to use the recording if needed.

**2. The QA / DeepCall narrative dilution.** Your project description has DeepCall and Senior intertwined. **In the May 21 pitch, decouple them firmly.** Senior is the product. DeepCall is the *evidence the platform thinks bigger* — but it shows up on slide 11, not slide 3. If you mix them, you'll confuse what investors are buying.

**3. Manager workflow assumption.** You're assuming the TBDC manager will tap the Telegram buttons reliably. **Pilot this for 5 days before the demo.** If they don't tap, you don't have a workflow story; you have a broken loop. Build the Telegram UX with their real behavior, not your imagined one.

**4. The "guest graph" pitch can sound abstract.** Counter it with the concrete data slide: "Here are 47 anonymized guest profiles built in 14 days." Show actual rows (anonymized). Concreteness beats abstraction.

**5. You will be tempted to add features in the last 48 hours.** Don't. The last 48 hours are for prompt tuning, edge cases, and demo rehearsal. Every feature added on D10 has a 50% chance of breaking the demo on D11.

**6. The investor ask question.** What are you raising? What for? What's the milestone the round buys? Don't walk in without a clean answer. The product story above lands an investor; the ask story closes the round.

---

**End of brainstorm.**

If you want a follow-up, the most useful next pieces would be: (a) a draft of slides 1–10 of the May 21 deck, (b) the actual SQL for `0002_guests.sql` and the helper code, or (c) a tightened version of `docs/maya-prompt.md` that incorporates caller recall, occasion capture, and off-peak nudging.

Tell me which one and I'll write it.

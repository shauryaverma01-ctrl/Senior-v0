# Senior — V0 Strategy Addendum: The Restaurant Brain
*Follow-up to `SENIOR_V0_STRATEGY_BRAINSTORM.md`*
*Triggered by founder feedback: menu and FAQ are underleveraged in the v1 of the doc.*

---

## You're right. Here's the real version.

The first doc treated menu and FAQ as a single feature (IDEA 9, "Knowledge Card Ask Anything") and a passing reference under IDEA 15 (upsells). That undersold the hell out of it. Three reasons I should have caught:

1. **Call mix reality.** In a typical Khan Market / Bandra / Indiranagar fine-dine restaurant, **30–40% of inbound calls are not reservation calls** — they're "do you have parking?", "is the lamb halal?", "what's the chef's special?", "do you have anything for my Jain in-laws?", "what's the dress code?", "are kids allowed?". On weekday afternoons it's higher. If Senior can't nail these, it's a *worse* phone experience than a tired host who at least knows the menu.

2. **The second uncanny moment.** Caller recall is demo moment #1. **Menu/FAQ depth is demo moment #2.** Investors will absolutely test it live — "What's spicy?", "Anything with truffle?", "Can the dal be less rich?". Five clean answers in a row sells the round. Three "let me check on that" responses kills the room.

3. **It's not a feature, it's a pillar.** The way the **Guest Graph** is the structured memory of *who walks in*, the menu+FAQ corpus is the structured memory of *what they walk into*. Both are required. One without the other is half a product. The first doc had only one pillar.

This addendum introduces the second pillar — **the Restaurant Brain** — gives it system-level architecture, lays out seven new feature ideas with the same analytical depth as the original, and reshuffles the V0 plan to make room without breaking the May 21 timeline.

---

## The reframe: two graphs, two moats

The product on May 21 is built on two structured memories that compound separately and reinforce each other:

| Pillar | What it knows | Primary key | Compounds via |
|---|---|---|---|
| **Guest Graph** | Who calls, who comes back, what they like | `phone_e164` | Every call adds a guest row |
| **Restaurant Brain** | What's on the menu today, what's available, what the policies are, what the FAQ corpus is | `restaurant_id` + structured ontology | Every kitchen update + every FAQ gap closed |

The investor slide writes itself:

> Senior is the first system that captures both sides of a restaurant interaction in structured form. We know your guests. We know your menu and operations. The agent that sits between them is just the surface — the data underneath is the product.

Crucially: the Restaurant Brain is **per-restaurant proprietary data**. You can't pull a competitor's restaurant's menu graph off a website. It has to be built dish-by-dish, FAQ-by-FAQ, update-by-update. That's the real defensibility — and it's invisible from the outside, which means competitors will continue to look like "another voice AI" while you quietly accumulate the asset.

---

## Why menu + FAQ are more strategic than the original doc gave them credit for

Seven reasons, in descending order of weight for May 21:

**1. Volume.** As above — they're the majority of weekday calls. A restaurant whose AI nails reservations but fumbles "do you have parking?" hasn't actually fixed their phone. They've moved the failure mode.

**2. Frontline staff failure mode.** The single most consistent complaint from Indian restaurant owners about their staff is *inconsistent answers*. Five servers, five answers to "do you have private dining?". Half wrong. Senior at structured menu+FAQ depth is the **first time the restaurant has guaranteed answer consistency** at scale. Owners get this immediately.

**3. Allergen safety, properly done.** IDEA 10 in the original doc (allergen vault on the *guest*) is necessary but not sufficient. Real allergen safety needs allergens tagged on **dishes** too, so the agent can reason: "I see you've mentioned a peanut allergy in the past — our pad thai contains peanuts and the kung pao does too, but the green curry and lemon rice are safe. The kitchen will also flag your table." That's not lookup; that's reasoning. It requires both pillars.

**4. Upsell economics that aren't theatre.** IDEA 15 in the original (rule-based upsell cards) was hardcoded perks. That's a thin version. With a real menu graph, upsells become contextual: "Since you mentioned an anniversary, our chef has a new tasting menu this week with a wine pairing — would you like me to reserve a paired seat?" Grounded in actual menu state, not a hardcoded string.

**5. FAQ gap detection is a self-improvement engine.** Every call where the agent says "let me have the manager confirm" because the FAQ didn't cover it is a *training signal*. Aggregate it weekly, surface to the owner with one-tap "Add to knowledge", and the system gets monotonically smarter without engineering effort. **That's a slide all by itself**: "Senior gets smarter every week with zero work from the engineering team."

**6. Menu intelligence is a new product surface.** "12 callers asked about Jain food this week — you have 3 Jain dishes, want me to suggest 2 more from your existing ingredients?" The owner has never had this data. Most owners don't even know which menu items are most-asked-about over the phone. This is genuinely net-new operational value.

**7. Per-restaurant moat that's harder to replicate than the guest graph.** A new entrant could theoretically poach guest data with a few months of operations. The Restaurant Brain — menu ontology, FAQ corpus, kitchen workflow integration, weekly update history — is built dish-by-dish through real ops touchpoints. That takes 60–90 days *per restaurant* to replicate at the same depth. It's quiet defensibility, but it's real.

---

## System architecture: how the Restaurant Brain actually works

Three layers, each independently shippable. None of these break the existing CLAUDE.md rules (150-line cap, idempotent writes, zod-validated, Asia/Kolkata correctness).

### Layer 1 — The Menu Graph (structured dish ontology)

New tables in `0003_restaurant_brain.sql`:

```sql
create table dishes (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid references restaurants(id) on delete cascade,
  name            text not null,
  category        text,                    -- starter, main, dessert, beverage, side
  cuisine         text,                    -- north_indian, south_indian, continental, asian
  description     text,
  price_inr       numeric(10,2),
  spice_level     int check (spice_level between 0 and 5),
  prep_minutes    int,
  is_available    boolean default true,    -- the live 86 flag
  is_special      boolean default false,
  special_until   date,
  notes           text,                    -- "creamier today", "limited portions"
  notes_updated_at timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table dish_tags (
  dish_id   uuid references dishes(id) on delete cascade,
  tag       text,                          -- veg, jain, vegan, gf, halal, no_onion_garlic,
                                           -- signature, chef_special, kid_friendly, mild, spicy
  primary key (dish_id, tag)
);

create table dish_allergens (
  dish_id   uuid references dishes(id) on delete cascade,
  allergen  text,                          -- peanut, tree_nut, dairy, gluten,
                                           -- shellfish, egg, soy, sesame, mustard
  primary key (dish_id, allergen)
);

create table dish_pairings (
  dish_id        uuid references dishes(id) on delete cascade,
  paired_with_id uuid references dishes(id) on delete cascade,
  pairing_type   text,                     -- wine, beverage, starter, dessert, side
  notes          text,
  primary key (dish_id, paired_with_id, pairing_type)
);

create index idx_dishes_restaurant_avail on dishes(restaurant_id, is_available);
create index idx_dish_tags_tag on dish_tags(tag);
create index idx_dish_allergens_allergen on dish_allergens(allergen);
```

This is a relational ontology, not a vector store. **No pgvector for V0** — semantic search over 50–80 dishes per restaurant is overkill; SQL filters on tags + allergens + availability are deterministic, debuggable, and faster. Add embeddings in V1 if and only if the menu hits 200+ dishes (rare).

### Layer 2 — The FAQ corpus (structured knowledge cards, evolved)

Your existing `knowledge_cards` table is a `jsonb` blob. Promote it to a categorized FAQ:

```sql
create table faq_items (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid references restaurants(id) on delete cascade,
  category        text,                    -- parking, hours, dress_code, kids, alcohol,
                                           -- payment, private_dining, accessibility,
                                           -- delivery, pets, smoking, valet, ambience
  question_canonical text not null,
  question_aliases   text[],               -- ["do you have parking", "is there parking",
                                           --  "where do I park", "parking available"]
  answer          text not null,
  answer_short    text,                    -- 1-line for voice
  expires_at      date,                    -- for festive hours, seasonal info
  source          text,                    -- 'owner_added', 'manager_added', 'gap_filled'
  active          boolean default true,
  updated_at      timestamptz default now(),
  updated_by      text
);

create table faq_gaps (
  id              uuid primary key default gen_random_uuid(),
  call_id         text references calls(id),
  restaurant_id   uuid references restaurants(id),
  question_text   text,                    -- what the caller asked
  category_guess  text,                    -- LLM-classified guess
  resolved        boolean default false,
  resolution      text,                    -- 'added_to_faq', 'dismissed', 'duplicate'
  faq_item_id     uuid references faq_items(id),
  created_at      timestamptz default now()
);
```

The `faq_gaps` table is the self-improvement engine. Every "let me check on that" the agent says becomes a row. Weekly digest surfaces them.

### Layer 3 — Update channels (the kitchen + manager loop)

How does this data stay fresh? Three update channels, in order of frequency:

**(a) Live updates from the kitchen via Telegram.** The kitchen has its own Telegram chat with the Senior bot. Slash commands:
- `/86 lamb chops` → marks unavailable
- `/back lamb chops` → re-enables
- `/special truffle pasta 1200 4` → adds today's special (name, price, portions)
- `/note dal makhani is creamier today` → adds a runtime note that the agent can mention

**(b) Manager Telegram for FAQ updates.** When `faq_gaps` row gets created, the weekly digest sends a Telegram card with all unresolved gaps. Each has inline buttons: "Add to FAQ" (opens a structured response form), "Dismiss", "Mark as duplicate". One-tap workflow.

**(c) Owner-driven menu ingestion (the magic moment).** Owner sends a PDF or photo of the menu via Telegram. Async job: Claude Sonnet extracts to structured JSON against the schema above. Owner gets back a Telegram message: "I read your menu. 47 dishes detected. Tap to review." Owner approves in batches. This is **the onboarding wow moment** — what would otherwise take a week of data entry happens in 15 minutes.

---

## New feature ideas with deep analysis

Numbered continuing from the original doc (last was IDEA 20). Same 14-point template. Tighter than the originals — the framework is established.

---

### IDEA 21: The Menu Graph (Structured Dish Ontology)

**1. What is it?** The `dishes` + `dish_tags` + `dish_allergens` + `dish_pairings` schema above. Per-restaurant menu, queryable in real time during a call.

**2. Why does it matter?** It's the second pillar. Without it, the agent is a booking-taker; with it, the agent is a maître d'.

**3. User value.** Gets correct, consistent answers about what's available, what's safe, what to try.

**4. Restaurant value.** Guaranteed answer consistency across all phone interactions. First time the menu has been a structured asset, not a PDF.

**5. Investor value.** The "two pillars" slide. "Most voice AI startups have a chat layer; we have a structured restaurant ontology nobody else has." Real moat language.

**6. Implementation complexity:** **3.** Schema is straightforward; the work is the ingestion (IDEA 23) and the query layer (IDEA 22).

**7. Perceived sophistication:** **9.** "We've built the first structured menu graph for Indian fine dining" is a closer line.

**8. Time to ship:** Schema: 0.5 day. With seed data for TBDC: 1 day total.

**9. Reuse:** Existing `knowledge_cards` migration pattern. Existing `_shared/` helpers structure.

**10. Fake MVP.** For TBDC, hand-write the seed SQL with all ~40 dishes. No ingestion needed for the demo. Ingestion (IDEA 23) is the next-restaurant story.

**11. Data moat.** Massive — per-restaurant proprietary structured menu data, evolving weekly via kitchen updates.

**12. Unlocks.** All of IDEAS 22, 24, 26, 27, 28. Eventually: cross-restaurant menu benchmarks, supplier insights, ingredient demand intelligence.

**13. Risks.**
- *Schema rigidity.* Real menus are messier than the schema (combos, modifiers, half-portions). Mitigation: keep `notes` and `description` free-text fields for the long tail; only enforce structure on the high-frequency query dimensions.
- *Stale data.* Owner forgets to update specials. Mitigation: weekly nudge if `special_until < today`, `is_available` not touched in 30 days, etc.

**14. V0?** **Yes — the schema and seed for TBDC. Build it.**

---

### IDEA 22: Real-Time Menu Reasoning at Call Time

**1. What is it?** A `menu_query` tool that the Zoronal agent can invoke during a call, with a structured filter:
```ts
menu_query({
  category?: string,
  tags?: string[],            // ['veg', 'jain']
  exclude_allergens?: string[],
  available_only?: boolean,   // default true
  spice_max?: number,
  pairs_with_dish_id?: string,
  limit?: number              // default 5
})
```
Returns the top matching dishes with name, price, short description, spice level, key tags. The agent then phrases the answer naturally: "We have three lovely Jain options — the dal panchmel at ₹420, the paneer lababdar at ₹520, and the…"

**2. Why does it matter?** This is the demo moment investors will stress-test. It needs to land 9 times out of 10.

**3. User value.** Answers feel grounded, confident, and personalized to dietary needs.

**4. Restaurant value.** Eliminates the "I'll have to ask my manager" failure mode for menu questions.

**5. Investor value.** Slide title: "Senior reasons over your menu in real time." Show three live queries. Done.

**6. Implementation complexity:** **3.** The endpoint is a SQL query with dynamic filters; the prompt rule tells the agent when to use it; the answer phrasing is the LLM doing what it's good at.

**7. Perceived sophistication:** **10.** This is the "this is more than a chatbot" moment.

**8. Time to ship:** 0.5 day for the endpoint, 0.5 day for prompt tuning and edge cases. **1 day total.**

**9. Reuse:** Zoronal tool-call infra; `dishes` schema from IDEA 21.

**10. Fake MVP.** Don't fake. Ship for real. The query is too small to fake.

**11. Data moat.** Query logs reveal which menu dimensions matter — feeds menu intelligence reports (IDEA 26).

**12. Unlocks.** Allergen-safe reasoning (IDEA 27), menu-grounded upsells (IDEA 28), eventually personalized recommendations per guest tier.

**13. Risks.**
- *Hallucination at the edges.* If a caller asks for something not in any dish (e.g., "do you have ostrich?"), the model could invent. Mitigation: strict prompt — "if menu_query returns empty, say 'we don't have that' — never invent."
- *Latency.* Tool call mid-conversation can stall the call. Mitigation: SQL query under 50ms (achievable on the indexed schema); pre-warm the connection.

**14. V0?** **Yes — this is the demo. Cannot ship without it.**

---

### IDEA 23: PDF/Photo Menu Ingestion (the onboarding wow)

**1. What is it?** Owner sends a menu PDF, JPG, or HEIC via Telegram to the bot. Async job: Claude Sonnet 4 extracts structured JSON against the `dishes` schema, with allergens and tags inferred where possible. Owner gets a Telegram card: "I read your menu. 47 dishes detected, with 12 dietary tags inferred. Tap to review in batches of 10." Approval flow, with one-tap edits, populates the `dishes` table.

**2. Why does it matter?** This is **the onboarding moment that turns "30-day implementation" into "30-minute implementation"** for new restaurants. It's also the V1 distribution unlock — without this, every new restaurant takes a person-week of menu data entry.

**3. User value.** None directly — it's an internal/owner workflow.

**4. Restaurant value.** "I sent a PDF and the system understood my menu" is a wow moment owners tell other owners about. Massive WoM driver.

**5. Investor value.** The **scaling story**. "Onboarding a new restaurant takes 30 minutes, not 30 days." This is the slide that shifts the investor from "interesting tech" to "this can scale."

**6. Implementation complexity:** **5.** The extraction call is one Claude API invocation with a strict zod schema. The hard part is the review UX in Telegram (paginated cards, edit flow, batch approve). Honest estimate.

**7. Perceived sophistication:** **10.**

**8. Time to ship:** **2 days for a respectable version**, including review flow. Without review flow (just direct dump): half a day.

**9. Reuse:** Existing Telegram callback infra. Anthropic API.

**10. Fake MVP.** **For May 21, fake it entirely.** Hand-seed TBDC's menu in SQL (IDEA 21). In the demo, *describe* the ingestion flow: "When we onboard a new restaurant, the owner sends us a PDF and we extract their menu in 30 minutes." Show a single screenshot of the Telegram approval card. Don't build the live ingestion until D8+ if there's a buffer.

**11. Data moat.** Extraction quality compounds — every restaurant's menu refines the extractor's prompt and edge-case handling.

**12. Unlocks.** Real GTM scalability. Self-serve onboarding eventually. Multi-format support (Excel, Notion, Google Sheets).

**13. Risks.**
- *Extraction errors.* Menu PDFs are ugly. Mitigation: always require human approval before going live.
- *IP/copyright nuance.* Owner is providing their own menu — fine. But avoid scraping competitor menus.

**14. V0?** **No — fake it for May 21. Ship in the next 14 days post-investor.** This is the highest-impact post-investor item.

---

### IDEA 24: The Kitchen Copilot (Live 86 Loop)

**1. What is it?** The kitchen has its own Telegram chat with Senior. Slash commands the kitchen team uses during service:
- `/86 [dish]` — marks unavailable for the rest of the day, auto-resets at midnight
- `/back [dish]` — re-enables
- `/special [name] [price] [portions]` — adds today's special
- `/note [dish] [note]` — adds a runtime note ("dal is creamier today")
- `/menu` — list current state
- `/help` — show commands

The agent on the next inbound call reflects the live state immediately. "I'm sorry, the lamb chops are sold out tonight — but our chef has a beautiful slow-braised goat shank that's almost in the same flavor profile. Would you like me to reserve a portion?"

**2. Why does it matter?** This is the **first time the kitchen has been part of the FOH digital loop** in any Indian restaurant I'm aware of. It's also genuinely novel — and a product surface that competitors will need a year to copy because they have to re-establish kitchen trust.

**3. User value.** Caller never gets sold a dish that's 86'd in the kitchen 30 seconds ago.

**4. Restaurant value.** No more wasted host time relaying "we're out of X". No more disappointed guests at the table. Real revenue: lifted same-day sales of available items.

**5. Investor value.** "We've turned the kitchen into a Telegram-controlled inventory layer" — the kind of unsexy operational integration that makes hospitality investors trust the team.

**6. Implementation complexity:** **3.** New Telegram bot handler with command parsing; updates `dishes.is_available`. Idempotent.

**7. Perceived sophistication:** **9.**

**8. Time to ship:** 1 day.

**9. Reuse:** All Telegram infra. `dishes` schema.

**10. Fake MVP.** Manager (not kitchen) sends the slash commands for V0. Move to a real kitchen Telegram chat once the workflow is validated. **For May 21 demo: live-demo a `/86 lamb chops` command from the founder's phone, then dial in and have Senior say "the lamb chops are sold out tonight."** That single moment lands.

**11. Data moat.** Per-restaurant 86 patterns over time → demand forecasting input. Eventually: kitchen-side intelligence ("you 86 lamb chops every Monday — order more on Sundays").

**12. Unlocks.** Kitchen as a future product surface. Pre-orders. Inventory-aware menu reasoning. Cross-shift handoff.

**13. Risks.**
- *Kitchen team adoption.* If the kitchen doesn't update, the loop breaks. Mitigation: start with manager-driven; move to kitchen only when the manager has validated the workflow.
- *Stale 86s.* Items left unavailable past closing. Mitigation: midnight cron auto-resets `is_available = true` unless explicitly maintained.

**14. V0?** **Yes — but minimal. Just `/86`, `/back`, `/special`. The full command set is V1.**

---

### IDEA 25: FAQ Gap Detection + Weekly Knowledge Audit

**1. What is it?** Every call where the agent says "let me have the manager confirm" or escalates with `intent='faq'` or hits a "I'm not sure about that" branch creates a `faq_gaps` row with the caller's question text and an LLM-classified category guess. Weekly: a Telegram digest to the owner showing aggregated unresolved gaps, ranked by frequency. Each has inline buttons: "Add to FAQ" (opens a guided response flow), "Dismiss", "Already covered" (links to existing FAQ item).

**2. Why does it matter?** This is the **self-improvement engine**. Without engineering effort, the FAQ corpus grows monotonically with use. After 90 days, a typical TBDC will have a richer FAQ than any human staff member could recite.

**3. User value.** Each week, more callers get instant answers instead of "let me check."

**4. Restaurant value.** First time the restaurant has a structured view of *what its customers are actually confused about*. Drives website updates, signage decisions, menu redesigns.

**5. Investor value.** **The "compounds without us" slide.** "Senior gets smarter every week with zero engineering effort. The system writes its own roadmap from real call data."

**6. Implementation complexity:** **3.** Capture is mostly free (extending the failed-intent log from the original doc). Weekly digest + Telegram callback for one-tap add: half a day.

**7. Perceived sophistication:** **9.**

**8. Time to ship:** 1 day.

**9. Reuse:** The `failed_intents` table from the original doc becomes `faq_gaps`. Same digest infra as IDEA 8.

**10. Fake MVP.** For the May 21 demo, hand-curate a list of 5 FAQ gaps from the past two weeks of test calls. Show the Telegram digest live. Tap "Add to FAQ" on stage. The next demo call the agent answers it. *Chef's kiss.*

**11. Data moat.** Per-restaurant FAQ evolution log. Cross-restaurant: which questions are universal vs. local? Eventually: industry-wide hospitality FAQ benchmarks.

**12. Unlocks.** Auto-categorization → menu intelligence (IDEA 26). FAQ versioning. Multi-language FAQ generation.

**13. Risks.**
- *Owner doesn't tap.* If the owner never reviews the digest, gaps don't close. Mitigation: monthly nudge, "you have 14 unresolved questions — top 3 are about parking."
- *Bad LLM categorization.* Mitigation: category is a guess, not a write — owner overrides on add.

**14. V0?** **Yes — and make it the closing demo moment.**

---

### IDEA 26: Menu Intelligence Reports for Owners

**1. What is it?** A weekly section in the owner digest (extending IDEA 8) that aggregates menu-related call data:
- "12 callers asked about Jain food this week — you have 3 Jain dishes. Most-asked: 'do you have any Jain options?'"
- "Lamb chops were asked about 8 times — your highest-margin item. 6 of those callers booked."
- "5 callers asked about gluten-free options. You currently have 1 dish tagged GF."
- "3 callers asked about pasta — you don't have pasta on the menu. Consider adding?"
- "Truffle pasta (this week's special) was mentioned by 4 callers, 3 booked. Strong signal."

**2. Why does it matter?** Owners have **never had this data**. They guess at what's resonating from server gossip. This turns Senior from a cost center ("the bot that takes calls") into a strategic partner ("the bot that tells me what to put on next month's menu").

**3. User value.** None directly.

**4. Restaurant value.** **Real menu strategy intelligence.** This is what gets owners to upgrade from "Senior is useful" to "Senior is essential."

**5. Investor value.** The **"we are not a feature, we are a strategic layer"** slide. Hospitality VCs understand instantly why this is a different business than voice AI.

**6. Implementation complexity:** **4.** Aggregation queries + Claude prose generation. The hard part is the prompt — making the report read like a smart head of operations wrote it.

**7. Perceived sophistication:** **10.**

**8. Time to ship:** 1 day after IDEAS 21–22 are in.

**9. Reuse:** Daily digest infra; `menu_query` logs; `faq_gaps`.

**10. Fake MVP.** Hand-write the first 2 weeks of reports based on real data. Once the prose voice is right, automate.

**11. Data moat.** This is *the* slide for compounding value. Every week of data makes this report better.

**12. Unlocks.** Menu engineering recommendations. Procurement insights. Pricing intelligence. Competitive benchmarks (cross-restaurant).

**13. Risks.**
- *Insight quality.* A bad report ("12 callers asked about food") is worse than no report. Mitigation: ship only when the prompt reliably produces 3+ specific insights per week.

**14. V0?** **Yes — even if the first version is hand-written, ship one weekly report by D10 to demo.**

---

### IDEA 27: Allergen-Safe Reasoning (cross-feature glue)

**1. What is it?** When the agent detects an allergen in conversation ("I have a peanut allergy" or, from the guest profile, "guest has flagged peanut allergy"), it **proactively filters the menu** in any subsequent menu suggestion — and explicitly mentions safety. "Given the peanut allergy, I'd recommend the green curry, the lemon rice, or the grilled fish — all peanut-free. I'll also flag your table so the kitchen knows."

**2. Why does it matter?** Allergens are the highest-emotional-weight, highest-trust hospitality moment. A restaurant that consistently handles them well **owns a reputation premium**. This is also where AI most outperforms tired servers.

**3. User value.** Massive. Real safety. Real recall.

**4. Restaurant value.** Liability reduction. Repeat visits from allergen-cautious guests (a high-LTV segment).

**5. Investor value.** The slide title: **"Senior is the first system in Indian F&B with end-to-end structured allergen safety."** Backed by: guest allergen vault (IDEA 10) + dish allergen tagging (IDEA 21) + reasoning at call time (IDEA 22) + kitchen flag on confirmation (IDEA 24-adjacent).

**6. Implementation complexity:** **2.** Pure prompt + tool integration. Glue, not new infra.

**7. Perceived sophistication:** **10.** Investors with allergies will viscerally understand it.

**8. Time to ship:** 0.5 day after IDEAS 21–22 are in.

**9. Reuse:** All four features above.

**10. Fake MVP.** Don't fake. The glue is small enough to ship.

**11. Data moat.** Reinforces guest+menu graphs.

**12. Unlocks.** Allergen-aware kitchen tickets. Allergen-aware notifications ("we just added a new dish with peanuts — your saved guests with peanut allergy have been noted").

**13. Risks.**
- *False sense of safety.* If the system gets allergen tagging wrong on a dish, real harm. Mitigation: always confirm with caller during the call ("just to confirm, peanut allergy — I'll have the kitchen verify"); always require kitchen acknowledgment on confirmed bookings with allergens.

**14. V0?** **Yes. Demo this. It's a moment.**

---

### IDEA 28: Menu-Grounded Upsells (replaces IDEA 15 from the original doc)

**1. What is it?** **Replaces** the hardcoded perk-table version of upsells from the original IDEA 15. Now upsells are reasoned over the menu graph in real time. Examples:
- "Since it's an anniversary, our chef's tasting menu this week pairs beautifully with the Australian Shiraz. Would you like me to set that up?"
- "If you're a party of 6, our private dining room is the same price tonight — and includes a complimentary appetizer."
- "Today's chef special, the truffle risotto, just had its first batch portions held back for tonight. Would you like one reserved?"

The trigger logic stays rule-based (party size, day of week, guest tier, occasion); the *content* of the upsell pulls live from the menu graph (specials, pairings, tags).

**2. Why does it matter?** Hardcoded upsells go stale in two weeks. Menu-grounded upsells stay fresh forever because the menu graph stays fresh.

**3. User value.** Discoveries that feel personal, not pushy.

**4. Restaurant value.** Higher cover value. Measurable.

**5. Investor value.** The "real revenue lift" line, now grounded in real menu intelligence not theatre.

**6. Implementation complexity:** **3.**

**7. Perceived sophistication:** **9.**

**8. Time to ship:** 1 day, replacing the original IDEA 15 day.

**9. Reuse:** Menu graph (IDEA 21), `menu_query` (IDEA 22), occasion vault (IDEA 3).

**10. Fake MVP.** For TBDC, hand-curate which dishes are "upsell candidates" (chef specials, high-margin items) via a `dishes.is_upsell_candidate` boolean. Real ML-style upsell scoring is V2.

**11. Data moat.** Upsell conversion data per (dish × context). Eventually drives a real recommendation engine.

**12. Unlocks.** Personalized upsells per guest tier. Time-of-day specific upsells. Cross-sell ("you loved the wine? join our tasting club").

**13. Risks.**
- *Robotic.* Solved by capping at 1 upsell per call and only when context is strong (occasion, large party, VIP, off-peak nudge).

**14. V0?** **Yes — replaces original IDEA 15.**

---

## Reframed positioning — the two-pillar slide

Update the deck:

> **Senior is built on two structured memories.**
>
> The **Guest Graph** is the structured memory of who comes to your restaurant — keyed on phone number, growing every call, holding preferences, allergies, occasions, visit cadence, and tier.
>
> The **Restaurant Brain** is the structured memory of your restaurant itself — your menu as a queryable ontology, your FAQ as a versioned corpus, your kitchen state as a live data stream, your operations as a structured graph.
>
> The voice agent is the surface. The two graphs underneath are the product. They compound separately, reinforce each other, and are proprietary per restaurant. Twelve months in, every Senior restaurant has two structured assets nobody else has.

This is the slide. It's clean, structurally rigorous, and immediately suggests why the company has more depth than a voice AI startup.

---

## Updated V0 plan — what swaps in, what swaps out

The original 11-day plan was tight. Adding the Restaurant Brain means making real cuts. Here's what I'd swap:

### What I'm cutting from the original V0 to make room

| Cut | Why | Where it goes |
|---|---|---|
| **IDEA 12: Hidden async QA scoring** (1d) | Investor narrative is real but achievable through hand-curation for the demo. Score 5-10 calls manually, show as "what we built but haven't fully shipped." | Move to V1 (post-investor) |
| **IDEA 18: Block-list** (0.5d) | Owner trust feature, not strategic for May 21. No investor will ask. | V1 |
| **IDEA 17: No-show risk** (0.5d) | Was already "capture only" — even capture isn't critical for V0 demo. | V1 |
| **IDEA 15: Hardcoded soft upsells** (1d) | Replaced by IDEA 28 (menu-grounded upsells), which is strictly better. | Replaced, not cut |
| **IDEA 7 advanced (slash commands `/today`, `/vip`)** (0.5d) | Inline buttons cover the demo; slash commands are V1 polish. | V1 |
| **IDEA 13 wait-list capture** (0.5d) | Manual fake via Telegram works equally well; capture row only is fine. | Slim to "capture intent only" — ~0.1d |

**Total reclaimed: ~3.5 days.**

### What I'm adding to V0

| Add | Cost | Why |
|---|---|---|
| **IDEA 21: Menu Graph schema + TBDC seed** | 1 day | Foundational. |
| **IDEA 22: `menu_query` tool + prompt rules** | 1 day | The demo moment. Non-negotiable. |
| **IDEA 24: Kitchen Copilot — minimal `/86` `/back` `/special`** | 1 day | The live 86 demo moment. |
| **IDEA 25: FAQ gap capture + first weekly digest** | 0.5 day | Self-improvement engine slide. |
| **IDEA 27: Allergen-safe reasoning glue** | 0.5 day | Highest-emotion demo moment. |
| **IDEA 28: Menu-grounded upsells** | (replaces IDEA 15, no net add) | Upgrades the upsell story. |

**Total added: ~4 days.**

**Net: ~0.5 day over the original budget.** Absorb in the buffer day on D10.

### IDEAS that stay deferred

- **IDEA 23: PDF/photo menu ingestion** — fake it for May 21 (hand-seed TBDC). Build for real in the next 14 days post-investor. This is the highest-leverage post-investor item because it unlocks scaling.
- **IDEA 26: Menu intelligence reports** — hand-curate the first one for May 21. Automate weekly post-investor.

### Revised 11-day plan

| Day | Original focus | Revised focus |
|---|---|---|
| **D1 (Mon May 11)** | Schema: `guests`, FKs, perk_rules, etc. | **Schema: `guests` + `dishes`/`dish_tags`/`dish_allergens`/`dish_pairings` + `faq_items` + `faq_gaps` + perk_rules** |
| **D2** | Caller recall greeting | **Caller recall + `menu_query` tool. Hand-seed TBDC menu (~40 dishes).** |
| **D3** | Extractor: allergens + occasions | Extractor: allergens + occasions + FAQ gap classification |
| **D4** | Off-peak nudge + perks | Off-peak nudge + **menu-grounded upsells** (replaces hardcoded upsells) |
| **D5** | Missed-call SMS + reminders | Same |
| **D6** | VIP detection + manual toggle | VIP detection + **Kitchen Copilot (`/86`, `/back`, `/special`)** |
| **D7** | Telegram extended cards | Telegram extended cards + **allergen-safe reasoning glue** |
| **D8** | Daily digest | Daily digest + **first hand-curated menu intelligence weekly report** |
| **D9** | QA scorer + escalation | **FAQ gap weekly digest** + escalation. (QA scorer: hand-curate 5 calls offline.) |
| **D10** | Buffer + dry runs | Buffer + dry runs + pre-seed investor numbers in `guests` for demo |
| **D11** | Demo | Demo |

This is **the same 11-day shape**, just denser and more menu-pillar-weighted. The demo is materially stronger.

---

## Investor narrative upgrades (new demo moments)

The original doc had two demo headline moments: caller recall, and Telegram-live confirmation during the pitch. The Restaurant Brain unlocks **three more demo headlines**, in priority order:

**Demo Moment 3 — "Ask Senior anything about the menu."**
Hand the investor your phone. Let them call TBDC. Let them ask "what's spicy?", "anything with truffle?", "can you do Jain?", "I'm allergic to peanuts, what's safe?". Senior should land 9 of 10. This is the moment that breaks "voice AI" framing forever.

**Demo Moment 4 — Kitchen `/86` live.**
Founder, on stage: "Watch this." Sends `/86 lamb chops` in Telegram. Investor calls in 30 seconds later, asks for lamb. Agent says: "I'm sorry, the lamb chops are sold out tonight — but let me suggest…" Investor's eyebrows go up. Round closes.

**Demo Moment 5 — FAQ gap → tap → answered next call.**
Investor calls and asks something not in the FAQ ("do you have valet?"). Agent escalates gracefully. Founder shows the Telegram FAQ gap card. Taps "Add to FAQ" with a one-line answer. Investor calls back: agent answers instantly. **The system improved itself live.** This is the closing slide.

**Use only one of moments 3, 4, 5 in the live demo.** All three is over-stuffed and timing-risky. My pick: **Moment 3** (menu reasoning) for the demo, with Moments 4 and 5 *narrated* with screenshots in the deck. The screenshots feel almost as real, with zero live-demo risk.

---

## CTO reality check — is this still 11-day-feasible?

Honest answer: **yes, but barely, and only if you respect the cuts above.**

The risk-weighted realities:

**What's actually new infra in the addendum:** menu schema, `menu_query` endpoint, kitchen Telegram handler, FAQ gap pipeline. All four are within 100 lines each. None violate the 150-line cap. None require new dependencies. None require new infrastructure. **All four are within the existing pattern of "Edge Function + Supabase table + Telegram handler."**

**What's the highest-risk component:** Menu seed data. Hand-entering 40 dishes with tags, allergens, descriptions is **boring grunt work and I'm telling you now you'll resent it on D2**. Strongly recommend:
- Have someone non-engineering at TBDC do the data entry directly into a spreadsheet.
- You write a one-time CSV-to-SQL importer.
- Get the data quality right before D2; everything downstream depends on it.

**What I'd watch out for:**
- *Menu query latency.* If `menu_query` takes >500ms during a live call, the agent stalls and the demo breaks. Index the right columns; pre-warm Supabase connections on the hot path.
- *Allergen tagging accuracy.* If you mis-tag a dish as "peanut-free" when it's not, that's real harm. Manually verify allergen tags, twice, before D11.
- *Live `/86` race conditions.* If the kitchen sets `/86 lamb` while a call is mid-air asking about lamb, what's the source of truth? Lock the read on call start. Don't try to be clever about real-time.

**What should NOT be built:**
- Vector search over the menu. SQL filters are sufficient at 40 dishes.
- A custom menu editor UI. Telegram + SQL are fine.
- A real-time websocket between kitchen and call agent. Polling on each call is fine.
- Multi-language menu translations. V2.

---

## Tomorrow morning, here's what changes

The original tomorrow-morning checklist had 7 items. Add three more:

8. Write `0003_restaurant_brain.sql` — `dishes`, `dish_tags`, `dish_allergens`, `dish_pairings`, `faq_items`, `faq_gaps`. Run on staging.
9. Send TBDC a Google Sheets template for menu entry (40 rows, columns: name, category, price, spice level, dietary tags as comma-separated, allergens as comma-separated, description, signature/special). Get it back by D2.
10. Update `docs/maya-prompt.md` to *plan for* the `menu_query` tool — even before it's wired, set up the prompt structure so D2 is just plugging in the endpoint.

If you ship the existing 7 + these 3 by Tuesday EOD, the menu pillar is on track for D2–D4 implementation, and the May 21 demo gets two new headline moments on top of caller recall.

---

## Closing — the one-line summary

Your instinct was right. The product was thin without menu and FAQ as a structural pillar — the original doc had one graph, not two.

With the Restaurant Brain added, **the May 21 demo gains its second uncanny moment** (live menu reasoning), **the investor narrative gains a real moat slide** (two structured graphs, not one), and **the long-term defensibility doubles** (per-restaurant menu data is harder to replicate than guest data, and the two reinforce each other).

The cost is ~4 days of engineering, fully absorbed by cutting the original V0's QA scorer (hand-curate instead), block-list (V1), no-show risk (V1), and slash commands (V1). The 11-day timeline holds.

Build it.

---

**End of addendum.**

Open questions I'd want to resolve before D1:
- *Does TBDC have a digital menu in any structured form, or do we need to extract from a PDF?* (Affects D2 timeline.)
- *Will the kitchen actually adopt Telegram for `/86`, or do we keep it manager-driven for V0?* (Affects whether we demo Moment 4 live or with a screenshot.)
- *Is there a known investor in the room with a peanut allergy?* If yes, prioritize Moment 3 with a peanut-allergy demo — visceral and unforgettable.

Want me to write the actual `0003_restaurant_brain.sql` migration + the `menu_query` Edge Function, or sketch the updated `maya-prompt.md` that integrates the menu reasoning + allergen-safe + FAQ-gap-aware behavior?

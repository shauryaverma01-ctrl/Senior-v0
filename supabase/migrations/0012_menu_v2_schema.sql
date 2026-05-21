-- Senior v0.7 — menu graph v2: enriched schema + clean slate.
-- Adds two columns the original menu graph didn't have but the source data does:
--   * subcategory (e.g. "Avocado Toast Duos" under category "GreenHouse - …")
--   * image_url (for richer Telegram cards later)
-- Then truncates the existing menu tables — the current 149 dishes were a thin/incomplete
-- seed (only veg/non_veg tags, no allergens, no spice). Phase 2 seed reloads from the
-- owner-provided xlsx + LLM-classified tags.

alter table dishes add column if not exists subcategory text;
alter table dishes add column if not exists image_url   text;

create index if not exists idx_dishes_subcategory on dishes(subcategory);

-- Clean slate. Cascade clears dish_tags, dish_allergens, dish_pairings.
truncate dishes cascade;

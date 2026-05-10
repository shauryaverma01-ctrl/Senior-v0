-- Senior v0 — Restaurant Brain layer 1: menu graph.
-- Tables: dishes + dish_tags + dish_allergens + dish_pairings.
-- Plus the query_menu() Postgres function called by menu-query/ Edge Function.
-- See SENIOR_V0_STRATEGY_ADDENDUM_RESTAURANT_BRAIN.md (IDEAS 21-22) and
-- SENIOR_V0_STRATEGY.html section 21, flow F3 for the contract.
-- Idempotent: safe to re-paste.

create table if not exists dishes (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid references restaurants(id) on delete cascade,
  name              text not null,
  category          text,                                   -- starter, main, dessert, beverage, side
  cuisine           text,                                   -- north_indian, south_indian, continental, asian
  description       text,
  price_inr         numeric(10,2),
  spice_level       int check (spice_level between 0 and 5),
  prep_minutes      int,
  is_available      boolean default true,                   -- the live 86 flag
  is_special        boolean default false,
  special_until     date,
  notes             text,                                   -- "creamier today", "limited portions"
  notes_updated_at  timestamptz,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table if not exists dish_tags (
  dish_id  uuid references dishes(id) on delete cascade,
  tag      text,                                            -- veg, jain, vegan, gf, halal, signature, mild, spicy
  primary key (dish_id, tag)
);

create table if not exists dish_allergens (
  dish_id  uuid references dishes(id) on delete cascade,
  allergen text,                                            -- peanut, tree_nut, dairy, gluten, shellfish, egg, soy, sesame, mustard
  primary key (dish_id, allergen)
);

create table if not exists dish_pairings (
  dish_id        uuid references dishes(id) on delete cascade,
  paired_with_id uuid references dishes(id) on delete cascade,
  pairing_type   text,                                      -- wine, beverage, starter, dessert, side
  notes          text,
  primary key (dish_id, paired_with_id, pairing_type)
);

create index if not exists idx_dishes_restaurant_avail on dishes(restaurant_id, is_available);
create index if not exists idx_dish_tags_tag           on dish_tags(tag);
create index if not exists idx_dish_allergens_allergen on dish_allergens(allergen);

-- Auto-bump updated_at on dishes mutation
create or replace function set_dishes_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_dishes_updated_at on dishes;
create trigger trg_dishes_updated_at
  before update on dishes
  for each row execute function set_dishes_updated_at();

-- Single-tenant V0; matches the rest of the schema
alter table dishes          disable row level security;
alter table dish_tags       disable row level security;
alter table dish_allergens  disable row level security;
alter table dish_pairings   disable row level security;

-- ── Query function called by menu-query/ Edge Function ─────────────────
-- Filters dishes by category/tags/allergens/spice/availability. Aggregates
-- the dish's tag array. Specials sort first.
create or replace function query_menu(
  p_restaurant_id      uuid,
  p_tags               text[]  default null,
  p_exclude_allergens  text[]  default null,
  p_category           text    default null,
  p_spice_max          int     default null,
  p_available_only     boolean default true,
  p_limit              int     default 5
) returns table (
  id           uuid,
  name         text,
  category     text,
  description  text,
  price_inr    numeric,
  spice_level  int,
  is_special   boolean,
  notes        text,
  tags         text[]
) language sql stable as $$
  select d.id, d.name, d.category, d.description, d.price_inr, d.spice_level,
         d.is_special, d.notes,
         coalesce(array_agg(distinct t.tag) filter (where t.tag is not null), array[]::text[]) as tags
  from dishes d
  left join dish_tags t on t.dish_id = d.id
  where d.restaurant_id = p_restaurant_id
    and (p_available_only = false or d.is_available = true)
    and (p_category is null or d.category = p_category)
    and (p_spice_max is null or coalesce(d.spice_level, 0) <= p_spice_max)
    and (p_tags is null or exists (
          select 1 from dish_tags dt where dt.dish_id = d.id and dt.tag = any(p_tags)))
    and (p_exclude_allergens is null or not exists (
          select 1 from dish_allergens da where da.dish_id = d.id and da.allergen = any(p_exclude_allergens)))
  group by d.id, d.is_special, d.name
  order by d.is_special desc, d.name asc
  limit p_limit;
$$;

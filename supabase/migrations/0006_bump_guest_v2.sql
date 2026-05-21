-- Senior v0.3 — enrich guest profiles from every call.
-- Extends bump_guest to accept allergens, preferences, occasions.
-- Allergens are union-merged (never removed once known).
-- Preferences and occasions are shallow-merged (latest call wins per key).

create or replace function bump_guest(
  p_restaurant_id uuid,
  p_phone_e164    text,
  p_name          text,
  p_summary       text,
  p_allergens     text[]  default null,
  p_preferences   jsonb   default null,
  p_occasions     jsonb   default null
) returns uuid
language sql as $$
  insert into guests (
    restaurant_id, phone_e164, name,
    last_seen_at, last_visit_summary, visit_count,
    allergens, preferences, occasions
  )
  values (
    p_restaurant_id, p_phone_e164, p_name,
    now(), p_summary, 1,
    coalesce(p_allergens, '{}'),
    coalesce(p_preferences, '{}'),
    coalesce(p_occasions, '{}')
  )
  on conflict (restaurant_id, phone_e164) do update set
    visit_count        = guests.visit_count + 1,
    last_seen_at       = now(),
    last_visit_summary = coalesce(excluded.last_visit_summary, guests.last_visit_summary),
    name               = coalesce(excluded.name, guests.name),
    -- Union allergens: accumulate across visits, never remove a known allergen.
    allergens          = (
      select coalesce(array_agg(distinct a), '{}')
      from unnest(array_cat(
        coalesce(guests.allergens, '{}'),
        coalesce(p_allergens, '{}')
      )) as a
      where a is not null and a <> ''
    ),
    -- Shallow-merge: latest call's keys overwrite, old keys are preserved.
    preferences        = guests.preferences || coalesce(p_preferences, '{}'),
    occasions          = guests.occasions   || coalesce(p_occasions,   '{}')
  returning id;
$$;

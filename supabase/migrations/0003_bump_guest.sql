-- Senior v0.2 — atomic UPSERT used by zoronal-webhook end-of-call writes.
-- Replaces the read-then-update pattern in _shared/guests.ts that lost
-- visit_count increments under concurrent webhook delivery.
-- See SENIOR_V0_STRATEGY.html section 21, flow F1 step 11.

create or replace function bump_guest(
  p_restaurant_id uuid,
  p_phone_e164    text,
  p_name          text,
  p_summary       text
) returns uuid
language sql as $$
  insert into guests (restaurant_id, phone_e164, name, last_seen_at, last_visit_summary, visit_count)
  values (p_restaurant_id, p_phone_e164, p_name, now(), p_summary, 1)
  on conflict (restaurant_id, phone_e164) do update set
    visit_count        = guests.visit_count + 1,
    last_seen_at       = now(),
    last_visit_summary = coalesce(excluded.last_visit_summary, guests.last_visit_summary),
    name               = coalesce(excluded.name, guests.name)
  returning id;
$$;

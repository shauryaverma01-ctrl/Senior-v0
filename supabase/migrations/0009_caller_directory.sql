-- Senior v0.6 — caller directory for multi-agent inbound routing.
-- Adds vendor_leads and staff_leads tables, mirroring guests but for B2B + hiring contacts.
-- Powers the lookup-caller pre-call hook on the Router agent: one phone lookup checks
-- all three tables, returns the most recently seen match.
--
-- Schema parallels guests (0002_guests.sql):
--   - unique on (restaurant_id, phone_e164)
--   - call_count + first_seen_at + last_seen_at for recency-based deduplication
--   - last_seen_at is what lookup-caller sorts by when a phone matches multiple tables
--
-- Note: an earlier (different) schema may exist from a partial attempt — drop first
-- so the create blocks succeed. Both tables are 0-row at this point.

drop table if exists vendor_leads cascade;
drop table if exists staff_leads cascade;

create table if not exists vendor_leads (
  id uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  phone_e164     text not null,
  name           text,
  company        text,
  last_offering  text,
  last_summary   text,
  call_count     integer not null default 1,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (restaurant_id, phone_e164)
);
create index if not exists vendor_leads_phone_idx on vendor_leads (phone_e164);

create table if not exists staff_leads (
  id uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references restaurants(id) on delete cascade,
  phone_e164       text not null,
  name             text,
  role_interest    text,
  experience_note  text,
  last_summary     text,
  call_count       integer not null default 1,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (restaurant_id, phone_e164)
);
create index if not exists staff_leads_phone_idx on staff_leads (phone_e164);

-- bump_vendor — atomic upsert, mirrors bump_guest pattern.
-- Latest call's offering/company/summary wins. call_count increments.
create or replace function bump_vendor(
  p_restaurant_id uuid,
  p_phone_e164    text,
  p_name          text,
  p_company       text,
  p_offering      text,
  p_summary       text
) returns uuid
language sql as $$
  insert into vendor_leads (
    restaurant_id, phone_e164, name, company, last_offering, last_summary,
    call_count, last_seen_at
  )
  values (
    p_restaurant_id, p_phone_e164, p_name, p_company, p_offering, p_summary,
    1, now()
  )
  on conflict (restaurant_id, phone_e164) do update set
    call_count    = vendor_leads.call_count + 1,
    last_seen_at  = now(),
    name          = coalesce(excluded.name,          vendor_leads.name),
    company       = coalesce(excluded.company,       vendor_leads.company),
    last_offering = coalesce(excluded.last_offering, vendor_leads.last_offering),
    last_summary  = coalesce(excluded.last_summary,  vendor_leads.last_summary),
    updated_at    = now()
  returning id;
$$;

-- bump_staff — atomic upsert for staff applicants.
create or replace function bump_staff(
  p_restaurant_id uuid,
  p_phone_e164    text,
  p_name          text,
  p_role          text,
  p_experience    text,
  p_summary       text
) returns uuid
language sql as $$
  insert into staff_leads (
    restaurant_id, phone_e164, name, role_interest, experience_note, last_summary,
    call_count, last_seen_at
  )
  values (
    p_restaurant_id, p_phone_e164, p_name, p_role, p_experience, p_summary,
    1, now()
  )
  on conflict (restaurant_id, phone_e164) do update set
    call_count       = staff_leads.call_count + 1,
    last_seen_at     = now(),
    name             = coalesce(excluded.name,            staff_leads.name),
    role_interest    = coalesce(excluded.role_interest,   staff_leads.role_interest),
    experience_note  = coalesce(excluded.experience_note, staff_leads.experience_note),
    last_summary     = coalesce(excluded.last_summary,    staff_leads.last_summary),
    updated_at       = now()
  returning id;
$$;

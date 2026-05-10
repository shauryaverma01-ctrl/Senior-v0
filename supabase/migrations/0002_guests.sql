-- Senior v0.1 — guests table + foreign keys to calls/reservations.
-- Phone-keyed guest profile. The single primitive every other feature hangs on.
-- Run in Supabase SQL Editor AFTER 0001_init.sql.
-- See SENIOR_V0_STRATEGY.html section 21, flow F1 for the contract.

create table if not exists guests (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid references restaurants(id) on delete cascade,
  phone_e164          text not null,
  name                text,
  first_seen_at       timestamptz default now(),
  last_seen_at        timestamptz default now(),
  visit_count         int default 1,
  tier                text default 'new',                   -- new | regular | vip
  preferences         jsonb default '{}'::jsonb,
  allergens           text[] default '{}',
  occasions           jsonb default '{}'::jsonb,            -- { birthday: 'MM-DD', anniversary: 'MM-DD' }
  notes               text,
  last_visit_summary  text,
  risk_flags          text[] default '{}',
  consent_at          timestamptz,                          -- DPDP consent on first call
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  unique (restaurant_id, phone_e164)
);

-- FK columns on existing tables (idempotent — safe to re-run)
alter table calls
  add column if not exists guest_id uuid references guests(id);

alter table reservations
  add column if not exists guest_id uuid references guests(id);

-- Indexes for fast lookup at call start (latency budget <100ms per F1 step 4)
create index if not exists idx_guests_phone        on guests(phone_e164);
create index if not exists idx_guests_restaurant   on guests(restaurant_id, phone_e164);
create index if not exists idx_guests_tier         on guests(restaurant_id, tier);
create index if not exists idx_calls_guest         on calls(guest_id);
create index if not exists idx_reservations_guest  on reservations(guest_id);

-- Auto-bump updated_at on every row mutation
create or replace function set_guests_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_guests_updated_at on guests;
create trigger trg_guests_updated_at
  before update on guests
  for each row execute function set_guests_updated_at();

-- v0 is single-tenant; disable RLS for simplicity (matches 0001_init.sql)
alter table guests disable row level security;

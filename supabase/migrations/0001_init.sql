-- Senior v0 — initial schema for Blue Door Cafe internal test
-- Run this entire file in Supabase SQL Editor (one shot).

ALTER DATABASE postgres SET timezone TO 'Asia/Kolkata';

-- restaurants ─────────────────────────────────────────────
create table if not exists restaurants (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  short_name        text,
  zoronal_agent_id  text,
  plivo_did         text,
  zoronal_did       text,
  telegram_chat_id  text,
  created_at        timestamptz default now()
);

-- knowledge_cards ────────────────────────────────────────
create table if not exists knowledge_cards (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  json_content  jsonb not null,
  version       int default 1,
  updated_at    timestamptz default now(),
  updated_by    text
);

-- capacity_caps ──────────────────────────────────────────
create table if not exists capacity_caps (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade,
  day_of_week   text,
  slot_start    time,
  slot_end      time,
  max_bookings  int
);

-- calls ──────────────────────────────────────────────────
create table if not exists calls (
  id                text primary key,
  restaurant_id     uuid references restaurants(id),
  caller_number     text,
  started_at        timestamptz,
  ended_at          timestamptz,
  duration_seconds  int,
  intent            text,
  status            text,
  summary           text,
  transcript_url    text,
  audio_url         text,
  raw_payload       jsonb,
  created_at        timestamptz default now()
);

-- reservations ───────────────────────────────────────────
create table if not exists reservations (
  id                  uuid primary key default gen_random_uuid(),
  call_id             text references calls(id),
  restaurant_id       uuid references restaurants(id),
  customer_name       text,
  customer_phone      text,
  party_size          int,
  booking_date        date,
  booking_time        time,
  special_requests    text,
  direct_discount     boolean default false,
  status              text default 'pending',
  confirmed_by        text,
  confirmed_at        timestamptz,
  sla_deadline        timestamptz,
  telegram_message_id text,
  created_at          timestamptz default now()
);

-- indexes ────────────────────────────────────────────────
create index if not exists idx_reservations_status  on reservations(status);
create index if not exists idx_reservations_booking on reservations(booking_date, booking_time);
create index if not exists idx_calls_started        on calls(started_at desc);

-- v0 is single-tenant; disable RLS for simplicity
alter table restaurants     disable row level security;
alter table knowledge_cards disable row level security;
alter table capacity_caps   disable row level security;
alter table calls           disable row level security;
alter table reservations    disable row level security;

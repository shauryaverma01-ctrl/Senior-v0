-- Senior v0 — seed data for Blue Door Cafe.
-- Run AFTER 0001_init.sql in the Supabase SQL Editor.
-- The Telegram chat_id below is Raman's personal chat (also acts as manager for v0 testing).

insert into restaurants (id, name, short_name, telegram_chat_id) values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'The Blue Door Cafe',
  'TBDC',
  '8537943883'
)
on conflict (id) do update
  set telegram_chat_id = excluded.telegram_chat_id;

insert into knowledge_cards (restaurant_id, json_content, updated_by) values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  '{
    "name": "The Blue Door Cafe",
    "address": "66 Khan Market, middle lane, opposite Faqir Chand bookstore, New Delhi 110003",
    "hours": { "every_day": "07:00-23:00", "note": "All-day breakfast available" },
    "reservations": {
      "weekday": "Anytime during open hours",
      "saturday_before_1pm": "Walk-in only — no advance reservations",
      "sunday_before_1pm": "Walk-in only — no advance reservations",
      "weekend_after_1pm": "Reservations accepted",
      "max_party_phone": 15,
      "groups_above_15": "Escalate to manager"
    },
    "pricing": {
      "average_for_two": "₹2,000–₹2,500",
      "direct_line_discount": "15% off weekday dinner (7–11 PM) — not on District, EazyDiner, or Zomato"
    },
    "dietary": {
      "vegan": ["tofu chimichurri health bowls", "tofu chimichurri plates", "field trays", "salads"],
      "jain": "Customisable with kitchen",
      "gluten_free": "Salads, bowls, protein plates — full list on Zomato",
      "halal": false
    },
    "cuisine": {
      "style": "European classics + American favourites",
      "highlights": ["Philly cheesesteak", "Gourmet burgers", "Healthy salads", "Bowls"],
      "usp": "Generous portions"
    },
    "alcohol": { "served": true, "range": "Single malts, wine, beer and more", "byob": false },
    "seating": { "outdoor": false, "smoking_area": "Second floor" },
    "kids": { "welcome": true, "highchairs": true, "games": true, "kids_menu": false },
    "payment": ["UPI", "Cash", "Card"],
    "delivery": ["Zomato", "Swiggy"],
    "dress_code": "None — casual",
    "weekend_walk_in_wait": "15–20 minutes till 12 PM on Saturdays and Sundays",
    "special_occasions": {
      "decoration": false,
      "food_requests": "Align with kitchen — manager will confirm"
    },
    "private_dining": "Escalate to manager",
    "parking": "Khan Market shared parking — escalate specific questions to manager"
  }'::jsonb,
  'founder-bootstrap'
)
on conflict do nothing;

insert into capacity_caps (restaurant_id, day_of_week, slot_start, slot_end, max_bookings) values
('00000000-0000-0000-0000-000000000001'::uuid, 'friday',   '19:00', '21:00', 8),
('00000000-0000-0000-0000-000000000001'::uuid, 'saturday', '19:00', '21:00', 8),
('00000000-0000-0000-0000-000000000001'::uuid, 'default',  '00:00', '23:59', 12)
on conflict do nothing;

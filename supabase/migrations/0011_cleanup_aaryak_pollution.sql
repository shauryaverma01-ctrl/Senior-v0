-- Senior v0.6.2 — targeted cleanup of two specific pollutions:
--   1. Delete the typo'd duplicate aaryak guest at +919917575110
--      (real aaryak is +91 9971 575110 — that "17" is a misdial).
--   2. On the real aaryak record (+919971575110):
--        - Clear last_visit_summary (currently "Bot Only / User No Response" from
--          phantom test calls; the underlying profile data is still valid).
--        - Remove preferences.dislikes=['teacher'] — LLM hallucination from a
--          misheard Hindi word.
--
-- Leaves visit_count, allergens, other preferences, occasions, and call history
-- untouched per user instruction.

-- 1. Null FK on calls referencing the typo guest, then delete the guest row.
update calls
set guest_id = null
where guest_id in (
  select id from guests where phone_e164 = '+919917575110'
);

delete from guests where phone_e164 = '+919917575110';

-- 2. Clean the real aaryak record.
update guests
set
  last_visit_summary = null,
  preferences = preferences - 'dislikes'
where phone_e164 = '+919971575110';

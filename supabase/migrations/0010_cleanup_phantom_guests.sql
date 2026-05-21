-- Senior v0.6.1 — clean up phantom guest records from failed inbound calls.
-- During Ringg multi-agent inbound debugging, ~13 phantom guest rows accumulated
-- where the call never connected (Plivo dropped before any audio). The webhook
-- still fired and bumped the guest record with last_visit_summary='Bot Only / User No Response'.
--
-- Filter: only delete rows where visit_count <= 2. Long-standing guests (e.g. aaryak
-- at visit_count=13) keep their accumulated profile data even though their LAST
-- visit was a phantom — that's accurate, the last call didn't happen.
--
-- Going forward, the webhook is guarded against duration_seconds=0 so phantom rows
-- shouldn't accumulate again.

-- Two-step: null out the FK on calls first (those phantom calls have no useful
-- guest association anyway), then delete the guests.
update calls
set guest_id = null
where guest_id in (
  select id from guests
  where last_visit_summary = 'Bot Only / User No Response'
    and visit_count <= 2
);

delete from guests
where last_visit_summary = 'Bot Only / User No Response'
  and visit_count <= 2;

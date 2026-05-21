-- Senior v0.4 — enrich calls table with Ringg platform + client analysis fields.
-- key_points / action_items: from platform_analysis (manager-facing context).
-- call_cost: credit cost per call (for billing visibility).
-- classification: Ringg's own intent label (e.g. reservation_confirmed).

alter table calls
  add column if not exists key_points    text[],
  add column if not exists action_items  text[],
  add column if not exists call_cost     integer,
  add column if not exists classification text;

-- Senior v0.5 — add guest_brief, kitchen_note, language to calls.
-- guest_brief: 1-2 sentence human brief from client_analysis LLM.
-- kitchen_note: one-line staff instruction from client_analysis LLM.
-- language: primary language of the caller (english/hinglish/hindi).

alter table calls
  add column if not exists guest_brief  text,
  add column if not exists kitchen_note text,
  add column if not exists language     text;

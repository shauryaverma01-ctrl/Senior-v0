-- Senior v0.2 — vendor-neutral column names on restaurants table.
-- Per CLAUDE.md rule 11 (Voice Vendor Abstraction): vendor names must not appear
-- in field names outside zoronal-webhook/ and parse-payload.ts.
-- Renames: zoronal_agent_id → voice_agent_id, zoronal_did → voice_did.
-- plivo_did stays — Plivo is the telephony vendor, separate abstraction layer.
-- Idempotent: safe to re-paste.

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'restaurants' and column_name = 'zoronal_agent_id') then
    alter table restaurants rename column zoronal_agent_id to voice_agent_id;
  end if;

  if exists (select 1 from information_schema.columns
             where table_name = 'restaurants' and column_name = 'zoronal_did') then
    alter table restaurants rename column zoronal_did to voice_did;
  end if;
end $$;

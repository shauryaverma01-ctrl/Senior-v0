// Staff lead helpers — mirrors guests.ts pattern.
// upsertStaffFromCall: end-of-call write, called from ringg-webhook on intent="staff_lead".
// Idempotent on (restaurant_id, phone_e164) via bump_staff RPC.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { normalizePhone } from "./phone.ts";
import type { InternalCallEvent } from "./types.ts";

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function upsertStaffFromCall(
  ev: InternalCallEvent,
): Promise<string | null> {
  const phone = normalizePhone(ev.staff_callback_number ?? ev.caller_number);
  if (!phone) {
    console.log({ event: "staff_upsert_skipped_no_phone", call_id: ev.call_id });
    return null;
  }
  const { data, error } = await sb().rpc("bump_staff", {
    p_restaurant_id: ev.restaurant_id,
    p_phone_e164: phone,
    p_name: ev.customer_name ?? null,
    p_role: ev.staff_role_interest ?? null,
    p_experience: ev.staff_experience_note ?? null,
    p_summary: ev.summary ?? null,
  });
  if (error) {
    console.error("bump_staff_err", error);
    return null;
  }
  console.log({ event: "staff_bumped", id: data, phone });
  return (data as string) ?? null;
}

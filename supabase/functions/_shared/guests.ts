// Phone-keyed guest profile helpers.
// - getGuestContext: pre-call hook lookup (sync, target <100ms). See F1 step 4.
// - upsertGuestFromCall: end-of-call write (post-webhook). See F1 step 11 / F2 step 5.
// Idempotent on (restaurant_id, phone_e164). All time math via _shared/time.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { normalizePhone } from "./phone.ts";
import type { Guest, GuestContext, InternalCallEvent } from "./types.ts";

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function getGuestContext(
  phoneRaw: string,
  restaurantId: string,
): Promise<GuestContext> {
  const phone = normalizePhone(phoneRaw);
  if (!phone) {
    console.log({ event: "guest_lookup_bad_phone", phoneRaw });
    return { known: false };
  }
  const { data, error } = await sb()
    .from("guests")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("phone_e164", phone)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("guest_lookup_err", error);
    return { known: false };
  }
  if (!data) {
    console.log({ event: "guest_lookup_miss", phone, restaurantId });
    return { known: false };
  }
  const g = data as Guest;
  return {
    known: true,
    guest_id: g.id,
    context: formatContextLine(g),
    name: g.name ?? undefined,
    tier: g.tier,
    visit_count: g.visit_count,
    allergens: g.allergens ?? [],
    occasions: (g.occasions ?? {}) as Record<string, string>,
    last_visit_summary: g.last_visit_summary,
  };
}

// Builds the 2-3 sentence context block injected into the agent's prompt.
// Tone: terse, factual. Let the model phrase the warmth.
function formatContextLine(g: Guest): string {
  const parts: string[] = [];
  parts.push(`Returning guest. ${g.name ?? "(name on file unknown)"}.`);
  if (g.last_visit_summary) parts.push(`Last visit: ${g.last_visit_summary}.`);
  if (g.allergens && g.allergens.length > 0) {
    parts.push(`Allergens: ${g.allergens.join(", ")}.`);
  }
  if (g.tier === "vip") parts.push("VIP — greet warmly, offer the best available table.");
  return parts.join(" ");
}

export async function upsertGuestFromCall(
  ev: InternalCallEvent,
): Promise<string | null> {
  const phone = normalizePhone(ev.customer_phone ?? ev.caller_number);
  if (!phone) {
    console.log({ event: "guest_upsert_skipped_no_phone", call_id: ev.call_id });
    return null;
  }
  const { data, error } = await sb().rpc("bump_guest", {
    p_restaurant_id: ev.restaurant_id,
    p_phone_e164: phone,
    p_name: ev.customer_name ?? null,
    p_summary: ev.summary ?? null,
  });
  if (error) {
    console.error("bump_guest_err", error);
    return null;
  }
  console.log({ event: "guest_bumped", id: data, phone });
  return (data as string) ?? null;
}

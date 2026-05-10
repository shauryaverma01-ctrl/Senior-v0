// Phone-keyed guest profile helpers.
// - getGuestContext: pre-call hook lookup (sync, target <100ms). See F1 step 4.
// - upsertGuestFromCall: end-of-call write (post-webhook). See F1 step 11 / F2 step 5.
// Idempotent on (restaurant_id, phone_e164). All time math via _shared/time.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { normalizePhone } from "./phone.ts";
import { nowISO } from "./time.ts";
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
  const client = sb();

  const { data: existing } = await client
    .from("guests")
    .select("id, visit_count")
    .eq("restaurant_id", ev.restaurant_id)
    .eq("phone_e164", phone)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { data: updated, error } = await client
      .from("guests")
      .update({
        last_seen_at: nowISO(),
        visit_count: (existing.visit_count ?? 0) + 1,
        last_visit_summary: ev.summary ?? undefined,
        name: ev.customer_name ?? undefined,
      })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) {
      console.error("guest_update_err", error);
      return existing.id as string;
    }
    console.log({ event: "guest_updated", id: updated.id, phone });
    return updated.id as string;
  }

  const { data: inserted, error } = await client
    .from("guests")
    .insert({
      restaurant_id: ev.restaurant_id,
      phone_e164: phone,
      name: ev.customer_name ?? null,
      first_seen_at: nowISO(),
      last_seen_at: nowISO(),
      visit_count: 1,
      last_visit_summary: ev.summary ?? null,
    })
    .select("id")
    .single();
  if (error) {
    // Race: another webhook inserted between our SELECT and INSERT. Re-fetch.
    console.warn("guest_insert_race", error);
    const { data: refetch } = await client
      .from("guests")
      .select("id")
      .eq("restaurant_id", ev.restaurant_id)
      .eq("phone_e164", phone)
      .limit(1)
      .maybeSingle();
    return (refetch?.id as string) ?? null;
  }
  console.log({ event: "guest_inserted", id: inserted.id, phone });
  return inserted.id as string;
}

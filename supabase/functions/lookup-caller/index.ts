// lookup-caller — Ringg pre-call hook for the multi-agent Router.
// POST { phone_e164, restaurant_id } → 200 { known, type, name, context, last_interaction }.
// Latency budget: <250ms (Ringg falls through on timeout).
//
// Looks up the caller's phone across THREE tables in parallel:
//   - guests       (returning reservation customers)
//   - vendor_leads (returning B2B contacts)
//   - staff_leads  (returning job applicants)
//
// If the same phone matches multiple tables (e.g. a customer who's also a vendor),
// returns the row with the most recent last_seen_at — the Router uses that to
// greet with the most relevant context.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { normalizePhone } from "../_shared/phone.ts";

interface LookupBody {
  phone_e164?: string;
  restaurant_id?: string;
}

type CallerType = "guest" | "vendor" | "staff";

interface Candidate {
  type: CallerType;
  row: any;
  last: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { ok: false, reason: "method_not_allowed" });
  }

  let body: LookupBody;
  try {
    body = await req.json();
  } catch {
    return json(200, { ok: false, known: false, reason: "bad_json" });
  }

  const phone = normalizePhone(body.phone_e164 ?? "");
  const restaurantId = (body.restaurant_id ?? "").trim();

  if (!phone || !restaurantId) {
    console.log({ event: "lookup_caller_missing_fields", phone: !!phone, restaurantId: !!restaurantId });
    return json(200, { ok: false, known: false, reason: "missing_fields" });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const [guestRes, vendorRes, staffRes] = await Promise.all([
    sb.from("guests").select("*").eq("restaurant_id", restaurantId).eq("phone_e164", phone).maybeSingle(),
    sb.from("vendor_leads").select("*").eq("restaurant_id", restaurantId).eq("phone_e164", phone).maybeSingle(),
    sb.from("staff_leads").select("*").eq("restaurant_id", restaurantId).eq("phone_e164", phone).maybeSingle(),
  ]);

  const candidates: Candidate[] = [];
  if (guestRes.data)  candidates.push({ type: "guest",  row: guestRes.data,  last: guestRes.data.last_seen_at });
  if (vendorRes.data) candidates.push({ type: "vendor", row: vendorRes.data, last: vendorRes.data.last_seen_at });
  if (staffRes.data)  candidates.push({ type: "staff",  row: staffRes.data,  last: staffRes.data.last_seen_at });

  if (candidates.length === 0) {
    console.log({ event: "lookup_caller_miss", phone });
    return json(200, { ok: true, known: false });
  }

  // Most recent wins. Ties (same timestamp) favour guest > vendor > staff via array order.
  candidates.sort((a, b) => new Date(b.last).getTime() - new Date(a.last).getTime());
  const top = candidates[0];

  const out = {
    ok: true,
    known: true,
    type: top.type,
    name: top.row.name ?? null,
    context: formatContext(top),
    last_interaction: top.last,
    // full_profile lets downstream agents (in their inherited transcript) reference
    // allergens / company / role without an extra call.
    full_profile: top.row,
  };
  console.log({ event: "lookup_caller_hit", type: top.type, phone });
  return json(200, out);
});

function formatContext(c: Candidate): string {
  const r = c.row;
  if (c.type === "guest") {
    const parts: string[] = [`Returning guest. Visit #${r.visit_count ?? "?"}.`];
    if (r.last_visit_summary) parts.push(`Last visit: ${r.last_visit_summary}.`);
    if (r.allergens?.length) parts.push(`Allergens on file: ${r.allergens.join(", ")}.`);
    const prefs = r.preferences ?? {};
    if (prefs.dietary) parts.push(`Dietary: ${prefs.dietary}.`);
    if (prefs.seating) parts.push(`Prefers: ${prefs.seating} seating.`);
    return parts.join(" ");
  }
  if (c.type === "vendor") {
    const parts: string[] = [];
    if (r.company) parts.push(`From ${r.company}.`);
    if (r.last_offering) parts.push(`Last pitched: ${r.last_offering}.`);
    parts.push(`Previous contact ${r.last_seen_at?.split("T")[0] ?? "earlier"}.`);
    return parts.join(" ");
  }
  // staff
  const parts: string[] = [];
  if (r.role_interest) parts.push(`Applied for ${r.role_interest}.`);
  if (r.experience_note) parts.push(`Experience: ${r.experience_note}.`);
  parts.push(`Last contact ${r.last_seen_at?.split("T")[0] ?? "earlier"}.`);
  return parts.join(" ");
}

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

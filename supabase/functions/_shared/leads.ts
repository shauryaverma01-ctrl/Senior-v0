// Vendor lead writes. v6.2 — vendor capture only (no staff, no customer
// transfer per Shaurya's scoping 2026-05-16). Idempotent on call_id so
// Zoronal retries don't duplicate.
// Schema: senior-dashboard/supabase/migrations/0006_vendor_leads.sql.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { InternalCallEvent } from "./types.ts";

export async function insertVendorLead(
  sb: SupabaseClient,
  ev: InternalCallEvent,
  callerE164: string | null,
): Promise<string | null> {
  const phone = callerE164 ?? ev.caller_number;
  if (!phone) {
    console.error("vendor_lead_no_phone", { call_id: ev.call_id });
    return null;
  }

  // Idempotency — Zoronal can retry the webhook; reuse existing row if so.
  const { data: existing } = await sb
    .from("vendor_leads")
    .select("id")
    .eq("call_id", ev.call_id)
    .maybeSingle();
  if (existing?.id) {
    console.log({ event: "vendor_lead_already_exists", id: existing.id, call_id: ev.call_id });
    return existing.id;
  }

  const { data, error } = await sb.from("vendor_leads").insert({
    restaurant_id: ev.restaurant_id,
    call_id: ev.call_id,
    phone_e164: phone,
    vendor_name: ev.vendor_name ?? null,
    category: ev.vendor_category ?? null,
    offer: ev.vendor_offer ?? ev.summary ?? null,
    price: ev.vendor_price ?? null,
    status: "Hot",
  }).select("id").single();

  if (error) {
    console.error("vendor_lead_insert_err", error);
    return null;
  }
  console.log({ event: "vendor_lead_inserted", id: data?.id, call_id: ev.call_id });
  return data?.id ?? null;
}

export function formatVendorTelegram(ev: InternalCallEvent, callerE164: string | null): string {
  const lines = [
    "<b>📦 VENDOR LEAD</b>",
    ev.vendor_name ? `Vendor: ${esc(ev.vendor_name)}` : "",
    ev.vendor_category ? `Category: ${esc(ev.vendor_category)}` : "",
    ev.vendor_offer ? `Offer: ${esc(ev.vendor_offer)}` : "",
    ev.vendor_price ? `Price: ${esc(ev.vendor_price)}` : "",
    `Phone: ${esc(callerE164 ?? ev.caller_number ?? "(none)")}`,
    "",
    `Summary: ${esc(ev.summary ?? "(no summary)")}`,
    "",
    "<i>Captured to vendor_leads — review on the dashboard when convenient.</i>",
  ].filter(Boolean);
  return lines.join("\n");
}

function esc(s: string): string {
  return String(s).replace(/[<>&]/g, (c) => c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;");
}

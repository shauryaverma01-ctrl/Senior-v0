// THE quarantine zone for Zoronal payload shapes.
// If Zoronal changes their schema, this is the ONLY file that changes.
// Business logic imports InternalCallEvent — never the raw Zoronal shape.

import type { InternalCallEvent } from "./types.ts";

// Resolved at parse time from a hardcoded restaurant lookup. v1.5 will route
// dynamically by Zoronal agent_id → restaurants.zoronal_agent_id.
const BLUE_DOOR_RESTAURANT_ID = "00000000-0000-0000-0000-000000000001";

export function parseZoronalPayload(raw: any): InternalCallEvent | null {
  if (!raw) return null;

  // Variant A — our customised Outgoing Payload (Appendix E shape).
  if (raw.fields && typeof raw.fields === "object") {
    return mapVariantA(raw);
  }

  // Variant B — Zoronal default with collected_data[].collected_fields[]
  if (Array.isArray(raw.collected_data)) {
    return mapVariantB(raw);
  }

  console.error("payload_unknown_shape", JSON.stringify(raw).slice(0, 500));
  return null;
}

function mapVariantA(r: any): InternalCallEvent {
  const f = r.fields ?? {};
  return {
    call_id: String(r.call_id ?? ""),
    restaurant_id: BLUE_DOOR_RESTAURANT_ID,
    caller_number: String(r.caller_number ?? ""),
    started_at: String(r.started_at ?? new Date().toISOString()),
    ended_at: String(r.ended_at ?? new Date().toISOString()),
    duration_seconds: Number(r.duration_seconds ?? 0),
    intent: String(f.intent ?? r.intent ?? "incomplete"),
    summary: r.summary,
    transcript_url: r.transcript_url,
    audio_url: r.audio_url,
    customer_name: nonEmpty(f.customer_name),
    customer_phone: nonEmpty(f.customer_phone),
    party_size: toInt(f.party_size),
    booking_date: nonEmpty(f.booking_date),
    booking_time: nonEmpty(f.booking_time),
    special_requests: nonEmpty(f.special_requests),
    direct_discount: detectDiscount(f, r.summary),
  };
}

function mapVariantB(r: any): InternalCallEvent {
  const fields: Array<{ field_name?: string; id?: string; value?: any }> =
    (r.collected_data?.[0]?.collected_fields ?? []) as any;
  const get = (name: string) =>
    fields.find((f) => (f.field_name ?? f.id) === name)?.value;
  const fObj: Record<string, any> = {};
  for (const f of fields) {
    const k = f.field_name ?? f.id;
    if (k) fObj[k] = f.value;
  }
  return {
    call_id: String(r.call_id ?? ""),
    restaurant_id: BLUE_DOOR_RESTAURANT_ID,
    caller_number: String(r.caller_number ?? ""),
    started_at: String(r.started_at ?? new Date().toISOString()),
    ended_at: String(r.ended_at ?? new Date().toISOString()),
    duration_seconds: Number(r.duration_seconds ?? 0),
    intent: String(get("intent") ?? "incomplete"),
    summary: r.summary,
    transcript_url: r.transcript_url,
    audio_url: r.audio_url,
    customer_name: nonEmpty(get("customer_name")),
    customer_phone: nonEmpty(get("customer_phone")),
    party_size: toInt(get("party_size")),
    booking_date: nonEmpty(get("booking_date")),
    booking_time: nonEmpty(get("booking_time")),
    special_requests: nonEmpty(get("special_requests")),
    direct_discount: detectDiscount(fObj, r.summary),
  };
}

function nonEmpty(v: any): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

function toInt(v: any): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = parseInt(String(v).replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
}

function detectDiscount(fields: Record<string, any>, summary?: string): boolean {
  // Crude heuristic: flag direct_discount if summary or special_requests mentions 15% / discount.
  const haystack = `${summary ?? ""} ${fields.special_requests ?? ""}`.toLowerCase();
  return /15\s*%|discount|direct line/.test(haystack);
}

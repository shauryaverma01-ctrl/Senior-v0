// Vendor quarantine zone for RINGG payload shapes.
// All Ringg-specific keys MUST live here. Business code consumes InternalCallEvent only.

import type { InternalCallEvent } from "./types.ts";
import { normalizeDate, normalizeTime } from "./parse-payload.ts";

const BLUE_DOOR_RESTAURANT_ID = "00000000-0000-0000-0000-000000000001";

export function parseRinggPayload(raw: any): InternalCallEvent | null {
  if (!raw || !raw.call_id) return null;

  const callType = String(raw.call_type ?? "").toLowerCase();
  const isOutbound = callType === "outbound";

  // For outbound: customer is `to_number`. For inbound: customer is `from_number`.
  const customerPhone = isOutbound ? raw.to_number : raw.from_number;
  const caller = String(customerPhone ?? "").trim();

  const startedAt = raw.called_on ?? raw.created_at ?? new Date().toISOString();
  const duration = Math.round(Number(raw.call_duration ?? 0));
  const endedAt = duration > 0
    ? new Date(new Date(startedAt).getTime() + duration * 1000).toISOString()
    : (raw.created_at ?? startedAt);

  const args = raw.custom_args_values ?? {};
  const customerName = nonEmpty(args.callee_name);

  // Mine tool_call_logs for booking data + guest history.
  const toolLogs: any[] = Array.isArray(raw.tool_call_logs) ? raw.tool_call_logs : [];
  const capacityCall = toolLogs.find((t) => t?.tool_name === "check_capacity");
  const capacityBody = capacityCall?.request_params?.body ?? capacityCall?.request_params?.function_args ?? {};
  const capacityOk = capacityCall?.response_data?.available === true;
  const endCallLog = toolLogs.find((t) => t?.tool_name === "end_call");

  // Guest history from lookup_guest pre-call response — already in the payload, no extra DB query.
  const lookupLog = toolLogs.find((t) => t?.tool_name === "lookup_guest" && t?.tool_phase === "pre_call");
  const lookupData = lookupLog?.response_data ?? {};
  const guestHistory = lookupData.known === true ? {
    known: true,
    visit_count: lookupData.visit_count,
    last_visit_summary: lookupData.last_visit_summary,
    allergens: lookupData.allergens ?? [],
    tier: lookupData.tier,
  } : { known: false };

  const bookingDate = normalizeDate(capacityBody.date);
  const bookingTime = normalizeTime(capacityBody.time);
  const partySize = toInt(capacityBody.party_size);

  // Prefer Ringg's post-call structured fields.
  // platform_analysis has the AI-generated summary + classification.
  // client_analysis has custom extracted fields (allergens, dietary, seating, occasion, notes).
  const transcript: any[] = Array.isArray(raw.transcript) ? raw.transcript : [];
  const lastBot = lastTurn(transcript, "bot");
  const finalMessage = endCallLog?.request_params?.function_args?.final_message;
  const platformAnalysis = raw.platform_analysis ?? {};
  const clientAnalysis = raw.client_analysis ?? {};
  const keyPoints: string[] = Array.isArray(platformAnalysis.key_points)
    ? platformAnalysis.key_points.filter((x: any) => typeof x === "string")
    : [];
  const actionItems: string[] = Array.isArray(platformAnalysis.action_items)
    ? platformAnalysis.action_items.filter((x: any) => typeof x === "string")
    : [];
  const summary = nonEmpty(platformAnalysis.summary)
    ?? (keyPoints.length > 0 ? keyPoints.join(" • ") : undefined)
    ?? nonEmpty(finalMessage)
    ?? nonEmpty(lastBot)
    ?? "";

  // New client_analysis fields.
  const guestBrief = nonEmpty(clientAnalysis.guest_brief);
  const kitchenNote = nonEmpty(clientAnalysis.kitchen_note);
  const language = nonEmpty(clientAnalysis.language);

  // Extract structured guest profile data — client_analysis first, transcript scan as fallback.
  const { specialRequests, allergens, preferences, occasions, dislikes } = extractGuestSignals(transcript, clientAnalysis);

  const intent = deriveIntent({
    transcript, summary,
    classification: platformAnalysis.classification,
    hasCapacityCall: !!capacityCall,
    capacityOk,
    bookingComplete: !!(bookingDate && bookingTime && partySize),
    endCalled: !!endCallLog,
  });

  return {
    call_id: String(raw.call_id),
    restaurant_id: BLUE_DOOR_RESTAURANT_ID,
    caller_number: caller,
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: duration,
    intent,
    summary,
    transcript_url: undefined,
    audio_url: nonEmpty(raw.recording_url),
    customer_name: customerName,
    customer_phone: caller,
    party_size: partySize,
    booking_date: bookingDate,
    booking_time: bookingTime,
    special_requests: specialRequests,
    direct_discount: detectDiscount(transcript),
    allergens,
    preferences,
    occasions,
    dislikes,
    key_points: keyPoints.length > 0 ? keyPoints : undefined,
    action_items: actionItems.length > 0 ? actionItems : undefined,
    call_cost: raw.call_cost ? Number(raw.call_cost) : undefined,
    classification: nonEmpty(platformAnalysis.classification),
    guest_brief: guestBrief,
    kitchen_note: kitchenNote,
    language,
    guest_history: guestHistory,
  };
}

function lastTurn(transcript: any[], role: "bot" | "user"): string | undefined {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const v = transcript[i]?.[role];
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return undefined;
}

function extractGuestSignals(transcript: any[], clientAnalysis: any = {}): {
  specialRequests: string | undefined;
  allergens: string[];
  preferences: Record<string, unknown>;
  occasions: Record<string, unknown>;
  dislikes: string[];
} {
  // ── client_analysis (LLM-extracted) is the primary source ────────────
  const caAllergens: string[] = Array.isArray(clientAnalysis.allergens)
    ? clientAnalysis.allergens.filter((x: any) => typeof x === "string" && x.length > 0)
    : [];
  const caDietary: string[] = Array.isArray(clientAnalysis.dietary)
    ? clientAnalysis.dietary.filter((x: any) => typeof x === "string" && x.length > 0)
    : [];
  const caSeating: string[] = Array.isArray(clientAnalysis.seating)
    ? clientAnalysis.seating.filter((x: any) => typeof x === "string" && x.length > 0)
    : [];
  const caOccasion: string[] = Array.isArray(clientAnalysis.occasion)
    ? clientAnalysis.occasion.filter((x: any) => typeof x === "string" && x.length > 0)
    : [];
  const caOccasionDate = nonEmpty(clientAnalysis.occasion_date);
  const caDislikes: string[] = Array.isArray(clientAnalysis.dislikes)
    ? clientAnalysis.dislikes.filter((x: any) => typeof x === "string" && x.length > 0)
    : [];
  const caNotes = nonEmpty(clientAnalysis.notes);

  // ── Transcript keyword scan — fallback only if client_analysis empty ──
  const userText = transcript
    .map((t) => t?.user)
    .filter((s) => typeof s === "string")
    .join(" ")
    .toLowerCase();
  const allText = transcript
    .map((t) => `${t?.bot ?? ""} ${t?.user ?? ""}`)
    .join(" ")
    .toLowerCase();

  const allergens: string[] = caAllergens.length > 0 ? caAllergens : (() => {
    const a: string[] = [];
    if (/peanut|moongfali/.test(userText))               a.push("peanut");
    if (/\bdairy\b|milk|lactose|doodh/.test(userText))   a.push("dairy");
    if (/gluten/.test(userText))                          a.push("gluten");
    if (/shellfish|prawn|shrimp|jhinga/.test(userText))   a.push("shellfish");
    if (/\begg\b|anda/.test(userText))                    a.push("egg");
    if (/\bsoy\b/.test(userText))                         a.push("soy");
    if (/tree.?nut|almond|cashew|walnut/.test(userText))  a.push("tree_nut");
    if (/mustard/.test(userText))                         a.push("mustard");
    return a;
  })();

  const preferences: Record<string, unknown> = {};
  const dietarySource = caDietary[0] ?? (() => {
    if (/\bjain\b/.test(userText))                              return "jain";
    if (/\bvegan\b/.test(userText))                            return "vegan";
    if (/\bvegetarian\b|\bveg\b|shakahari/.test(userText))     return "veg";
    if (/non.?veg|chicken|meat|fish|lamb|mutton/.test(userText)) return "non_veg";
    return null;
  })();
  if (dietarySource) preferences.dietary = dietarySource;

  const seatingSource = caSeating[0] ?? (() => {
    if (/\bwindow\b|khidki/.test(userText))               return "window";
    if (/second.?floor|smoking.?area/.test(userText))      return "second_floor";
    if (/quiet|corner|private/.test(userText))             return "quiet_corner";
    return null;
  })();
  if (seatingSource) preferences.seating = seatingSource;

  const occasions: Record<string, unknown> = {};
  const occasionSource = caOccasion.length > 0 ? caOccasion : (() => {
    const o: string[] = [];
    if (/birthday|janamdin|bday/.test(allText))    o.push("birthday");
    if (/anniversary|saalgirah/.test(allText))     o.push("anniversary");
    if (/proposal|engagement/.test(allText))       o.push("proposal");
    return o;
  })();
  // Store with date if extracted, otherwise just the mention date (today's date as a marker)
  const occasionDateValue = caOccasionDate ?? new Date().toISOString().split("T")[0];
  for (const o of occasionSource) occasions[o] = occasionDateValue;

  // ── Dislikes ──────────────────────────────────────────────────────────
  const dislikes: string[] = caDislikes;
  if (dislikes.length > 0) preferences.dislikes = dislikes;

  // ── Build human-readable reservation note ─────────────────────────────
  const hits: string[] = [];
  if (allergens.length > 0)      hits.push(`Allergens: ${allergens.join(", ")}`);
  if (preferences.dietary)       hits.push(`Diet: ${preferences.dietary}`);
  if (preferences.seating)       hits.push(`Seating: ${preferences.seating}`);
  if (dislikes.length > 0)       hits.push(`Avoid: ${dislikes.join(", ")}`);
  if (occasionSource.length > 0) hits.push(`Occasion: ${occasionSource.join(", ")}`);
  if (caNotes)                   hits.push(`Notes: ${caNotes}`);

  return {
    specialRequests: hits.length > 0 ? hits.join("; ") : undefined,
    allergens,
    preferences,
    occasions,
    dislikes,
  };
}

function deriveIntent(ctx: {
  transcript: any[]; summary: string;
  classification?: string;
  hasCapacityCall: boolean; capacityOk: boolean;
  bookingComplete: boolean; endCalled: boolean;
}): InternalCallEvent["intent"] {
  // Trust Ringg's own classification first — it has full call context.
  const cls = String(ctx.classification ?? "").toLowerCase();
  if (/reservation_confirmed|booking_confirmed/.test(cls)) return "reservation";
  if (/complaint|escalat|cancel|modify/.test(cls)) return "escalation";
  if (/faq|enquiry|inquiry|question/.test(cls)) return "faq";

  // Fall back to transcript scan only if classification is missing / unknown.
  const allText = ctx.transcript.map((t) => `${t?.bot ?? ""} ${t?.user ?? ""}`).join(" ").toLowerCase();
  if (/complaint|bad experience|cancel my|cancellation|modify my booking/.test(allText)) return "escalation";
  if (ctx.hasCapacityCall && ctx.capacityOk && ctx.bookingComplete) return "reservation";
  if (/reservation|booking|table for|book a table|reserve/.test(allText) && ctx.bookingComplete) return "reservation";
  if (/(hours|menu|location|parking|address|deliver|halal|alcohol)/.test(allText)) return "faq";
  return "incomplete";
}

function detectDiscount(transcript: any[]): boolean {
  const text = transcript.map((t) => `${t?.bot ?? ""} ${t?.user ?? ""}`).join(" ").toLowerCase();
  return /15\s*%|discount|direct line/.test(text);
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

export { normalizeDate, normalizeTime };

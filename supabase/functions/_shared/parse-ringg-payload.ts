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

  // Transfer detection — was transfer_call invoked? Did it succeed?
  // Used by ringg-webhook to render the escalation Telegram card correctly
  // (so the manager knows whether they were already bridged or still need to call back).
  const transferLog = toolLogs.find((t) => t?.tool_name === "transfer_call");
  const transferAttempted = !!transferLog;
  const transferSucceeded = transferLog?.response_data?.ok === true;
  const transferReason = transferLog?.request_params?.body?.reason
    ?? transferLog?.request_params?.function_args?.reason
    ?? null;

  // Guest history from lookup_guest pre-call response — kept for back-compat with the old
  // single-agent setup. The new multi-agent Router uses lookup_caller instead (see below).
  const lookupLog = toolLogs.find((t) => t?.tool_name === "lookup_guest" && t?.tool_phase === "pre_call");
  const lookupData = lookupLog?.response_data ?? {};
  const guestHistory = lookupData.known === true ? {
    known: true,
    visit_count: lookupData.visit_count,
    last_visit_summary: lookupData.last_visit_summary,
    allergens: lookupData.allergens ?? [],
    tier: lookupData.tier,
  } : { known: false };

  // Caller history from lookup_caller pre-call response (multi-agent flow).
  // This is the unified lookup that checks guests + vendor_leads + staff_leads.
  const callerLookupLog = toolLogs.find((t) => t?.tool_name === "lookup_caller" && t?.tool_phase === "pre_call");
  const callerData = callerLookupLog?.response_data ?? {};
  const callerHistory = callerData.known === true ? {
    known: true,
    type: callerData.type,
    context: callerData.context,
    last_interaction: callerData.last_interaction,
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

  // New client_analysis fields — reservation-intent.
  const guestBrief = nonEmpty(clientAnalysis.guest_brief);
  const kitchenNote = nonEmpty(clientAnalysis.kitchen_note);
  const language = nonEmpty(clientAnalysis.language);

  // Vendor / staff lead fields — populated by custom analysis when Router handed off to
  // Assistant 3 or 4. The same custom_analysis prompt extracts all three intent shapes;
  // unused fields are simply undefined.
  const vendorCompany = nonEmpty(clientAnalysis.company);
  const vendorOffering = nonEmpty(clientAnalysis.offering);
  const staffRole = nonEmpty(clientAnalysis.role_interest);
  const staffExperience = nonEmpty(clientAnalysis.experience_note);
  const leadCallback = nonEmpty(clientAnalysis.callback_number);

  // Order intake fields (intent = order_intake)
  const orderTypeRaw = nonEmpty(clientAnalysis.order_type);
  const orderType = (orderTypeRaw === "new_order" || orderTypeRaw === "existing_order_issue")
    ? orderTypeRaw as ("new_order" | "existing_order_issue") : undefined;
  const orderItems = Array.isArray(clientAnalysis.order_items)
    ? clientAnalysis.order_items.filter((x: any) => typeof x === "string" && x.length > 0)
    : undefined;
  const orderInstructions = nonEmpty(clientAnalysis.order_instructions);
  const orderIssue = nonEmpty(clientAnalysis.order_issue);
  const orderReference = nonEmpty(clientAnalysis.order_reference);

  // ringg client_analysis often returns the caller's name as caller_name; fall back to
  // custom_args_values.callee_name (outbound campaigns) when missing.
  const resolvedName = nonEmpty(clientAnalysis.caller_name) ?? customerName;

  // Extract structured guest profile data — client_analysis first, transcript scan as fallback.
  const { specialRequests, allergens, preferences, occasions, dislikes } = extractGuestSignals(transcript, clientAnalysis);

  let intent = deriveIntent({
    transcript, summary,
    classification: platformAnalysis.classification,
    clientIntent: nonEmpty(clientAnalysis.intent),
    hasCapacityCall: !!capacityCall,
    capacityOk,
    bookingComplete: !!(bookingDate && bookingTime && partySize),
    endCalled: !!endCallLog,
    hasVendorSignals: !!(vendorCompany || vendorOffering),
    hasStaffSignals: !!(staffRole || staffExperience),
    hasOrderSignals: !!(orderType || (orderItems && orderItems.length > 0) || orderIssue || orderReference),
  });

  // Guard: custom_analysis sometimes labels a call as vendor_lead / staff_lead even when
  // none of the corresponding fields were populated. That causes the Telegram card to
  // show all "null" values (we hit this with the Aryak Garg reservation that got mis-routed
  // to NEW VENDOR LEAD with null company/offering/callback). Demote to incomplete so it
  // either re-processes correctly or at least doesn't pollute leads tables.
  if (intent === "vendor_lead" && !vendorCompany && !vendorOffering) {
    console.log({ event: "demote_vendor_no_signals", call_id: raw.call_id });
    intent = (bookingDate && bookingTime && partySize) ? "reservation" : "incomplete";
  }
  if (intent === "staff_lead" && !staffRole && !staffExperience) {
    console.log({ event: "demote_staff_no_signals", call_id: raw.call_id });
    intent = "incomplete";
  }
  if (intent === "order_intake" && !orderType && !(orderItems && orderItems.length > 0) && !orderIssue && !orderReference) {
    console.log({ event: "demote_order_no_signals", call_id: raw.call_id });
    intent = "incomplete";
  }

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
    customer_name: resolvedName,
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
    caller_history: callerHistory,
    transfer_attempted: transferAttempted,
    transfer_succeeded: transferSucceeded,
    transfer_reason: transferReason,
    vendor_company: vendorCompany,
    vendor_offering: vendorOffering,
    vendor_callback_number: leadCallback,
    staff_role_interest: staffRole,
    staff_experience_note: staffExperience,
    staff_callback_number: leadCallback,
    order_type: orderType,
    order_items: orderItems && orderItems.length > 0 ? orderItems : undefined,
    order_instructions: orderInstructions,
    order_issue: orderIssue,
    order_reference: orderReference,
    order_callback_number: leadCallback,
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
  clientIntent?: string;
  hasCapacityCall: boolean; capacityOk: boolean;
  bookingComplete: boolean; endCalled: boolean;
  hasVendorSignals: boolean;
  hasStaffSignals: boolean;
  hasOrderSignals: boolean;
}): InternalCallEvent["intent"] {
  // Trust the custom_analysis intent field first — it's set explicitly by the LLM that
  // saw the full call and knows which Router branch took over.
  const ci = String(ctx.clientIntent ?? "").toLowerCase();
  if (ci === "order_intake" || ci === "order") return "order_intake";
  if (ci === "vendor_lead" || ci === "vendor") return "vendor_lead";
  if (ci === "staff_lead" || ci === "staff") return "staff_lead";
  if (ci === "reservation") return "reservation";
  if (ci === "escalation") return "escalation";
  if (ci === "faq") return "faq";

  // Fall back to Ringg's platform classification.
  const cls = String(ctx.classification ?? "").toLowerCase();
  if (/order_intake|order_issue|new_order|order_routed/.test(cls)) return "order_intake";
  if (/vendor|supplier|b2b|sales_pitch/.test(cls)) return "vendor_lead";
  if (/hiring|staff|job|application/.test(cls)) return "staff_lead";
  if (/reservation_confirmed|booking_confirmed/.test(cls)) return "reservation";
  if (/complaint|escalat|cancel|modify/.test(cls)) return "escalation";
  if (/faq|enquiry|inquiry|question/.test(cls)) return "faq";

  // Field-signal fallback — custom analysis already filled these.
  if (ctx.hasOrderSignals) return "order_intake";
  if (ctx.hasVendorSignals) return "vendor_lead";
  if (ctx.hasStaffSignals) return "staff_lead";

  // Transcript scan — last resort.
  const allText = ctx.transcript.map((t) => `${t?.bot ?? ""} ${t?.user ?? ""}`).join(" ").toLowerCase();
  if (/complaint|bad experience|cancel my|cancellation|modify my booking/.test(allText)) return "escalation";
  if (ctx.hasCapacityCall && ctx.capacityOk && ctx.bookingComplete) return "reservation";
  if (/reservation|booking|table for|book a table|reserve/.test(allText) && ctx.bookingComplete) return "reservation";
  if (/where('?s| is) my order|my order is|late delivery|cold food|missing item|refund.*order|order karna|place an order/.test(allText)) return "order_intake";
  if (/calling from|pitching|supply|supplier|wholesale|aggregator|zomato|swiggy|magicpin/.test(allText)) return "vendor_lead";
  if (/hiring|vacancy|naukri|job|apply|applied|line cook|server|kitchen helper/.test(allText)) return "staff_lead";
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

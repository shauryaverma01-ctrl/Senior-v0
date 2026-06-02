// telegram-cards — all Telegram card builders, organized by tier.
// Owner feedback (May 20): "2-second glance test." Tiered visual hierarchy:
//   Tier 1 — RED 🚨 — urgent, callback needed
//   Tier 2 — STRUCTURED 🍽📦 — review + tap a button
//   Tier 3 — INFO ✅🏢👷 — light card, FYI only
//   Tier 4 — QUIET ℹ️ — minimal log, no action expected
//
// Each builder is a pure function returning the rendered HTML string (Telegram parse_mode=HTML).
// No I/O here. Callers (handle-*-call.ts, ringg-webhook) send the rendered text via telegram.ts.

import type { InternalCallEvent } from "./types.ts";

export function esc(s: string | null | undefined): string {
  if (!s) return "";
  return String(s).replace(/[<>&]/g, (c) => c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;");
}

function listenLine(audioUrl?: string): string {
  return audioUrl ? `🎧 <a href="${esc(audioUrl)}">Listen to call</a>` : "";
}

function actionItemsBlock(items?: string[]): string {
  if (!items || items.length === 0) return "";
  return `\n📋 <b>Action items:</b>\n${items.map((a) => `• ${esc(a)}`).join("\n")}`;
}

function keyPointsBlock(points?: string[]): string {
  if (!points || points.length === 0) return "";
  return `\n🔑 <b>Key points:</b>\n${points.map((p) => `• ${esc(p)}`).join("\n")}`;
}

function historyLine(parsed: InternalCallEvent): string {
  const ch = parsed.caller_history;
  return ch?.known && ch.context ? `\n↩️ <i>${esc(ch.context)}</i>` : "";
}

// Escalation warning for Layer-1 intent cards (order/vendor/staff): the caller asked
// for a human (LLM `escalated`) but Plivo never confirmed a bridge. The intent card is
// still the right primary card; this just flags that the human hand-off didn't land.
// Plivo's transfer_succeeded outranks the LLM — if it bridged, no warning.
function escalationWarnLine(parsed: InternalCallEvent): string {
  return parsed.escalated && !parsed.transfer_succeeded
    ? "⚠️ <b>Caller asked for staff — not connected</b>"
    : "";
}

// Standard "what the caller wanted + how it ended" one-liner, shown on EVERY card so the
// manager always has context at a glance. Empty when no brief exists (e.g. broken/empty
// calls, or transfer calls where the webhook cleared unreliable Ringg data).
function briefBlock(parsed: InternalCallEvent): string {
  return parsed.guest_brief ? `💬 <i>${esc(parsed.guest_brief)}</i>` : "";
}

function compact(lines: (string | null | undefined)[]): string {
  return lines.filter((l) => l && l.trim().length > 0).join("\n");
}

// ── Tier 1 ─────────────────────────────────────────────────────────────────

export function buildCallerHungUpCard(parsed: InternalCallEvent, callerE164: string): string {
  return compact([
    "<b>🚨 CALL BACK NOW</b>",
    parsed.customer_name ? `👤 ${esc(parsed.customer_name)} · ${esc(callerE164)}` : `📞 ${esc(callerE164)}`,
    historyLine(parsed).trim() || null,
    briefBlock(parsed) || null,
    parsed.transfer_reason ? `Reason: <code>${esc(parsed.transfer_reason)}</code>` : null,
    "<i>Caller dropped before staff answered.</i>",
    actionItemsBlock(parsed.action_items).trim() || null,
    listenLine(parsed.audio_url),
  ]);
}

export function buildTransferFailedCard(parsed: InternalCallEvent, callerE164: string, outcomeReason: string | null): string {
  return compact([
    "<b>🚨 STAFF DIDN'T ANSWER — CALL BACK</b>",
    parsed.customer_name ? `👤 ${esc(parsed.customer_name)} · ${esc(callerE164)}` : `📞 ${esc(callerE164)}`,
    historyLine(parsed).trim() || null,
    briefBlock(parsed) || null,
    parsed.transfer_reason ? `Reason: <code>${esc(parsed.transfer_reason)}</code>` : null,
    `<i>Caller heard apology and hung up. Dial outcome: ${esc(outcomeReason ?? "no_answer")}.</i>`,
    actionItemsBlock(parsed.action_items).trim() || null,
    listenLine(parsed.audio_url),
  ]);
}

export function buildOrderEscalationFailedCard(parsed: InternalCallEvent, callerE164: string): string {
  const itemsLine = parsed.order_items && parsed.order_items.length > 0
    ? `📝 Wanted: ${parsed.order_items.map(esc).join(", ")}`
    : (parsed.order_issue ? `❗ Issue: ${esc(parsed.order_issue)}` : null);
  return compact([
    "<b>🚨 ORDER — STAFF DIDN'T ANSWER</b>",
    parsed.customer_name ? `👤 ${esc(parsed.customer_name)} · ${esc(parsed.order_callback_number ?? callerE164)}` : `📞 ${esc(parsed.order_callback_number ?? callerE164)}`,
    briefBlock(parsed) || null,
    itemsLine,
    parsed.order_instructions ? `📝 ${esc(parsed.order_instructions)}` : null,
    parsed.order_reference ? `🔢 Order ref: <code>${esc(parsed.order_reference)}</code>` : null,
    escalationWarnLine(parsed) || null,
    "<i>Caller waiting for a callback.</i>",
    actionItemsBlock(parsed.action_items).trim() || null,
    listenLine(parsed.audio_url),
  ]);
}

// Caller asked for a human (LLM `escalated`) but Maya NEVER attempted a transfer
// (Plivo has no dial leg). This is the one case Plivo can't see — both a customer
// callback AND a signal the bot failed to escalate. NEVER claims a connection.
export function buildEscalationMissedCard(parsed: InternalCallEvent, callerE164: string): string {
  return compact([
    "<b>🚨 CALL BACK — asked for staff, not transferred</b>",
    parsed.customer_name ? `👤 ${esc(parsed.customer_name)} · ${esc(callerE164)}` : `📞 ${esc(callerE164)}`,
    historyLine(parsed).trim() || null,
    briefBlock(parsed) || null,
    "<i>Caller wanted a person — the call was not handed off. Please call back.</i>",
    actionItemsBlock(parsed.action_items).trim() || null,
    listenLine(parsed.audio_url),
  ]);
}

export function buildDBErrorCard(parsed: InternalCallEvent, callerE164: string): string {
  return compact([
    "<b>⚠️ DB ERROR ON BOOKING</b>",
    parsed.customer_name ? `👤 ${esc(parsed.customer_name)}${parsed.party_size ? ` · party of ${parsed.party_size}` : ""}` : null,
    parsed.booking_date && parsed.booking_time ? `📅 ${esc(parsed.booking_date)} · ${esc(parsed.booking_time)}` : null,
    `📞 ${esc(callerE164)}`,
    briefBlock(parsed) || null,
    "<i>Booking failed to save. Call back to confirm.</i>",
    listenLine(parsed.audio_url),
  ]);
}

// ── Tier 2 ─────────────────────────────────────────────────────────────────

export function buildReservationCard(parsed: InternalCallEvent, resv: any, customerE164: string): string {
  const discountLine = parsed.direct_discount ? "🎟 <i>15% direct line discount</i>" : "";
  const allergenLine = parsed.allergens && parsed.allergens.length > 0
    ? `⚠️ <b>Allergens:</b> ${esc(parsed.allergens.join(", "))}` : "";
  const dislikeLine = parsed.dislikes && parsed.dislikes.length > 0
    ? `🚫 <b>Avoid:</b> ${esc(parsed.dislikes.join(", "))}` : "";
  const seating = (parsed.preferences as any)?.seating;
  const seatingLine = seating ? `🪑 ${esc(seating)}` : "";
  const occasionEntries = Object.entries(parsed.occasions ?? {});
  const occasionLine = occasionEntries.length > 0
    ? `🎉 ${esc(occasionEntries.map(([k, v]) => `${k} (${v})`).join(", "))}` : "";
  const briefLine = parsed.guest_brief ? `\n💬 ${esc(parsed.guest_brief)}` : "";
  const kitchenLine = parsed.kitchen_note ? `\n👨‍🍳 <b>Kitchen:</b> ${esc(parsed.kitchen_note)}` : "";

  return compact([
    `<b>🍽 NEW BOOKING</b>${discountLine ? " · " + discountLine : ""}`,
    `👤 ${esc(resv.customer_name ?? "Guest")} · party of ${resv.party_size}`,
    `📅 ${esc(resv.booking_date)} · ${esc(resv.booking_time)}`,
    `📞 ${esc(customerE164 ?? "(no phone)")}`,
    historyLine(parsed).trim() || null,
    allergenLine || null,
    dislikeLine || null,
    seatingLine || null,
    occasionLine || null,
    briefLine.trim() || null,
    kitchenLine.trim() || null,
    actionItemsBlock(parsed.action_items).trim() || null,
    listenLine(parsed.audio_url),
  ]);
}

// ── Tier 3 ─────────────────────────────────────────────────────────────────

export function buildTransferredBridgedCard(parsed: InternalCallEvent, callerE164: string): string {
  return compact([
    "<b>✅ Transfer completed</b>",
    parsed.customer_name ? `👤 ${esc(parsed.customer_name)} · ${esc(callerE164)}` : `📞 ${esc(callerE164)}`,
    parsed.transfer_reason ? `Reason: <code>${esc(parsed.transfer_reason)}</code>` : null,
    "<i>Staff answered. Conversation completed.</i>",
    briefBlock(parsed) || null,
    listenLine(parsed.audio_url),
  ]);
}

export function buildOrderHandledCard(parsed: InternalCallEvent, callerE164: string): string {
  const itemsLine = parsed.order_items && parsed.order_items.length > 0
    ? `📝 Wanted: ${parsed.order_items.map(esc).join(", ")}`
    : (parsed.order_issue ? `❗ Issue: ${esc(parsed.order_issue)}` : null);
  return compact([
    "<b>📦 Order handled</b>",
    parsed.customer_name ? `👤 ${esc(parsed.customer_name)} · ${esc(parsed.order_callback_number ?? callerE164)}` : `📞 ${esc(parsed.order_callback_number ?? callerE164)}`,
    briefBlock(parsed) || null,
    itemsLine,
    parsed.order_instructions ? `📝 ${esc(parsed.order_instructions)}` : null,
    "<i>Caller was connected to staff. Conversation completed.</i>",
    listenLine(parsed.audio_url),
  ]);
}

export function buildVendorCard(parsed: InternalCallEvent): string {
  const ret = parsed.caller_history?.known && parsed.caller_history.type === "vendor";
  return compact([
    `<b>🏢 ${ret ? "RETURNING VENDOR" : "VENDOR"} — review when free</b>`,
    parsed.customer_name ? `👤 ${esc(parsed.customer_name)}${parsed.vendor_company ? ` · ${esc(parsed.vendor_company)}` : ""}` : null,
    parsed.vendor_offering ? `📦 ${esc(parsed.vendor_offering)}` : null,
    `📞 ${esc(parsed.vendor_callback_number ?? parsed.caller_number)}`,
    historyLine(parsed).trim() || null,
    briefBlock(parsed) || null,
    escalationWarnLine(parsed) || null,
    keyPointsBlock(parsed.key_points).trim() || null,
    actionItemsBlock(parsed.action_items).trim() || null,
    listenLine(parsed.audio_url),
  ]);
}

export function buildStaffLeadCard(parsed: InternalCallEvent): string {
  const ret = parsed.caller_history?.known && parsed.caller_history.type === "staff";
  return compact([
    `<b>👷 ${ret ? "RETURNING APPLICANT" : "JOB INQUIRY"}</b>`,
    parsed.customer_name ? `👤 ${esc(parsed.customer_name)}${parsed.staff_role_interest ? ` · ${esc(parsed.staff_role_interest)}` : ""}${parsed.staff_experience_note ? ` · ${esc(parsed.staff_experience_note)}` : ""}` : null,
    `📞 ${esc(parsed.staff_callback_number ?? parsed.caller_number)}`,
    historyLine(parsed).trim() || null,
    briefBlock(parsed) || null,
    escalationWarnLine(parsed) || null,
    keyPointsBlock(parsed.key_points).trim() || null,
    actionItemsBlock(parsed.action_items).trim() || null,
    listenLine(parsed.audio_url),
    "<i>Review for interview shortlist.</i>",
  ]);
}

// ── Tier 4 — quiet logs ────────────────────────────────────────────────────

export function buildFAQLogCard(parsed: InternalCallEvent, callerE164: string): string {
  const who = parsed.customer_name ? esc(parsed.customer_name) : esc(callerE164);
  const dur = parsed.duration_seconds ? `${parsed.duration_seconds}s` : "";
  // Prefer the AI's one-line brief (what they wanted + how it ended); fall back to the
  // longer platform summary (trimmed) only when no brief was produced.
  const line = parsed.guest_brief
    ? esc(parsed.guest_brief)
    : (parsed.summary ? `${esc(parsed.summary.slice(0, 120))}${parsed.summary.length > 120 ? "…" : ""}` : "");
  return compact([
    `ℹ️ FAQ logged · ${who}${dur ? ` · ${dur}` : ""}`,
    line ? `<i>${line}</i>` : null,
    listenLine(parsed.audio_url),
  ]);
}

export function buildIncompleteLogCard(parsed: InternalCallEvent, callerE164: string): string {
  const who = parsed.customer_name ? esc(parsed.customer_name) : esc(callerE164);
  const dur = parsed.duration_seconds ? `${parsed.duration_seconds}s` : "";
  // Prefer the AI's plain-English brief so the manager sees WHAT was attempted and HOW it
  // ended (e.g. "Wanted a table for 4 but no time was confirmed") instead of a useless
  // "Call ended without clear action". Fall back to a canned reason only when there's no
  // brief — i.e. a genuinely empty / bot-only call.
  const detail = parsed.guest_brief
    ? esc(parsed.guest_brief)
    : (parsed.classification === "bot_only_user_no_response"
        ? "Bot only, no caller response."
        : "Call ended without clear action.");
  return compact([
    `📋 Incomplete · ${who}${dur ? ` · ${dur}` : ""}`,
    `<i>${detail}</i>`,
    listenLine(parsed.audio_url),
  ]);
}

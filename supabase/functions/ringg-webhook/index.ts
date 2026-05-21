// ringg-webhook — receives end-of-call payload from Ringg.
//
// ⚠️ SCAFFOLD — DO NOT DEPLOY TO PRODUCTION YET.
// Lives on branch feat/ringg-vendor. parse-ringg-payload.ts is currently a stub
// (always returns null), so every call lands in the parse_failed branch — the raw
// payload is stored on calls.raw_payload and the manager gets no Telegram message.
// Once a real Ringg test call gives us a sample payload, fill in
// _shared/parse-ringg-payload.ts and verify before pointing real DIDs here.
//
// Structurally a near-copy of zoronal-webhook/index.ts. When Ringg is live and
// the parser is filled in, the TODO at the top of zoronal-webhook/index.ts
// applies — both webhooks should share _shared/handle-call-event.ts. Don't do
// that refactor until both vendors are proven.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { parseRinggPayload } from "../_shared/parse-ringg-payload.ts";
import { sendReservationNotification, sendPlainMessage } from "../_shared/telegram.ts";
import { upsertGuestFromCall } from "../_shared/guests.ts";
import { handleVendorLead, handleStaffLead } from "../_shared/handle-lead-call.ts";
import { handleOrderIntake } from "../_shared/handle-order-call.ts";
import {
  buildReservationCard,
  buildDBErrorCard,
  buildTransferredBridgedCard,
  buildCallerHungUpCard,
  buildTransferFailedCard,
  buildFAQLogCard,
  buildIncompleteLogCard,
} from "../_shared/telegram-cards.ts";
import { checkTransferOutcome } from "../_shared/plivo.ts";
import { normalizePhone } from "../_shared/phone.ts";
import { slaDeadline } from "../_shared/time.ts";

const SECRET = () => Deno.env.get("RINGG_WEBHOOK_SECRET") ?? "";

Deno.serve(async (req) => {
  const auth = req.headers.get("authorization") ?? "";
  if (SECRET() && auth !== `Bearer ${SECRET()}`) {
    console.warn("ringg_webhook_unauthorized", auth.slice(0, 20));
    return new Response("unauthorized", { status: 401 });
  }

  let raw: any = null;
  try { raw = await req.json(); } catch { return new Response("bad_json", { status: 400 }); }
  console.log({ event: "ringg_webhook_received", call_id: raw?.call_id ?? "unknown" });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const parsed = parseRinggPayload(raw);
  if (!parsed) {
    console.error("ringg_payload_parse_failed");
    await sb.from("calls").upsert({
      id: raw?.call_id ?? `ringg_unknown_${Date.now()}`,
      restaurant_id: "00000000-0000-0000-0000-000000000001",
      raw_payload: raw, status: "parse_failed",
    }, { onConflict: "id", ignoreDuplicates: true });
    return new Response("ok", { status: 200 });
  }

  console.log({ event: "ringg_parsed_intent", intent: parsed.intent, name: parsed.customer_name, date: parsed.booking_date, time: parsed.booking_time, party: parsed.party_size });

  const callerE164 = normalizePhone(parsed.caller_number) ?? parsed.caller_number;
  const customerE164 = normalizePhone(parsed.customer_phone) ?? parsed.customer_phone;

  // Guard: if the caller_number IS our own Plivo number, this is a conditional-forwarding
  // loop artifact (Maya escalated → restaurant main number → no answer → forwarded back to
  // Maya). Log it but don't bump guests, don't Telegram, don't process.
  const PLIVO_NUMBER = Deno.env.get("PLIVO_CALLER_ID") ?? "+918035016712";
  if (callerE164 === PLIVO_NUMBER) {
    console.warn({ event: "ringg_skip_forwarding_loop", call_id: parsed.call_id, caller: callerE164 });
    await sb.from("calls").upsert({
      id: parsed.call_id,
      restaurant_id: parsed.restaurant_id,
      caller_number: callerE164,
      started_at: parsed.started_at,
      ended_at: parsed.ended_at,
      duration_seconds: parsed.duration_seconds,
      status: "forwarding_loop",
      raw_payload: raw,
    }, { onConflict: "id" });
    return new Response("ok", { status: 200 });
  }

  // PLIVO GROUND TRUTH — query Plivo FIRST, before deciding anything else.
  // Ringg's webhook payload sometimes drops transfer_call from tool_call_logs and
  // reports duration=0 even when a real transfer + conversation happened (Plivo's
  // data is the truth). We use Plivo's view of the call to override Ringg's claims.
  const plivoOutcome = await checkTransferOutcome(parsed.call_id);
  if (plivoOutcome.attempted) {
    parsed.transfer_attempted = true;
    parsed.transfer_succeeded = plivoOutcome.bridged;
  }
  const transferOutcomeReason: string | null = plivoOutcome.reason;

  // Phantom guard: ONLY skip if literally nothing happened anywhere — no Ringg signals
  // AND no Plivo child call. Even when Ringg says duration=0, Plivo evidence of a transfer
  // means a real call happened.
  if ((parsed.duration_seconds ?? 0) === 0) {
    const hasAudio = !!parsed.audio_url || !!raw?.recording_url;
    const hasTranscript = Array.isArray(raw?.transcript) && raw.transcript.length > 0;
    const hasClassification = !!parsed.classification && parsed.classification !== "no_classification";
    const hasOnCallTools = Array.isArray(raw?.tool_call_logs) &&
      raw.tool_call_logs.some((t: any) => t?.tool_phase !== "pre_call" && t?.tool_name !== "greetings" && t?.tool_name !== "lookup_caller");

    const isTruePhantom = !hasAudio && !hasTranscript && !hasClassification && !hasOnCallTools && !plivoOutcome.attempted;

    if (isTruePhantom) {
      console.log({ event: "ringg_skip_true_phantom", call_id: parsed.call_id, caller: callerE164 });
      await sb.from("calls").upsert({
        id: parsed.call_id,
        restaurant_id: parsed.restaurant_id,
        caller_number: callerE164,
        started_at: parsed.started_at,
        ended_at: parsed.ended_at,
        duration_seconds: 0,
        status: "phantom",
        raw_payload: raw,
      }, { onConflict: "id" });
      return new Response("ok", { status: 200 });
    }

    console.log({ event: "ringg_ghost_call_processed", call_id: parsed.call_id, caller: callerE164, hasAudio, hasTranscript, hasClassification, hasOnCallTools, plivoAttempted: plivoOutcome.attempted });
    // Continue processing — fall through to the normal flow even though duration claims 0.
  }

  // If Ringg's data is broken (duration=0, no transcript, junk classification) but Plivo
  // confirmed a transfer happened, the real conversation was with the manager — NOT Maya.
  // Don't pollute the guest profile with Ringg's broken summary / hallucinated allergens / etc.
  // Visit count still bumps; we just pass null for the unreliable fields.
  const ringgBroken = (parsed.duration_seconds ?? 0) === 0
    && (!Array.isArray(raw?.transcript) || raw.transcript.length === 0)
    && (parsed.classification === "bot_only_user_no_response" || parsed.classification === "no_classification" || !parsed.classification);
  if (ringgBroken && plivoOutcome.attempted) {
    console.log({ event: "ringg_broken_data_transfer", call_id: parsed.call_id, action: "clearing_suspect_fields" });
    parsed.summary = undefined;
    parsed.allergens = undefined;
    parsed.preferences = undefined;
    parsed.occasions = undefined;
    parsed.customer_name = undefined;
    parsed.guest_brief = undefined;
    parsed.kitchen_note = undefined;
  }

  const { data: existingCall } = await sb.from("calls").select("guest_id").eq("id", parsed.call_id).maybeSingle();
  const guestId: string | null = existingCall ? (existingCall.guest_id ?? null) : await upsertGuestFromCall(parsed);
  const { error: callsErr } = await sb.from("calls").upsert({
    id: parsed.call_id,
    restaurant_id: parsed.restaurant_id,
    caller_number: callerE164,
    started_at: parsed.started_at,
    ended_at: parsed.ended_at,
    duration_seconds: parsed.duration_seconds,
    intent: parsed.intent,
    status: "completed",
    summary: parsed.summary,
    transcript_url: parsed.transcript_url,
    audio_url: parsed.audio_url,
    raw_payload: raw,
    guest_id: guestId,
    key_points: parsed.key_points ?? null,
    action_items: parsed.action_items ?? null,
    call_cost: parsed.call_cost ?? null,
    classification: parsed.classification ?? null,
    guest_brief: parsed.guest_brief ?? null,
    kitchen_note: parsed.kitchen_note ?? null,
    language: parsed.language ?? null,
  }, { onConflict: "id" });
  if (callsErr) {
    console.error("ringg_calls_upsert_err", callsErr);
    return new Response("calls_upsert_failed", { status: 200 });
  }

  const { data: rest } = await sb.from("restaurants")
    .select("telegram_chat_id").eq("id", parsed.restaurant_id).single();
  const chatId = rest?.telegram_chat_id ?? Deno.env.get("TELEGRAM_MANAGER_CHAT_ID")!;

  // (Plivo verification already done at top of handler — plivoOutcome/transferOutcomeReason are in scope)

  if (parsed.intent === "vendor_lead") {
    await handleVendorLead(parsed, chatId);
    return new Response("ok", { status: 200 });
  }
  if (parsed.intent === "staff_lead") {
    await handleStaffLead(parsed, chatId);
    return new Response("ok", { status: 200 });
  }
  if (parsed.intent === "order_intake") {
    await handleOrderIntake(parsed, chatId, callerE164);
    return new Response("ok", { status: 200 });
  }

  const isComplete = parsed.intent === "reservation"
    && parsed.customer_name && parsed.party_size
    && parsed.booking_date && parsed.booking_time;

  if (isComplete) {
    const { data: existing } = await sb.from("reservations")
      .select("id").eq("call_id", parsed.call_id).maybeSingle();
    if (existing?.id) {
      console.log({ event: "ringg_reservation_already_exists", id: existing.id });
      return new Response("ok", { status: 200 });
    }

    const { data: resv, error: resvErr } = await sb.from("reservations").insert({
      call_id: parsed.call_id,
      restaurant_id: parsed.restaurant_id,
      customer_name: parsed.customer_name,
      customer_phone: customerE164,
      party_size: parsed.party_size,
      booking_date: parsed.booking_date,
      booking_time: parsed.booking_time,
      special_requests: parsed.special_requests,
      guest_id: guestId,
      direct_discount: parsed.direct_discount ?? false,
      sla_deadline: slaDeadline(parsed.booking_date!).toISOString(),
    }).select().single();

    if (resvErr || !resv) {
      console.error("ringg_resv_insert_err", resvErr);
      await sendPlainMessage(chatId, buildDBErrorCard(parsed, customerE164 ?? callerE164));
      return new Response("db_err", { status: 200 });
    }

    const text = buildReservationCard(parsed, resv, customerE164 ?? callerE164);
    const tg = await sendReservationNotification({ chatId, reservationId: resv.id, text });
    if (tg) {
      await sb.from("reservations").update({ telegram_message_id: String(tg.message_id) }).eq("id", resv.id);
    } else {
      console.error("ringg_tg_notification_failed_for", resv.id);
    }
    return new Response("ok", { status: 200 });
  }

  // Fallback dispatcher — by tier:
  // Tier 1 RED → caller hung up during transfer / staff didn't answer
  // Tier 3 ✅ → transfer bridged
  // Tier 4 ℹ️ → FAQ logged
  // Tier 4 📋 → incomplete (bot-only, no clear action)
  let text: string;
  if (parsed.transfer_attempted && parsed.transfer_succeeded) {
    text = buildTransferredBridgedCard(parsed, callerE164);
  } else if (parsed.transfer_attempted && !parsed.transfer_succeeded) {
    if (transferOutcomeReason === "no_dial_leg") {
      text = buildCallerHungUpCard(parsed, callerE164);
    } else {
      text = buildTransferFailedCard(parsed, callerE164, transferOutcomeReason);
    }
  } else if (parsed.intent === "faq") {
    text = buildFAQLogCard(parsed, callerE164);
  } else {
    // Default fallback (escalation without transfer, incomplete, anything else)
    text = buildIncompleteLogCard(parsed, callerE164);
  }

  const sent = await sendPlainMessage(chatId, text);
  if (!sent) console.error("ringg_tg_plain_send_failed_for_call", parsed.call_id);

  return new Response("ok", { status: 200 });
});

// (esc helper moved into _shared/telegram-cards.ts)

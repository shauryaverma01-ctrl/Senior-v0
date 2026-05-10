// zoronal-webhook — receives end-of-call payload from Zoronal.
// Always sends Telegram (even for partial captures), so manager never misses a call.
//
// TODO(vendor-abstraction): when a second voice vendor lands, extract the post-parse
// business logic below — calls upsert, upsertGuestFromCall, reservations insert,
// Telegram notification — into _shared/handle-call-event.ts so both webhooks share it.
// The seam is everything after `parseZoronalPayload(raw)` returns. See CLAUDE.md
// "Voice Vendor Abstraction" for the principle.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { parseZoronalPayload } from "../_shared/parse-payload.ts";
import { sendReservationNotification, sendPlainMessage } from "../_shared/telegram.ts";
import { upsertGuestFromCall } from "../_shared/guests.ts";
import { normalizePhone } from "../_shared/phone.ts";
import { slaDeadline } from "../_shared/time.ts";

const SECRET = () => Deno.env.get("ZORONAL_WEBHOOK_SECRET") ?? "";

Deno.serve(async (req) => {
  const auth = req.headers.get("authorization") ?? "";
  if (SECRET() && auth !== `Bearer ${SECRET()}`) {
    console.warn("webhook_unauthorized", auth.slice(0, 20));
    return new Response("unauthorized", { status: 401 });
  }

  let raw: any = null;
  try { raw = await req.json(); } catch { return new Response("bad_json", { status: 400 }); }
  console.log({ event: "webhook_received", call_id: raw?.call_id ?? "unknown" });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const parsed = parseZoronalPayload(raw);
  if (!parsed) {
    console.error("payload_parse_failed");
    await sb.from("calls").upsert({
      id: raw?.call_id ?? `unknown_${Date.now()}`,
      restaurant_id: "00000000-0000-0000-0000-000000000001",
      raw_payload: raw, status: "parse_failed",
    }, { onConflict: "id", ignoreDuplicates: true });
    return new Response("ok", { status: 200 });
  }

  console.log({ event: "parsed_intent", intent: parsed.intent, name: parsed.customer_name, date: parsed.booking_date, time: parsed.booking_time, party: parsed.party_size });

  // Idempotent calls upsert
  const callerE164 = normalizePhone(parsed.caller_number) ?? parsed.caller_number;
  const customerE164 = normalizePhone(parsed.customer_phone) ?? parsed.customer_phone;
  // Gate the guest bump on first delivery for this call_id; retries reuse existing guest_id.
  const { data: existingCall } = await sb.from("calls").select("guest_id").eq("id", parsed.call_id).maybeSingle();
  const guestId: string | null = existingCall ? (existingCall.guest_id ?? null) : await upsertGuestFromCall(parsed);
  await sb.from("calls").upsert({
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
  }, { onConflict: "id", ignoreDuplicates: true });

  // Look up restaurant chat_id
  const { data: rest } = await sb.from("restaurants")
    .select("telegram_chat_id").eq("id", parsed.restaurant_id).single();
  const chatId = rest?.telegram_chat_id ?? Deno.env.get("TELEGRAM_MANAGER_CHAT_ID")!;

  const isComplete = parsed.intent === "reservation"
    && parsed.customer_name && parsed.party_size
    && parsed.booking_date && parsed.booking_time;

  // ── Path A: complete reservation → write row + send buttons
  if (isComplete) {
    const { data: existing } = await sb.from("reservations")
      .select("id").eq("call_id", parsed.call_id).maybeSingle();
    if (existing?.id) {
      console.log({ event: "reservation_already_exists", id: existing.id });
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
      console.error("resv_insert_err", resvErr);
      // Still notify manager so the call isn't lost
      await sendPlainMessage(chatId, `<b>⚠️ DB ERROR ON BOOKING</b>\n${parsed.customer_name} · party ${parsed.party_size} · ${parsed.booking_date} ${parsed.booking_time}\nPhone: ${customerE164 ?? callerE164}\nManager please call back.`);
      return new Response("db_err", { status: 200 });
    }

    const text = `<b>NEW BOOKING</b>${parsed.direct_discount ? " · <i>15% direct discount</i>" : ""}
${escape(resv.customer_name)} · party of ${resv.party_size}
${resv.booking_date} ${resv.booking_time}
${escape(customerE164 ?? "(no phone)")}${resv.special_requests ? "\nNotes: " + escape(resv.special_requests) : ""}`;

    const tg = await sendReservationNotification({ chatId, reservationId: resv.id, text });
    if (tg) {
      await sb.from("reservations").update({ telegram_message_id: String(tg.message_id) }).eq("id", resv.id);
    } else {
      console.error("tg_notification_failed_for", resv.id);
    }
    return new Response("ok", { status: 200 });
  }

  // ── Path B: partial capture or escalation → ALWAYS notify manager, no DB row
  const tag = parsed.intent === "escalation" ? "⚠️ ESCALATION"
    : parsed.intent === "faq" ? "ℹ️ FAQ CALL"
    : "📋 INCOMPLETE CALL";
  const lines = [
    `<b>${tag}</b>`,
    parsed.customer_name ? `Name: ${escape(parsed.customer_name)}` : "",
    customerE164 ? `Phone: ${escape(customerE164)}` : (callerE164 ? `Caller: ${escape(callerE164)}` : ""),
    parsed.party_size ? `Party: ${parsed.party_size}` : "",
    parsed.booking_date ? `Date: ${parsed.booking_date}` : "",
    parsed.booking_time ? `Time: ${parsed.booking_time}` : "",
    parsed.special_requests ? `Notes: ${escape(parsed.special_requests)}` : "",
    "",
    `Summary: ${escape(parsed.summary ?? "(no summary)")}`,
    "",
    "<i>Manager please call back within the hour.</i>",
  ].filter(Boolean);

  const sent = await sendPlainMessage(chatId, lines.join("\n"));
  if (!sent) console.error("tg_plain_send_failed_for_call", parsed.call_id);

  return new Response("ok", { status: 200 });
});

function escape(s: string): string {
  return String(s).replace(/[<>&]/g, (c) => c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;");
}

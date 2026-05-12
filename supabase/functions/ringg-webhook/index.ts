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

  const { data: rest } = await sb.from("restaurants")
    .select("telegram_chat_id").eq("id", parsed.restaurant_id).single();
  const chatId = rest?.telegram_chat_id ?? Deno.env.get("TELEGRAM_MANAGER_CHAT_ID")!;

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
      await sendPlainMessage(chatId, `<b>⚠️ DB ERROR ON BOOKING (Ringg)</b>\n${parsed.customer_name} · party ${parsed.party_size} · ${parsed.booking_date} ${parsed.booking_time}\nPhone: ${customerE164 ?? callerE164}\nManager please call back.`);
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
      console.error("ringg_tg_notification_failed_for", resv.id);
    }
    return new Response("ok", { status: 200 });
  }

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
  if (!sent) console.error("ringg_tg_plain_send_failed_for_call", parsed.call_id);

  return new Response("ok", { status: 200 });
});

function escape(s: string): string {
  return String(s).replace(/[<>&]/g, (c) => c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;");
}

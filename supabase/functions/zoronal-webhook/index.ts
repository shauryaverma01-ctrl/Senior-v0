// zoronal-webhook — receives end-of-call payload from Zoronal.
// v0.1: log raw payload + persist to calls table, then write reservation + fire Telegram.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { parseZoronalPayload } from "../_shared/parse-payload.ts";
import { sendReservationNotification, sendPlainMessage } from "../_shared/telegram.ts";
import { normalizePhone } from "../_shared/phone.ts";
import { slaDeadline } from "../_shared/time.ts";

const SECRET = () => Deno.env.get("ZORONAL_WEBHOOK_SECRET") ?? "";

Deno.serve(async (req) => {
  // Auth (skip if no secret configured — useful for very first capture)
  const auth = req.headers.get("authorization") ?? "";
  if (SECRET() && auth !== `Bearer ${SECRET()}`) {
    console.warn("webhook_unauthorized", auth.slice(0, 20));
    return new Response("unauthorized", { status: 401 });
  }

  let raw: any = null;
  try {
    raw = await req.json();
  } catch {
    return new Response("bad_json", { status: 400 });
  }
  console.log({ event: "webhook_received", call_id: raw?.call_id ?? "unknown" });
  console.log({ event: "webhook_raw_preview", preview: JSON.stringify(raw).slice(0, 1500) });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const parsed = parseZoronalPayload(raw);
  if (!parsed || !parsed.call_id) {
    console.error("payload_parse_failed");
    // Still record raw payload so we don't lose the call
    await sb.from("calls").upsert({
      id: raw?.call_id ?? `unknown_${Date.now()}`,
      restaurant_id: "00000000-0000-0000-0000-000000000001",
      raw_payload: raw,
      status: "parse_failed",
    }, { onConflict: "id", ignoreDuplicates: true });
    return new Response("ok", { status: 200 });
  }

  // Idempotent: upsert calls keyed on Zoronal call_id
  const { error: callErr } = await sb.from("calls").upsert(
    {
      id: parsed.call_id,
      restaurant_id: parsed.restaurant_id,
      caller_number: normalizePhone(parsed.caller_number) ?? parsed.caller_number,
      started_at: parsed.started_at,
      ended_at: parsed.ended_at,
      duration_seconds: parsed.duration_seconds,
      intent: parsed.intent,
      status: "completed",
      summary: parsed.summary,
      transcript_url: parsed.transcript_url,
      audio_url: parsed.audio_url,
      raw_payload: raw,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (callErr) console.error("call_upsert_err", callErr);

  // Look up restaurant chat_id
  const { data: rest } = await sb
    .from("restaurants")
    .select("telegram_chat_id")
    .eq("id", parsed.restaurant_id)
    .single();
  const chatId = rest?.telegram_chat_id ?? Deno.env.get("TELEGRAM_MANAGER_CHAT_ID")!;

  // Non-reservation intents: just notify manager, no reservation row
  if (parsed.intent !== "reservation") {
    if (parsed.intent === "escalation") {
      await sendPlainMessage(
        chatId,
        `<b>⚠️ ESCALATION</b>\nFrom: ${parsed.caller_number}\nSummary: ${parsed.summary ?? "(no summary)"}\nCall back within 1 hour.`,
      );
    }
    console.log({ event: "non_reservation", intent: parsed.intent });
    return new Response("ok", { status: 200 });
  }

  // Validate minimum reservation fields
  if (!parsed.customer_name || !parsed.booking_date || !parsed.booking_time || !parsed.party_size) {
    console.warn("reservation_incomplete", parsed);
    await sendPlainMessage(
      chatId,
      `<b>📋 INCOMPLETE CALL</b>\nFrom: ${parsed.caller_number}\nFields missing — review transcript in Zoronal.`,
    );
    return new Response("ok", { status: 200 });
  }

  // Insert reservation (we already deduped via calls.upsert; re-runs of same call_id won't reinsert)
  const { data: existing } = await sb
    .from("reservations")
    .select("id")
    .eq("call_id", parsed.call_id)
    .maybeSingle();
  if (existing?.id) {
    console.log({ event: "reservation_already_exists", id: existing.id });
    return new Response("ok", { status: 200 });
  }

  const { data: resv, error: resvErr } = await sb
    .from("reservations")
    .insert({
      call_id: parsed.call_id,
      restaurant_id: parsed.restaurant_id,
      customer_name: parsed.customer_name,
      customer_phone: normalizePhone(parsed.customer_phone) ?? parsed.customer_phone,
      party_size: parsed.party_size,
      booking_date: parsed.booking_date,
      booking_time: parsed.booking_time,
      special_requests: parsed.special_requests,
      direct_discount: parsed.direct_discount ?? false,
      sla_deadline: slaDeadline(parsed.booking_date).toISOString(),
    })
    .select()
    .single();
  if (resvErr) {
    console.error("resv_insert_err", resvErr);
    return new Response("db_err", { status: 500 });
  }

  const text = formatReservationMessage(resv);
  const tg = await sendReservationNotification({
    chatId,
    reservationId: resv.id,
    text,
  });
  if (tg) {
    await sb.from("reservations").update({ telegram_message_id: String(tg.message_id) }).eq("id", resv.id);
  }

  return new Response("ok", { status: 200 });
});

function formatReservationMessage(r: any): string {
  const discount = r.direct_discount ? " · <i>15% direct discount</i>" : "";
  const notes = r.special_requests ? `\nNotes: ${escape(r.special_requests)}` : "";
  return `<b>NEW BOOKING</b>${discount}
${escape(r.customer_name)} · party of ${r.party_size}
${r.booking_date} ${r.booking_time}
${escape(r.customer_phone ?? "(no phone)")}${notes}`.trim();
}

function escape(s: string): string {
  return String(s).replace(/[<>&]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;",
  );
}

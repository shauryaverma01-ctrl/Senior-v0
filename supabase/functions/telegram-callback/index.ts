// telegram-callback — receives Telegram update when manager taps Confirm/Decline/Callback button.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { answerCallback, editMessage } from "../_shared/telegram.ts";

Deno.serve(async (req) => {
  let upd: any = null;
  try {
    upd = await req.json();
  } catch {
    return new Response("bad_json", { status: 400 });
  }

  const cq = upd?.callback_query;
  if (!cq) {
    // Not a callback (might be a regular message). ACK and ignore.
    return new Response("ok", { status: 200 });
  }

  const data = String(cq.data ?? "");
  const [verb, reservationId] = data.split(":");
  if (!verb || !reservationId) {
    await answerCallback(cq.id, "Bad button data");
    return new Response("ok", { status: 200 });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const newStatus =
    verb === "confirm" ? "confirmed"
    : verb === "decline" ? "declined"
    : verb === "callback" ? "callback_requested"
    : null;
  if (!newStatus) {
    await answerCallback(cq.id, `Unknown action: ${verb}`);
    return new Response("ok", { status: 200 });
  }

  const username = cq.from?.username ?? cq.from?.first_name ?? "manager";

  const { data: r, error } = await sb
    .from("reservations")
    .update({
      status: newStatus,
      confirmed_by: username,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", reservationId)
    .select()
    .single();

  if (error || !r) {
    console.error("status_update_err", error);
    await answerCallback(cq.id, "Reservation not found");
    return new Response("ok", { status: 200 });
  }

  const tag =
    newStatus === "confirmed" ? "✅ CONFIRMED"
    : newStatus === "declined" ? "❌ DECLINED"
    : "📞 CALLBACK SCHEDULED";

  const original = cq.message?.text ?? "";
  const newText = `<b>${tag}</b> by ${username}\n\n${original}`;
  await editMessage(
    String(cq.message.chat.id),
    cq.message.message_id,
    newText,
  );
  await answerCallback(cq.id, tag);

  console.log({ event: "callback_handled", verb, reservationId });
  return new Response("ok", { status: 200 });
});

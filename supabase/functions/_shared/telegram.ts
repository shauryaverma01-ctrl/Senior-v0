// Telegram Bot API helpers. Uses raw fetch — no library dependency.

const TG_BASE = () =>
  `https://api.telegram.org/bot${Deno.env.get("TELEGRAM_BOT_TOKEN")}`;

export async function sendReservationNotification(opts: {
  chatId: string;
  reservationId: string;
  text: string;
}): Promise<{ message_id: number } | null> {
  const body = {
    chat_id: opts.chatId,
    text: opts.text,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Confirm", callback_data: `confirm:${opts.reservationId}` },
          { text: "❌ Decline", callback_data: `decline:${opts.reservationId}` },
        ],
        [{ text: "📞 Call back", callback_data: `callback:${opts.reservationId}` }],
      ],
    },
  };
  const r = await fetch(`${TG_BASE()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    console.error("tg_send_failed", r.status, await r.text());
    return null;
  }
  const j = await r.json();
  return { message_id: j.result.message_id };
}

export async function sendPlainMessage(chatId: string, text: string): Promise<number | null> {
  const r = await fetch(`${TG_BASE()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!r.ok) {
    console.error("tg_plain_send_failed", r.status, await r.text());
    return null;
  }
  const j = await r.json();
  return j.result.message_id as number;
}

export async function answerCallback(callback_query_id: string, text?: string) {
  const r = await fetch(`${TG_BASE()}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id, text }),
  });
  if (!r.ok) console.error("tg_answer_failed", r.status, await r.text());
}

export async function editMessage(
  chatId: string,
  messageId: number,
  newText: string,
) {
  const r = await fetch(`${TG_BASE()}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text: newText,
      parse_mode: "HTML",
    }),
  });
  if (!r.ok) console.error("tg_edit_failed", r.status, await r.text());
}

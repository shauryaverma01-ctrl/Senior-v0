// handle-order-call — order_intake post-parse handler.
//
// Decision tree (transfer_attempted + transfer_succeeded come from Plivo ground truth):
//   transfer_succeeded → Tier 3 ✅ Order handled (FYI, staff dealt with it)
//   transfer attempted but failed → Tier 1 🚨 Order — staff didn't answer (CALL BACK)
//   no transfer attempted (caller hung up before Maya could transfer) → Tier 1 🚨 (caller waiting)
//
// We don't persist orders to a separate table for now — staff handles fulfilment off-platform.
// The Telegram alert + call recording give them everything they need.

import { sendPlainMessage } from "./telegram.ts";
import { buildOrderHandledCard, buildOrderEscalationFailedCard } from "./telegram-cards.ts";
import type { InternalCallEvent } from "./types.ts";

export async function handleOrderIntake(parsed: InternalCallEvent, chatId: string, callerE164: string): Promise<void> {
  const text = parsed.transfer_attempted && parsed.transfer_succeeded
    ? buildOrderHandledCard(parsed, callerE164)
    : buildOrderEscalationFailedCard(parsed, callerE164);
  const sent = await sendPlainMessage(chatId, text);
  if (!sent) console.error("order_tg_failed", parsed.call_id);
}

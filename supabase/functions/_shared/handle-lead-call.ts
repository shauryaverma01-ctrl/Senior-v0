// handle-lead-call — vendor + staff post-parse handlers.
// Upserts into the right table and sends the Tier 3 info card.
// Card layouts live in telegram-cards.ts.

import { sendPlainMessage } from "./telegram.ts";
import { buildVendorCard, buildStaffLeadCard } from "./telegram-cards.ts";
import { upsertVendorFromCall } from "./vendor-leads.ts";
import { upsertStaffFromCall } from "./staff-leads.ts";
import type { InternalCallEvent } from "./types.ts";

export async function handleVendorLead(parsed: InternalCallEvent, chatId: string): Promise<void> {
  const id = await upsertVendorFromCall(parsed);
  if (!id) console.error("vendor_upsert_failed", parsed.call_id);
  const sent = await sendPlainMessage(chatId, buildVendorCard(parsed));
  if (!sent) console.error("vendor_tg_failed", parsed.call_id);
}

export async function handleStaffLead(parsed: InternalCallEvent, chatId: string): Promise<void> {
  const id = await upsertStaffFromCall(parsed);
  if (!id) console.error("staff_upsert_failed", parsed.call_id);
  const sent = await sendPlainMessage(chatId, buildStaffLeadCard(parsed));
  if (!sent) console.error("staff_tg_failed", parsed.call_id);
}

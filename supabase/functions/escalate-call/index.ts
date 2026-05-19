// escalate-call — Maya's mid-call escape hatch.
// POST { reason?, caller_number?, summary_so_far? }
// → 200 { ok, action, target_number, say, end_call }
//
// Vendor-neutral. Maya invokes this from Zoronal or Ringg as an on-call tool;
// the same URL serves both vendors. Returns the redirect target + the line
// Maya should say. The voice vendor performs the actual SIP transfer based on
// its dashboard config.
//
// Side effect: urgent Telegram alert to the manager chat so context lands
// before the redirected call rings.
//
// Config (env vars):
//   MANAGER_ESCALATION_PHONE  required — E.164, e.g. "+919650795900"
//   TELEGRAM_BOT_TOKEN        required (existing)
//   TELEGRAM_MANAGER_CHAT_ID  required (existing)
//
// Latency budget: <500ms. Returns 200 even on bad input (CLAUDE.md rule 9).

import { sendPlainMessage } from "../_shared/telegram.ts";

interface EscalateBody {
  reason?: string;
  caller_number?: string;
  summary_so_far?: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { ok: false, reason: "method_not_allowed" });
  }

  let body: EscalateBody = {};
  try { body = await req.json(); } catch { /* tolerate bad json */ }

  const target = Deno.env.get("MANAGER_ESCALATION_PHONE") ?? null;
  const chatId = Deno.env.get("TELEGRAM_MANAGER_CHAT_ID") ?? null;
  const reason = (body.reason ?? "asked_for_manager").trim();

  console.log({ event: "escalate_call", reason, has_target: !!target, has_caller: !!body.caller_number });

  if (chatId) {
    await sendPlainMessage(chatId, formatTelegram(reason, target, body.caller_number, body.summary_so_far));
  } else {
    console.warn("escalate_no_chat_id");
  }

  return json(200, {
    ok: true,
    action: target ? "transfer" : "callback",
    target_number: target,
    say: target
      ? "I'm transferring you to a staff member now — please stay on the line."
      : "I'll have someone from the team call you right back.",
    end_call: true,
  });
});

function formatTelegram(reason: string, target: string | null, caller?: string, summary?: string): string {
  return [
    "<b>🚨 URGENT — CALL ESCALATED</b>",
    `Reason: ${esc(REASONS[reason] ?? reason)}`,
    caller ? `Caller: ${esc(caller)}` : "",
    target ? `Redirecting to: ${esc(target)}` : "<i>No redirect target configured.</i>",
    "",
    `Context: ${esc(summary ?? "(caller asked for manager — no details yet)")}`,
    "",
    target ? "<i>The call should be ringing your phone now.</i>" : "<i>Call the caller back — Maya could not transfer.</i>",
  ].filter(Boolean).join("\n");
}

const REASONS: Record<string, string> = {
  asked_for_manager: "Caller asked for manager",
  live_order: "Live Zomato/Swiggy order",
  loop_fallback: "AI could not understand (loop)",
};

function esc(s: string): string {
  return String(s).replace(/[<>&]/g, (c) => c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;");
}

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

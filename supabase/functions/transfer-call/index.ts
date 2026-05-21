// transfer-call — Ringg on-call tool target. Triggers a blind transfer of the
// active call to a manager phone number via Plivo's API.
//
// Flow:
//   Ringg agent invokes transfer_call → this endpoint
//     → POST api.plivo.com/.../Call/{CallUUID}/ with aleg_url pointing to /transfer-xml
//     → Plivo fetches /transfer-xml which returns <Response><Dial>+91...</Dial></Response>
//     → Plivo dials the manager, bridges the caller in, AI agent drops
//
// Required Supabase secrets:
//   PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN, MANAGER_ESCALATION_PHONE

import { normalizePhone } from "../_shared/phone.ts";

const PLIVO_API_BASE = "https://api.plivo.com/v1/Account";

interface RequestBody {
  call_uuid?: string;        // Plivo's CallUUID for the active call
  reason?: string;           // Free-text reason (manager_request, complaint, etc.) — for logging
  target_number?: string;    // Optional override; defaults to TBDC_MANAGER_PHONE_E164
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return j(405, { ok: false, reason: "method_not_allowed" });

  let body: RequestBody;
  try { body = await req.json(); } catch { return j(200, { ok: false, reason: "bad_json" }); }

  const callUuid = String(body.call_uuid ?? "").trim();
  if (!callUuid) {
    console.error("transfer_call_missing_uuid");
    return j(200, { ok: false, reason: "missing_call_uuid" });
  }

  const authId = Deno.env.get("PLIVO_AUTH_ID") ?? "";
  const authToken = Deno.env.get("PLIVO_AUTH_TOKEN") ?? "";
  const defaultTarget = Deno.env.get("MANAGER_ESCALATION_PHONE") ?? "";
  if (!authId || !authToken) {
    console.error("transfer_call_missing_plivo_secrets");
    return j(500, { ok: false, reason: "server_misconfigured" });
  }

  const target = normalizePhone(body.target_number ?? defaultTarget) ?? defaultTarget;
  if (!target) {
    console.error("transfer_call_missing_target");
    return j(200, { ok: false, reason: "no_target_number" });
  }

  // Build the aleg_url Plivo will fetch to learn what to do with the redirected leg.
  // It returns Plivo XML that says <Dial>+91...</Dial>.
  const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const alegUrl = `${projectUrl}/functions/v1/transfer-xml?to=${encodeURIComponent(target)}`;

  const plivoUrl = `${PLIVO_API_BASE}/${authId}/Call/${encodeURIComponent(callUuid)}/`;
  const basicAuth = btoa(`${authId}:${authToken}`);

  console.log({ event: "transfer_call_starting", call_uuid: callUuid, target, reason: body.reason });

  const resp = await fetch(plivoUrl, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicAuth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ legs: "aleg", aleg_url: alegUrl, aleg_method: "GET" }),
  });

  const respText = await resp.text();
  // Plivo returns 202 on accepted transfer. Log the full body either way so we can
  // see whether Plivo actually accepted the transfer or silently no-op'd it. Plivo's
  // body often contains { "api_id": "...", "message": "..." } even on 2xx.
  console.log({ event: "transfer_call_plivo_response", status: resp.status, body: respText });

  if (!resp.ok) {
    console.error("transfer_call_plivo_err", { status: resp.status, body: respText });
    return j(200, { ok: false, reason: "plivo_error", status: resp.status, detail: respText.slice(0, 200) });
  }

  console.log({ event: "transfer_call_succeeded", call_uuid: callUuid, target });
  return j(200, { ok: true, transferred_to: target, plivo_response: respText.slice(0, 200) });
});

function j(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

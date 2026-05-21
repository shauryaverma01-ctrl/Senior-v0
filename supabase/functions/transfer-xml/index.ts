// transfer-xml — Plivo XML responder. Plivo fetches this URL after transfer-call
// flips the aleg destination. Returns Plivo XML telling Plivo to dial the manager.
//
// URL: /functions/v1/transfer-xml?to=+919876543210
// Returns:
//   <?xml version="1.0" encoding="UTF-8"?>
//   <Response>
//     <Dial timeout="25" timeLimit="600">
//       <Number>+919876543210</Number>
//     </Dial>
//   </Response>
//
// timeout=25s: how long to ring manager before giving up
// timeLimit=600s: 10-minute cap on the bridged conversation
//
// Important: this endpoint must NOT require auth — Plivo fetches it without bearer tokens.
// The deploy script uses --no-verify-jwt so Supabase doesn't enforce JWT either.

import { normalizePhone } from "../_shared/phone.ts";

function esc(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({"<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;","'":"&apos;"})[c]!);
}

Deno.serve((req) => {
  const url = new URL(req.url);
  const rawTo = url.searchParams.get("to") ?? "";
  const to = normalizePhone(rawTo) ?? rawTo;

  if (!to || !/^\+\d{6,15}$/.test(to)) {
    console.error("transfer_xml_bad_to", { rawTo });
    // Return a hangup so the call ends cleanly instead of leaving the caller in limbo.
    return xml(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
  }

  // callerId is REQUIRED for outbound dials in India — many carriers silently reject
  // the call without one. We use the Plivo number our agent is registered on.
  const callerId = Deno.env.get("PLIVO_CALLER_ID") ?? "+918035016712";

  // After Plivo finishes the <Dial> (whether the manager answered or not), it POSTs
  // to the action URL below. That endpoint speaks an apology if no one picked up,
  // or just hangs up cleanly if the bridge happened.
  const projectUrl = Deno.env.get("SUPABASE_URL") ?? "https://xslbbnbsyuklayewuhsc.supabase.co";
  const actionUrl = `${projectUrl}/functions/v1/transfer-fallback`;

  console.log({ event: "transfer_xml_dialing", to, callerId, actionUrl });
  // 15s timeout is intentional: TBDC's PBX conditional-forward to Maya fires at ~20s.
  // We must give up dialing BEFORE that, otherwise Plivo sees the PBX answer (forwarding)
  // as a successful bridge and bounces the customer back to Maya — infinite loop.
  // 15s = ~3 rings, enough for a present manager; falls through to transfer-fallback
  // (apology + hangup) if not picked up.
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="15" timeLimit="600" callerId="${esc(callerId)}" hangupOnStar="false" action="${esc(actionUrl)}" method="POST">
    <Number>${esc(to)}</Number>
  </Dial>
</Response>`;
  return xml(body);
});

function xml(s: string): Response {
  return new Response(s, { status: 200, headers: { "Content-Type": "application/xml" } });
}

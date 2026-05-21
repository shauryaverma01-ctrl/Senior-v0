// transfer-fallback — Plivo Dial action target.
// Plivo POSTs here AFTER the <Dial> verb finishes (either manager answered and
// then hung up, or the dial timed out / failed). We branch on DialStatus:
//   - "completed" → manager answered. Call already happened. Just hang up cleanly.
//   - anything else (no-answer / busy / failed / canceled) → caller is still on the
//     line. Apologize and hang up. Post-call webhook will fire the proper missed-call
//     Telegram alert separately.
//
// This is the only safety net for the case where Maya escalates and the manager
// doesn't pick up. Without it, the caller hears dead air for 30 seconds.
//
// Wired by transfer-xml/index.ts via <Dial action="…/transfer-fallback" method="POST">.

const APOLOGY = "Sorry, our team is unable to take your call right now. We'll call you back shortly. Thank you for your patience.";

Deno.serve(async (req) => {
  // Plivo sends form-encoded params (application/x-www-form-urlencoded), not JSON.
  let dialStatus = "unknown";
  let dialHangupCause = "";
  let dialBLegDuration = "0";
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const body = await req.text();
      const params = new URLSearchParams(body);
      dialStatus = params.get("DialStatus") ?? "unknown";
      dialHangupCause = params.get("DialHangupCause") ?? "";
      dialBLegDuration = params.get("DialBLegDuration") ?? "0";
    } else {
      // Some Plivo configs POST query params; try URL fallback.
      const url = new URL(req.url);
      dialStatus = url.searchParams.get("DialStatus") ?? dialStatus;
    }
  } catch (e) {
    console.error("transfer_fallback_parse_err", e);
  }

  console.log({ event: "transfer_fallback_hit", dialStatus, dialHangupCause, dialBLegDuration });

  if (dialStatus === "completed") {
    // Manager answered + caller talked + one side hung up. Nothing more to do.
    return xml(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
  }

  // Manager didn't pick up — speak the apology to the still-connected caller, then hang up.
  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak voice="WOMAN" language="en-IN">${escapeXml(APOLOGY)}</Speak>
  <Hangup/>
</Response>`);
});

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({"<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;","'":"&apos;"})[c]!);
}

function xml(s: string): Response {
  return new Response(s, { status: 200, headers: { "Content-Type": "application/xml" } });
}

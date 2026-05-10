// lookup-guest — Zoronal pre-call hook target.
// POST { phone_e164, restaurant_id } → 200 GuestContext.
// Latency budget: <200ms (Zoronal will fall through to a neutral greeting on timeout).
// See SENIOR_V0_STRATEGY.html section 21, flow F1 steps 3–5.

import { getGuestContext } from "../_shared/guests.ts";

interface LookupBody {
  phone_e164?: string;
  restaurant_id?: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, reason: "method_not_allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: LookupBody;
  try {
    body = await req.json();
  } catch {
    return json(200, { ok: false, known: false, reason: "bad_json" });
  }

  const phone = (body.phone_e164 ?? "").trim();
  const restaurantId = (body.restaurant_id ?? "").trim();

  if (!phone || !restaurantId) {
    console.log({ event: "lookup_guest_missing_fields", phone: !!phone, restaurantId: !!restaurantId });
    return json(200, { ok: false, known: false, reason: "missing_fields" });
  }

  const ctx = await getGuestContext(phone, restaurantId);
  console.log({ event: "lookup_guest_done", known: ctx.known, restaurantId });
  return json(200, { ok: true, ...ctx });
});

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

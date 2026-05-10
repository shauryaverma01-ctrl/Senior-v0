// check-capacity — during-call tool. Forgiving on input formats.
// Accepts dates as YYYY-MM-DD, "tomorrow", "saturday", etc.
// Accepts times as HH:MM, "8 PM", "8:00 PM", etc.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://esm.sh/zod@3.23.8";
import { istDayOfWeek, parseTimeHHMM, formatHHMM } from "../_shared/time.ts";
import { normalizeDate, normalizeTime } from "../_shared/parse-payload.ts";

const Body = z.object({
  date: z.string().min(1),                                 // forgiving — we normalize below
  time: z.string().min(1),
  party_size: z.coerce.number().int().min(1).max(20),
  restaurant_id: z.string().uuid().default("00000000-0000-0000-0000-000000000001"),
});

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  const t0 = performance.now();
  try {
    if (req.method !== "POST") return j({ ok: false, error: "method" }, 405);
    const bodyJson = await req.json().catch(() => null);
    console.log({ event: "check_capacity_received", body: bodyJson });

    const parsed = Body.safeParse(bodyJson);
    if (!parsed.success) {
      console.warn("check_capacity_bad_input", parsed.error.issues);
      // Return a soft "unknown" so Maya doesn't fabricate.
      return j({
        ok: false, available: null, reason: "bad_input",
        message: "Please confirm the date and time with the customer and try again.",
      });
    }

    const date = normalizeDate(parsed.data.date) ?? parsed.data.date;
    const time = normalizeTime(parsed.data.time) ?? parsed.data.time;
    const { party_size, restaurant_id } = parsed.data;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      console.warn("check_capacity_unparseable_date", { input: parsed.data.date });
      return j({
        ok: false, available: null, reason: "unclear_date",
        message: "Could not parse the date. Please confirm with the customer and the manager will check availability.",
      });
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
      console.warn("check_capacity_unparseable_time", { input: parsed.data.time });
      return j({
        ok: false, available: null, reason: "unclear_time",
        message: "Could not parse the time. Please confirm with the customer and the manager will check availability.",
      });
    }

    const dow = istDayOfWeek(date);
    const t = parseTimeHHMM(time);

    // Weekend walk-in rule (Sat/Sun before 13:00 IST)
    if ((dow === "saturday" || dow === "sunday") && t.ok && t.hh! < 13) {
      console.log({
        event: "check_capacity", date, time, party_size,
        available: false, reason: "weekend_walk_in_only",
        ms: Math.round(performance.now() - t0),
      });
      return j({
        ok: true, available: false,
        reason: "weekend_walk_in_only",
        message: "Saturday/Sunday before 1 PM is walk-in only.",
        alternate_slots: ["13:00", "13:30", "14:00"],
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: caps, error: capsErr } = await sb
      .from("capacity_caps")
      .select("*")
      .eq("restaurant_id", restaurant_id);
    if (capsErr) throw capsErr;

    const cap =
      caps?.find(
        (c: any) =>
          c.day_of_week === dow &&
          time >= c.slot_start &&
          time <= c.slot_end,
      ) ?? caps?.find((c: any) => c.day_of_week === "default");
    const max = cap?.max_bookings ?? 12;

    const { count, error: cntErr } = await sb
      .from("reservations")
      .select("*", { count: "exact", head: true })
      .eq("restaurant_id", restaurant_id)
      .eq("booking_date", date)
      .eq("booking_time", time)
      .in("status", ["pending", "confirmed", "auto_confirmed"]);
    if (cntErr) throw cntErr;

    const available = (count ?? 0) < max;
    const alternate_slots = available ? [] : suggestAlternates(t.hh!, t.mm!);

    console.log({
      event: "check_capacity",
      date, time, party_size, available,
      count: count ?? 0, max,
      ms: Math.round(performance.now() - t0),
    });

    return j({ ok: true, available, alternate_slots });
  } catch (e) {
    console.error("check_capacity_err", String(e));
    return j({
      ok: false, available: null, reason: "system_error",
      message: "Our system is having a brief issue. Please collect the booking details and tell the customer the manager will confirm and call back.",
    });
  }
});

function suggestAlternates(hh: number, mm: number): string[] {
  const out: string[] = [];
  for (const dm of [-30, 30, 60]) {
    let h = hh, m = mm + dm;
    while (m < 0) { h -= 1; m += 60; }
    while (m >= 60) { h += 1; m -= 60; }
    if (h >= 7 && h <= 22) out.push(formatHHMM(h, m));
  }
  return out;
}

// check-capacity — during-call tool. Zoronal POSTs here when Maya has date + time + party_size.
// Returns {ok, available, reason?, alternate_slots?}. <300ms target.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://esm.sh/zod@3.23.8";
import {
  istDayOfWeek,
  parseTimeHHMM,
  formatHHMM,
} from "../_shared/time.ts";

const Body = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "time must be HH:MM"),
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
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success)
      return j({ ok: false, error: "bad_input", issues: parsed.error.issues }, 400);

    const { date, time, party_size, restaurant_id } = parsed.data;
    const dow = istDayOfWeek(date);
    const t = parseTimeHHMM(time);
    if (!t.ok) return j({ ok: false, error: "bad_time" }, 400);

    // Weekend walk-in rule (Sat/Sun before 13:00 IST)
    if ((dow === "saturday" || dow === "sunday") && t.hh! < 13) {
      console.log({
        event: "check_capacity",
        date, time, party_size, available: false,
        reason: "weekend_walk_in_only",
        ms: Math.round(performance.now() - t0),
      });
      return j({
        ok: true,
        available: false,
        reason: "weekend_walk_in_only",
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
    return j({ ok: false, error: "internal" }, 500);
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

// Tool stubs — simulate the responses that Zoronal's check_capacity tool would
// produce, so the simulator can exercise Maya's tool-use logic without hitting
// the real Edge Function. Per-scenario overrides allow forcing specific paths
// (capacity-full, weekend walk-in, system error) for targeted testing.

export interface CapacityResult {
  available: boolean | null;
  reason?: string;
  alternate_slots?: string[];
}

// Forced outcomes per scenario id. Used to drive specific evaluation paths.
const SCENARIO_OVERRIDES: Record<string, CapacityResult> = {
  "RESV-010": { available: false, alternate_slots: ["20:00", "21:30"] },
  "RESV-011": { available: false, reason: "weekend_walk_in_only" },
  "EDGE-009": { available: null, reason: "system_error" },
  "EDGE-014": { available: false, alternate_slots: ["22:00"] },
};

interface CapacityArgs {
  booking_date?: string;
  date?: string;
  booking_time?: string;
  time?: string;
  party_size?: number | string;
}

export function checkCapacityStub(
  args: CapacityArgs,
  scenarioId: string,
): CapacityResult {
  if (SCENARIO_OVERRIDES[scenarioId]) {
    return SCENARIO_OVERRIDES[scenarioId];
  }

  const partySize = Number(args.party_size ?? 0);
  const time = String(args.booking_time ?? args.time ?? "").trim();

  // Group above the v5 escalation threshold should not even reach the tool —
  // but if it does, treat as unavailable so Maya escalates.
  if (partySize >= 16) {
    return { available: false, reason: "group_too_large_for_tool" };
  }

  // Out-of-hours guard: anything that parses to before 7 AM or after 22:30 is unavailable.
  const hhmm = parseTimeLoose(time);
  if (hhmm !== null) {
    if (hhmm < 7 * 60 || hhmm > 22 * 60 + 30) {
      return { available: false, reason: "outside_service_hours" };
    }
  }

  return { available: true };
}

// Parse times like "20:00", "8 PM", "8:30 PM", "8" → minutes-since-midnight.
function parseTimeLoose(raw: string): number | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();

  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = Number(m24[1]);
    const m = Number(m24[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m < 60) return h * 60 + m;
  }

  const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (m12) {
    let h = Number(m12[1]);
    const m = Number(m12[2] ?? "0");
    const ampm = m12[3];
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return h * 60 + m;
  }

  return null;
}

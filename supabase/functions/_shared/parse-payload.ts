// THE quarantine zone for Zoronal payload shapes.
// All Zoronal-specific keys live here. Business code consumes InternalCallEvent only.

import type { InternalCallEvent } from "./types.ts";
import { istDateString, istDayOfWeek } from "./time.ts";

const BLUE_DOOR_RESTAURANT_ID = "00000000-0000-0000-0000-000000000001";

export function parseZoronalPayload(raw: any): InternalCallEvent | null {
  if (!raw || !raw.call_id) return null;

  const fields = extractFields(raw);
  const caller = extractCaller(raw);
  const summary = String(raw.summary ?? "");

  // Try fields first; fall back to extracting from summary text
  const dateRaw = nonEmpty(fields.booking_date) ?? extractDateFromSummary(summary);
  const timeRaw = nonEmpty(fields.booking_time) ?? extractTimeFromSummary(summary);

  return {
    call_id: String(raw.call_id),
    restaurant_id: BLUE_DOOR_RESTAURANT_ID,
    caller_number: caller,
    started_at: raw.started_at ?? new Date().toISOString(),
    ended_at: raw.ended_at ?? new Date().toISOString(),
    duration_seconds: Number(raw.duration_seconds ?? 0),
    intent: normalizeIntent(fields.intent, summary, raw.qualification_result),
    summary: raw.summary,
    transcript_url: raw.transcript_url,
    audio_url: raw.audio_url,
    customer_name: nonEmpty(fields.customer_name),
    customer_phone: nonEmpty(fields.customer_phone) ?? caller,
    party_size: toInt(fields.party_size) ?? extractPartyFromSummary(summary),
    booking_date: normalizeDate(dateRaw),
    booking_time: normalizeTime(timeRaw),
    special_requests: nonEmpty(fields.special_requests),
    direct_discount: detectDiscount(fields, summary),
  };
}

function extractFields(raw: any): Record<string, any> {
  if (raw.data_collected && typeof raw.data_collected === "object") {
    return raw.data_collected;
  }
  const out: Record<string, any> = {};
  const arr = raw.collected_data?.[0]?.collected_fields ?? [];
  for (const f of arr) {
    const k = f.field_name ?? f.id;
    if (k) out[k] = f.field_value ?? f.value;
  }
  return out;
}

function extractCaller(raw: any): string {
  const cd = raw.contact_details;
  if (cd?.phone) {
    const cc = String(cd.country_code ?? "").replace(/\s+/g, "");
    const ph = String(cd.phone).replace(/\s+/g, "");
    return cc.startsWith("+") ? `${cc}${ph}` : `+${cc}${ph}`.replace(/^\+\+/, "+");
  }
  return raw.caller_number ?? "";
}

function normalizeIntent(rawIntent: any, summary?: string, qual?: any): string {
  const s = `${rawIntent ?? ""} ${summary ?? ""}`.toLowerCase();
  if (/complaint|bad experience|cancel my|cancellation request|modify my booking/.test(s)) return "escalation";
  if (qual?.booking_was_done_successfully === true) return "reservation";
  if (/reservation|booking|table for|book a table/.test(s)) return "reservation";
  if (/(faq|enquiry|inquiry|question about|hours\?|menu\?)/.test(s)) return "faq";
  return "incomplete";
}

// ── Date normalization — handles many natural forms ─────────────────
const WEEKDAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];

function todayParts(): { y: number; m: number; d: number; dow: number } {
  const today = istDateString(); // dynamic — always today in IST
  const [y, m, d] = today.split("-").map(Number);
  const dow = WEEKDAYS.indexOf(istDayOfWeek(today));
  return { y, m, d, dow };
}

function fmtDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}

function addDays(y: number, m: number, d: number, n: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return fmtDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function normalizeDate(input: any): string | undefined {
  if (!input) return undefined;
  const s = String(input).trim().toLowerCase();
  if (!s) return undefined;

  const t = todayParts();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // "today" / "tonight"
  if (/^(today|tonight)\b/.test(s)) return istDateString();
  // "tomorrow"
  if (/\btomorrow\b/.test(s)) return addDays(t.y, t.m, t.d, 1);
  // "day after tomorrow"
  if (/\bday after tomorrow\b/.test(s)) return addDays(t.y, t.m, t.d, 2);
  // "yesterday"
  if (/\byesterday\b/.test(s)) return addDays(t.y, t.m, t.d, -1);

  // weekday names: "saturday", "this saturday", "next saturday"
  for (let i = 0; i < 7; i++) {
    const name = WEEKDAYS[i];
    if (new RegExp(`\\b${name}\\b`).test(s)) {
      let delta = (i - t.dow + 7) % 7;
      if (delta === 0) delta = 7; // "saturday" while today is saturday → next saturday
      if (/\bnext\b/.test(s) && delta < 7) delta += 7;
      return addDays(t.y, t.m, t.d, delta);
    }
  }

  // "May 9" / "9 May" / "9th of May" / "May 9th"
  for (let i = 0; i < 12; i++) {
    const month = MONTHS[i];
    const pattern1 = new RegExp(`\\b${month}\\s+(\\d{1,2})\\b`);  // May 9
    const pattern2 = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${month}\\b`); // 9th of May
    let m = pattern1.exec(s) ?? pattern2.exec(s);
    if (m) {
      const day = parseInt(m[1], 10);
      if (day >= 1 && day <= 31) return fmtDate(t.y, i + 1, day);
    }
  }

  // "the 9th" / "9th" alone — assume this month, future or +1 month
  const ordinal = /\bthe\s+(\d{1,2})(?:st|nd|rd|th)?\b/.exec(s) ?? /^(\d{1,2})(?:st|nd|rd|th)$/.exec(s);
  if (ordinal) {
    const day = parseInt(ordinal[1], 10);
    if (day >= 1 && day <= 31) {
      const candidate = fmtDate(t.y, t.m, day);
      if (candidate >= istDateString()) return candidate;
      // past date this month → assume next month
      const nextM = t.m === 12 ? 1 : t.m + 1;
      const nextY = t.m === 12 ? t.y + 1 : t.y;
      return fmtDate(nextY, nextM, day);
    }
  }

  // YYYY/MM/DD or DD/MM/YYYY (Indian convention)
  const slash = /^(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})$/.exec(s);
  if (slash) {
    const a = parseInt(slash[1], 10);
    const b = parseInt(slash[2], 10);
    const c = parseInt(slash[3], 10);
    if (a > 31) return fmtDate(a, b, c);          // YYYY/MM/DD
    if (c > 31) return fmtDate(c, b, a);          // DD/MM/YYYY
  }

  return undefined; // give up
}

export function normalizeTime(input: any): string | undefined {
  if (input === null || input === undefined) return undefined;
  const s = String(input).trim();
  if (!s) return undefined;

  // HH:MM 24h
  let m = /^(\d{1,2}):(\d{2})\s*$/.exec(s);
  if (m) {
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
  }
  // 12h with AM/PM
  m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\s*$/i.exec(s);
  if (m) {
    let hh = parseInt(m[1], 10);
    const mm = m[2] ? parseInt(m[2], 10) : 0;
    const isPm = /p/i.test(m[3]);
    if (isPm && hh < 12) hh += 12;
    if (!isPm && hh === 12) hh = 0;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  // "8 o'clock"
  m = /^(\d{1,2})\s*o'?clock\s*$/i.exec(s);
  if (m) {
    const hh = parseInt(m[1], 10);
    return `${String(hh).padStart(2, "0")}:00`;
  }
  return undefined;
}

// ── Summary fallbacks — when structured fields are empty ─────────────
function extractDateFromSummary(s: string): string | undefined {
  if (!s) return undefined;
  const lower = s.toLowerCase();
  // Try in order of specificity
  for (const probe of [
    /\b(tomorrow|today|tonight|day after tomorrow)\b/,
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b/,
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
    /\b(?:on\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/,
    /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december)/,
  ]) {
    const m = probe.exec(lower);
    if (m) {
      const norm = normalizeDate(m[0]);
      if (norm) return norm;
    }
  }
  return undefined;
}

function extractTimeFromSummary(s: string): string | undefined {
  if (!s) return undefined;
  const m = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/i.exec(s) ??
            /\b(\d{1,2}):(\d{2})\b/.exec(s);
  return m ? normalizeTime(m[0]) : undefined;
}

function extractPartyFromSummary(s: string): number | undefined {
  if (!s) return undefined;
  const m = /\b(?:party of|table for|for)\s+(\d{1,2})\b/i.exec(s);
  return m ? parseInt(m[1], 10) : undefined;
}

function nonEmpty(v: any): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

function toInt(v: any): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = parseInt(String(v).replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
}

function detectDiscount(fields: Record<string, any>, summary?: string): boolean {
  const haystack = `${summary ?? ""} ${fields.special_requests ?? ""}`.toLowerCase();
  return /15\s*%|discount|direct line/.test(haystack);
}

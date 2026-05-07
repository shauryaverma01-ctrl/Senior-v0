// All time math goes through this file. IST = Asia/Kolkata = UTC+5:30 (no DST).
// Never use `new Date()` directly elsewhere in the codebase.

export function nowIST(): Date {
  const now = new Date();
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
}

export function istDateString(d: Date = nowIST()): string {
  return d.toISOString().slice(0, 10);
}

export function istDayOfWeek(date: string): string {
  // YYYY-MM-DD treated as IST midnight → returns 'sunday'..'saturday'
  const d = new Date(`${date}T00:00:00+05:30`);
  return [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ][d.getUTCDay()];
}

export function parseTimeHHMM(s: string): {
  ok: boolean;
  hh?: number;
  mm?: number;
} {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim());
  if (!m) return { ok: false };
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return { ok: false };
  return { ok: true, hh, mm };
}

export function formatHHMM(hh: number, mm: number): string {
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function slaDeadline(bookingDate: string): Date {
  // 30 min for same-day, 4 hours otherwise. Returns UTC Date.
  const today = istDateString();
  const isSameDay = bookingDate === today;
  const ms = isSameDay ? 30 * 60 * 1000 : 4 * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}

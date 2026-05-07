// Normalize Indian phone numbers to E.164: +91XXXXXXXXXX
// Returns null on inputs we cannot confidently normalize.

export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = String(input).replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 10) return `+91${digits}`;
  // Already E.164 with leading +
  if (String(input).startsWith("+91") && digits.length === 12) return `+${digits}`;
  return null;
}

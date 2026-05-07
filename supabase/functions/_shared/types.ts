// Internal domain types. NEVER import Zoronal-shaped types here.
// All Zoronal-specific shapes live in parse-payload.ts only.

export interface InternalCallEvent {
  call_id: string;
  restaurant_id: string;
  caller_number: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  intent: "reservation" | "faq" | "escalation" | "incomplete" | string;
  summary?: string;
  transcript_url?: string;
  audio_url?: string;
  customer_name?: string;
  customer_phone?: string;
  party_size?: number;
  booking_date?: string; // YYYY-MM-DD (IST date)
  booking_time?: string; // HH:MM (24h)
  special_requests?: string;
  direct_discount?: boolean;
}

export interface CapacityResponse {
  ok: boolean;
  available: boolean;
  reason?: string;
  alternate_slots?: string[];
}

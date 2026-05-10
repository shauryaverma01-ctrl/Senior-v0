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

// Phone-keyed guest profile. Mirrors the guests table from 0002_guests.sql.
// See SENIOR_V0_STRATEGY.html section 21, flow F1 for the contract.
export interface Guest {
  id: string;
  restaurant_id: string;
  phone_e164: string;
  name: string | null;
  first_seen_at: string;
  last_seen_at: string;
  visit_count: number;
  tier: "new" | "regular" | "vip" | string;
  preferences: Record<string, unknown>;
  allergens: string[];
  occasions: { birthday?: string; anniversary?: string; [k: string]: unknown };
  notes: string | null;
  last_visit_summary: string | null;
  risk_flags: string[];
  consent_at: string | null;
  created_at: string;
  updated_at: string;
}

// Returned by getGuestContext() — the lookup result that the
// pre-call hook injects into the agent's system prompt.
export interface GuestContext {
  known: boolean;
  guest_id?: string;
  context?: string;                // pre-formatted 2-3 sentence block
  name?: string;
  tier?: string;
  visit_count?: number;
  allergens?: string[];
  occasions?: Record<string, string>;
  last_visit_summary?: string | null;
}

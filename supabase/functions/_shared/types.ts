// Internal domain types. NEVER import Zoronal-shaped types here.
// All Zoronal-specific shapes live in parse-payload.ts only.

export interface InternalCallEvent {
  call_id: string;
  restaurant_id: string;
  caller_number: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  intent: "reservation" | "faq" | "escalation" | "incomplete" | "vendor_lead" | "staff_lead" | "order_intake" | string;
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
  allergens?: string[];                    // e.g. ["peanut", "dairy"]
  preferences?: Record<string, unknown>;  // e.g. { seating: "window", dietary: "jain", dislikes: ["burgers"] }
  occasions?: Record<string, unknown>;    // e.g. { birthday: "2026-05-17", anniversary: "2026-06-01" }
  dislikes?: string[];                    // e.g. ["burgers", "spicy food"]
  key_points?: string[];                  // platform_analysis.key_points
  action_items?: string[];               // platform_analysis.action_items
  call_cost?: number;                    // raw.call_cost (credits)
  classification?: string;              // platform_analysis.classification
  guest_brief?: string;                 // client_analysis.guest_brief — 1-2 sentence human brief
  kitchen_note?: string;               // client_analysis.kitchen_note — one-line staff instruction
  language?: string;                   // client_analysis.language — english/hinglish/hindi
  guest_history?: {                    // from lookup_guest pre-call tool response
    known: boolean;
    visit_count?: number;
    last_visit_summary?: string;
    allergens?: string[];
    tier?: string;
  };
  // ── Vendor / staff lead fields (intent = vendor_lead / staff_lead) ──
  vendor_company?: string;             // client_analysis.company — vendor's company name
  vendor_offering?: string;            // client_analysis.offering — 1-line gist of pitch
  vendor_callback_number?: string;     // client_analysis.callback_number — vendor's preferred callback
  staff_role_interest?: string;        // client_analysis.role_interest — role they applied for
  staff_experience_note?: string;      // client_analysis.experience_note — years + last workplace
  staff_callback_number?: string;      // client_analysis.callback_number — applicant's preferred callback
  // ── Order intake fields (intent = order_intake) ──
  order_type?: "new_order" | "existing_order_issue";
  order_items?: string[];              // for new orders — what they want, free-form strings
  order_instructions?: string;         // special instructions ("no onions", allergy notes, delivery/pickup)
  order_issue?: string;                // for existing orders — 1-line gist of issue
  order_reference?: string;            // phone or order id used to place the existing order
  order_callback_number?: string;      // best callback number for this order
  caller_history?: {                   // from lookup_caller pre-call tool (multi-table)
    known: boolean;
    type?: "guest" | "vendor" | "staff";
    context?: string;
    last_interaction?: string;
  };
  // ── Transfer outcome (for escalation Telegram card) ──
  transfer_attempted?: boolean;        // was transfer_call invoked at all?
  transfer_succeeded?: boolean;        // did Plivo accept the transfer (ok=true)?
  transfer_reason?: string | null;     // reason value passed to transfer_call
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

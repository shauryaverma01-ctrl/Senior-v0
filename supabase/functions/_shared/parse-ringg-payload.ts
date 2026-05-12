// Vendor quarantine zone for RINGG payload shapes.
// Mirrors _shared/parse-payload.ts (which is Zoronal's quarantine).
// All Ringg-specific keys MUST live here. Business code consumes InternalCallEvent only.
//
// ⚠️ STUB — NOT YET IMPLEMENTED.
//
// To complete:
//  1. Set up a Ringg agent + DID and point its end-of-call webhook at
//     <project-ref>.supabase.co/functions/v1/ringg-webhook (after deploying).
//  2. Make a real test call. The stub returns null, which makes ringg-webhook
//     store the raw payload as calls.raw_payload with status="parse_failed".
//  3. Read that row from the DB, paste it into ./fixtures/ringg-sample-payload.json
//     (create the dir), and fill in the field extraction below.
//
// Until then, parseRinggPayload always returns null. ringg-webhook still returns
// 200 and stores the raw payload — safe to deploy, just doesn't write reservations.

import type { InternalCallEvent } from "./types.ts";
import { normalizeDate, normalizeTime } from "./parse-payload.ts";

const BLUE_DOOR_RESTAURANT_ID = "00000000-0000-0000-0000-000000000001";

export function parseRinggPayload(raw: any): InternalCallEvent | null {
  if (!raw) return null;

  // TODO(ringg-vendor): fill in once we have a sample payload from Ringg.
  //
  // Required fields on InternalCallEvent (see _shared/types.ts):
  //   call_id        ← Ringg's unique call ID (look for call_id / id / session_id)
  //   restaurant_id  ← derive from which Ringg agent/DID received the call
  //                    (for V0 hardcode BLUE_DOOR_RESTAURANT_ID like Zoronal does)
  //   caller_number  ← E.164 caller number (normalize via _shared/phone.ts in the caller)
  //   started_at, ended_at, duration_seconds
  //   intent         ← normalize Ringg's intent/outcome →
  //                    "reservation" | "faq" | "escalation" | "incomplete"
  //   summary, transcript_url, audio_url
  //   customer_name, customer_phone, party_size
  //   booking_date (YYYY-MM-DD IST) ← run through normalizeDate()
  //   booking_time (HH:MM 24h)      ← run through normalizeTime()
  //   special_requests, direct_discount
  //
  // Look at parse-payload.ts (Zoronal) for the pattern: extract structured fields,
  // then fall back to extracting from the summary text when fields are empty.

  console.error("parse_ringg_payload_not_implemented", {
    keys: raw && typeof raw === "object" ? Object.keys(raw).slice(0, 20) : typeof raw,
  });
  return null;
}

// Re-export the shared normalizers so future Ringg parser code can import from
// one place. These live in parse-payload.ts today; if Zoronal ever sunsets, move
// them into a vendor-neutral _shared/normalize.ts file.
export { normalizeDate, normalizeTime };

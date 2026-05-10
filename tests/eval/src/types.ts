// Eval harness — internal domain types.
// No vendor-specific shapes here. The simulator approximates Zoronal turn structure.

export type ScenarioCategory =
  | "reservation_basic"
  | "reservation_group"
  | "reservation_ambiguous"
  | "reservation_unavailable"
  | "trap_question"
  | "escalation"
  | "edge_case";

export interface ExpectedOutcome {
  intent: "reservation" | "faq" | "escalation" | "incomplete";
  party_size?: number;
  booking_date_relative?: string; // e.g. "today", "tomorrow", "this_friday"
  booking_time?: string;          // HH:MM
  customer_name?: string | "any"; // "any" means any non-empty name passes
  should_escalate?: boolean;
  must_call_tool?: boolean;
  must_refuse?: boolean;
  required_phrases?: string[];     // e.g. ["manager will call you back"]
  forbidden_phrases?: string[];    // e.g. ["₹", "halal", "GST"]
}

export interface Scenario {
  id: string;
  category: ScenarioCategory;
  description: string;
  customer_persona: string;
  customer_seed_message: string;   // first thing the customer says after Maya's greeting
  customer_followups?: string[];   // optional scripted follow-ups (otherwise simulator improvises)
  expected: ExpectedOutcome;
  notes?: string;
}

export interface Turn {
  role: "customer" | "maya" | "tool_result";
  content: string;
  tool_call?: {
    name: string;
    args: Record<string, unknown>;
  };
  timestamp: string;
}

export interface Transcript {
  scenario_id: string;
  turns: Turn[];
  ended_at: string;
  end_reason: "call_end_emitted" | "max_turns" | "customer_hangup" | "error";
  emitted_intent?: string;
  tool_calls: Array<{
    name: string;
    args: Record<string, unknown>;
    result: Record<string, unknown>;
  }>;
}

export interface DimensionScore {
  id: string;
  label: string;
  score: number;
  max: number;
  critical: boolean;
  reasoning: string;
  evidence?: string;
}

export interface ScenarioResult {
  scenario: Scenario;
  transcript: Transcript;
  scores: DimensionScore[];
  overall_pass: boolean;
  overall_percent: number;
  judge_summary: string;
  duration_ms: number;
}

export interface RunResult {
  run_id: string;
  started_at: string;
  ended_at: string;
  prompt_path: string;
  prompt_sha256: string;
  prompt_snapshot: string;
  scenarios_run: number;
  pass_rate: number;
  results: ScenarioResult[];
  baseline_run_id?: string;
}

export interface Rubric {
  version: string;
  description: string;
  dimensions: Array<{
    id: string;
    label: string;
    max: number;
    critical: boolean;
    description: string;
  }>;
  pass_threshold: {
    all_critical_pass: boolean;
    min_overall_percent: number;
  };
}

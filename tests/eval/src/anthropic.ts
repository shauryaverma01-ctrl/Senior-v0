// Thin Anthropic Messages API client. Stdlib fetch only — no deps.
// Honours MOCK_MODE=1 for offline testing (returns canned text).

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CallOptions {
  model: string;
  system: string;
  messages: AnthropicMessage[];
  max_tokens?: number;
  temperature?: number;
  // Optional debug tag, included in logs
  tag?: string;
}

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export async function callAnthropic(opts: CallOptions): Promise<string> {
  if (Deno.env.get("MOCK_MODE") === "1") {
    return mockResponse(opts);
  }

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY not set. Run: export ANTHROPIC_API_KEY=sk-ant-... or set MOCK_MODE=1 for offline run.",
    );
  }

  const body = {
    model: opts.model,
    max_tokens: opts.max_tokens ?? 1024,
    temperature: opts.temperature ?? 0.7,
    system: opts.system,
    messages: opts.messages,
  };

  const r = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": API_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Anthropic API ${r.status} (${opts.tag ?? "?"}): ${text}`);
  }

  const data = await r.json();
  const content: string = data?.content?.[0]?.text ?? "";
  return content.trim();
}

// Deterministic mock for offline / smoke-test runs.
function mockResponse(opts: CallOptions): string {
  const tag = opts.tag ?? "";
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");
  const userText = lastUser?.content ?? "";

  if (tag.startsWith("maya")) {
    if (userText.toLowerCase().includes("price") || userText.toLowerCase().includes("chef")) {
      return "I don't have that detail with me. Let me have the manager get back to you — what's the best number to reach you?";
    }
    if (userText.toLowerCase().includes("table") || userText.toLowerCase().includes("book")) {
      return "Sure — may I have your name, please?";
    }
    return 'Got it. <call_end intent="faq" />';
  }

  if (tag.startsWith("customer")) {
    return "Yes that works. Thanks. Bye.";
  }

  if (tag.startsWith("judge")) {
    return JSON.stringify({
      dimensions: [
        { id: "intent_classification", score: 1, max: 1, reasoning: "mock" },
        { id: "slot_extraction", score: 5, max: 5, reasoning: "mock" },
        { id: "ist_handling", score: 1, max: 1, reasoning: "mock" },
        { id: "tool_use", score: 1, max: 1, reasoning: "mock" },
        { id: "escalation_judgement", score: 1, max: 1, reasoning: "mock" },
        { id: "no_hallucination", score: 1, max: 1, reasoning: "mock" },
        { id: "closure", score: 1, max: 1, reasoning: "mock" },
        { id: "conversational_quality", score: 2, max: 3, reasoning: "mock" },
      ],
      summary: "Mock judge output. Set ANTHROPIC_API_KEY for real scoring.",
    });
  }

  return "[mock]";
}

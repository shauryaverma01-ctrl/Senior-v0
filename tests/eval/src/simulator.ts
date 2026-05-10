// Simulator — drives a single scenario as a turn-by-turn dialogue between
// a customer LLM (Haiku) and Maya (Sonnet, using docs/maya-prompt.md).
// Tool calls are intercepted and routed to tool-stubs.ts.

import type { Scenario, Transcript, Turn } from "./types.ts";
import { callAnthropic, type AnthropicMessage } from "./anthropic.ts";
import { checkCapacityStub } from "./tool-stubs.ts";

const MAX_TURNS = 12;
const CUSTOMER_MODEL = Deno.env.get("CUSTOMER_MODEL") ?? "claude-haiku-4-5-20251001";
const MAYA_MODEL = Deno.env.get("MAYA_MODEL") ?? "claude-sonnet-4-5";

const TOOL_USE_RE = /<tool_use\s+name="(\w+)"\s+args='([^']+)'\s*\/>/;
const CALL_END_RE = /<call_end\s+intent="(\w+)"\s*\/>/;

export async function simulateScenario(
  scenario: Scenario,
  mayaSystemPrompt: string,
  customerSystemPrompt: string,
): Promise<Transcript> {
  const turns: Turn[] = [];
  const toolCalls: Transcript["tool_calls"] = [];

  // Maya history: messages exchanged with Maya. The customer's lines are
  // "user" turns; Maya's lines and tool results are "assistant"/"user" pairs.
  const mayaHistory: AnthropicMessage[] = [];
  const customerHistory: AnthropicMessage[] = [];

  // Build the customer system prompt with persona + scripted followups.
  const customerSystemFinal = buildCustomerSystem(customerSystemPrompt, scenario);

  // Customer goes first with the seed message.
  let customerMessage = scenario.customer_seed_message;
  pushTurn(turns, "customer", customerMessage);
  customerHistory.push({ role: "assistant", content: customerMessage });

  let endReason: Transcript["end_reason"] = "max_turns";
  let emittedIntent: string | undefined;
  let followupCursor = 0;

  for (let turnIdx = 0; turnIdx < MAX_TURNS; turnIdx++) {
    // ---- Maya turn ----
    mayaHistory.push({ role: "user", content: customerMessage });
    let mayaText = await callAnthropic({
      model: MAYA_MODEL,
      system: mayaSystemPrompt,
      messages: mayaHistory,
      temperature: 0.5,
      max_tokens: 600,
      tag: `maya:${scenario.id}:t${turnIdx}`,
    });
    mayaHistory.push({ role: "assistant", content: mayaText });

    // Handle tool-use loop: Maya may emit multiple tool calls in one turn or
    // emit a tool call and then respond after seeing the result.
    let safety = 0;
    while (TOOL_USE_RE.test(mayaText) && safety < 3) {
      safety++;
      const m = mayaText.match(TOOL_USE_RE)!;
      const toolName = m[1];
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(m[2]);
      } catch {
        args = { raw: m[2] };
      }

      let result: Record<string, unknown>;
      if (toolName === "check_capacity") {
        result = checkCapacityStub(args as never, scenario.id) as never;
      } else {
        result = { error: `unknown_tool:${toolName}` };
      }

      pushTurn(turns, "maya", stripToolUse(mayaText));
      pushToolTurn(turns, toolName, args, result);
      toolCalls.push({ name: toolName, args, result });

      // Feed result back to Maya as a user message, ask it to continue.
      const toolFeedback = `<tool_result name="${toolName}">${JSON.stringify(result)}</tool_result>`;
      mayaHistory.push({ role: "user", content: toolFeedback });
      mayaText = await callAnthropic({
        model: MAYA_MODEL,
        system: mayaSystemPrompt,
        messages: mayaHistory,
        temperature: 0.5,
        max_tokens: 600,
        tag: `maya:${scenario.id}:t${turnIdx}:after-tool`,
      });
      mayaHistory.push({ role: "assistant", content: mayaText });
    }

    pushTurn(turns, "maya", stripToolUse(mayaText));

    // Check for call end.
    const endMatch = mayaText.match(CALL_END_RE);
    if (endMatch) {
      emittedIntent = endMatch[1];
      endReason = "call_end_emitted";
      break;
    }

    // ---- Customer turn ----
    customerHistory.push({ role: "user", content: stripToolUse(mayaText) });
    customerMessage = await getCustomerReply(
      scenario,
      customerSystemFinal,
      customerHistory,
      followupCursor,
    );

    if (customerMessage === "[HANGUP]") {
      endReason = "customer_hangup";
      pushTurn(turns, "customer", "[HANGUP]");
      break;
    }

    pushTurn(turns, "customer", customerMessage);
    customerHistory.push({ role: "assistant", content: customerMessage });
    if (scenario.customer_followups && followupCursor < scenario.customer_followups.length) {
      followupCursor++;
    }
  }

  return {
    scenario_id: scenario.id,
    turns,
    ended_at: new Date().toISOString(),
    end_reason: endReason,
    emitted_intent: emittedIntent,
    tool_calls: toolCalls,
  };
}

async function getCustomerReply(
  scenario: Scenario,
  customerSystem: string,
  history: AnthropicMessage[],
  followupCursor: number,
): Promise<string> {
  // If there's a scripted follow-up, return it directly (no LLM call).
  const scripted = scenario.customer_followups?.[followupCursor];
  if (scripted !== undefined) {
    return scripted;
  }

  return callAnthropic({
    model: CUSTOMER_MODEL,
    system: customerSystem,
    messages: history,
    temperature: 0.8,
    max_tokens: 200,
    tag: `customer:${scenario.id}`,
  });
}

function buildCustomerSystem(base: string, scenario: Scenario): string {
  return `${base}

---

# YOUR PERSONA
${scenario.customer_persona}

# YOUR GOAL
${scenario.description}

# SCRIPTED FOLLOW-UPS (use in order, one per turn, when relevant)
${(scenario.customer_followups ?? []).map((f, i) => `${i + 1}. ${f}`).join("\n") || "(none — improvise per persona)"}
`;
}

function stripToolUse(text: string): string {
  return text.replace(TOOL_USE_RE, "").replace(CALL_END_RE, "").trim();
}

function pushTurn(turns: Turn[], role: Turn["role"], content: string): void {
  if (!content) return;
  turns.push({ role, content, timestamp: new Date().toISOString() });
}

function pushToolTurn(
  turns: Turn[],
  name: string,
  args: Record<string, unknown>,
  result: Record<string, unknown>,
): void {
  turns.push({
    role: "tool_result",
    content: JSON.stringify(result),
    tool_call: { name, args },
    timestamp: new Date().toISOString(),
  });
}

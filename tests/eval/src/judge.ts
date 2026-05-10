// Judge — sends transcript + scenario + rubric to Claude, gets back per-dimension scores.
// Robust to small JSON-format slips (code fences, leading prose).

import type {
  DimensionScore,
  Rubric,
  Scenario,
  ScenarioResult,
  Transcript,
} from "./types.ts";
import { callAnthropic } from "./anthropic.ts";

const JUDGE_MODEL = Deno.env.get("JUDGE_MODEL") ?? "claude-sonnet-4-5";

interface JudgeRaw {
  dimensions: Array<{
    id: string;
    score: number;
    max: number;
    reasoning: string;
    evidence?: string;
  }>;
  summary: string;
}

export async function judgeScenario(
  scenario: Scenario,
  transcript: Transcript,
  rubric: Rubric,
  judgeSystemPrompt: string,
): Promise<ScenarioResult> {
  const startedAt = Date.now();
  const userMessage = buildJudgeUserMessage(scenario, transcript, rubric);

  const raw = await callAnthropic({
    model: JUDGE_MODEL,
    system: judgeSystemPrompt,
    messages: [{ role: "user", content: userMessage }],
    temperature: 0.1,
    max_tokens: 2000,
    tag: `judge:${scenario.id}`,
  });

  const parsed = parseJudgeOutput(raw);
  const scores = mapToDimensionScores(parsed, rubric);
  const overallPercent = computePercent(scores);
  const allCriticalPass = scores
    .filter((s) => s.critical)
    .every((s) => s.score >= s.max);
  const overallPass = allCriticalPass &&
    overallPercent >= rubric.pass_threshold.min_overall_percent;

  return {
    scenario,
    transcript,
    scores,
    overall_pass: overallPass,
    overall_percent: overallPercent,
    judge_summary: parsed.summary,
    duration_ms: Date.now() - startedAt,
  };
}

function buildJudgeUserMessage(
  scenario: Scenario,
  transcript: Transcript,
  rubric: Rubric,
): string {
  const transcriptText = transcript.turns.map((t) => {
    if (t.role === "tool_result") {
      const args = t.tool_call ? JSON.stringify(t.tool_call.args) : "{}";
      return `[TOOL_CALL ${t.tool_call?.name ?? "?"} args=${args}] result=${t.content}`;
    }
    return `${t.role.toUpperCase()}: ${t.content}`;
  }).join("\n");

  const expected = JSON.stringify(scenario.expected, null, 2);

  return `# SCENARIO

id: ${scenario.id}
category: ${scenario.category}
description: ${scenario.description}
persona: ${scenario.customer_persona}

# EXPECTED OUTCOME
${expected}

${scenario.notes ? `# NOTES\n${scenario.notes}\n` : ""}

# TRANSCRIPT

${transcriptText}

end_reason: ${transcript.end_reason}
emitted_intent: ${transcript.emitted_intent ?? "(none)"}
tool_calls_made: ${transcript.tool_calls.length}

# RUBRIC

${rubric.dimensions.map((d) =>
    `- ${d.id} (max ${d.max}, ${d.critical ? "CRITICAL" : "non-critical"}): ${d.description}`
  ).join("\n")}

Score this call against the rubric. Return strict JSON per the format in your system prompt.`;
}

function parseJudgeOutput(raw: string): JudgeRaw {
  // Strip ```json ... ``` or ``` ... ``` if present.
  let cleaned = raw.trim();
  const fence = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) cleaned = fence[1].trim();

  // Find first { and last } if there's leading prose.
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  try {
    const obj = JSON.parse(cleaned) as JudgeRaw;
    if (!Array.isArray(obj.dimensions)) {
      throw new Error("missing dimensions");
    }
    return obj;
  } catch (err) {
    console.error("[judge] failed to parse output:", err, "\nraw:", raw.slice(0, 500));
    return {
      dimensions: [],
      summary: `Judge output unparseable. Raw: ${raw.slice(0, 200)}`,
    };
  }
}

function mapToDimensionScores(parsed: JudgeRaw, rubric: Rubric): DimensionScore[] {
  return rubric.dimensions.map((d) => {
    const found = parsed.dimensions.find((p) => p.id === d.id);
    if (!found) {
      return {
        id: d.id,
        label: d.label,
        score: 0,
        max: d.max,
        critical: d.critical,
        reasoning: "Judge did not return a score for this dimension.",
      };
    }
    return {
      id: d.id,
      label: d.label,
      score: clamp(found.score, 0, d.max),
      max: d.max,
      critical: d.critical,
      reasoning: found.reasoning ?? "",
      evidence: found.evidence,
    };
  });
}

function computePercent(scores: DimensionScore[]): number {
  const total = scores.reduce((a, s) => a + s.score, 0);
  const max = scores.reduce((a, s) => a + s.max, 0);
  if (max === 0) return 0;
  return Math.round((total / max) * 100);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));
}

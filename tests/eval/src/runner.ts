// Runner — entry point. Loads scenarios + Maya prompt, simulates each, judges,
// writes run artifacts (run.json, scorecard.csv, report.html, prompt-snapshot.md).
//
// Usage:
//   deno run --allow-all tests/eval/src/runner.ts \
//     --scenarios=reservations-baseline,trap-questions,edge-cases \
//     --prompt=docs/maya-prompt.md \
//     --out=tests/eval/runs \
//     [--baseline=tests/eval/runs/2026-05-08T1400] \
//     [--filter=RESV-001,TRAP-003] \
//     [--concurrency=3]

import type { Rubric, RunResult, Scenario, ScenarioResult } from "./types.ts";
import { simulateScenario } from "./simulator.ts";
import { judgeScenario } from "./judge.ts";
import { writeReport } from "./report.ts";

interface Cli {
  scenarios: string[];
  prompt: string;
  out: string;
  baseline?: string;
  filter?: string[];
  concurrency: number;
}

const REPO_ROOT = await findRepoRoot();

if (import.meta.main) {
  await main();
}

async function main(): Promise<void> {
  const cli = parseCli(Deno.args);
  console.log("[runner] cli:", cli);

  const rubric: Rubric = JSON.parse(
    await Deno.readTextFile(`${REPO_ROOT}/tests/eval/rubric.json`),
  );
  const customerSystem = await Deno.readTextFile(
    `${REPO_ROOT}/tests/eval/prompts/customer-simulator.md`,
  );
  const judgeSystem = await Deno.readTextFile(
    `${REPO_ROOT}/tests/eval/prompts/judge.md`,
  );

  const promptSnapshot = await Deno.readTextFile(`${REPO_ROOT}/${cli.prompt}`);
  const mayaSystem = extractMayaSystemPrompt(promptSnapshot);
  const promptSha = await sha256(mayaSystem);

  const scenarios = await loadScenarios(cli.scenarios, cli.filter);
  console.log(`[runner] loaded ${scenarios.length} scenarios`);
  if (scenarios.length === 0) {
    console.error("[runner] no scenarios to run. exiting.");
    Deno.exit(2);
  }

  const runId = nowSlug();
  const runDir = `${REPO_ROOT}/${cli.out}/${runId}`;
  await Deno.mkdir(runDir, { recursive: true });
  await Deno.writeTextFile(`${runDir}/prompt-snapshot.md`, promptSnapshot);

  const startedAt = new Date().toISOString();
  const results = await runWithConcurrency(scenarios, cli.concurrency, async (scenario) => {
    const tag = `${scenario.id}`;
    console.log(`[run] ${tag} simulating...`);
    try {
      const transcript = await simulateScenario(scenario, mayaSystem, customerSystem);
      console.log(`[run] ${tag} judging (${transcript.turns.length} turns, end=${transcript.end_reason})`);
      const result = await judgeScenario(scenario, transcript, rubric, judgeSystem);
      const verdict = result.overall_pass ? "PASS" : "FAIL";
      console.log(`[run] ${tag} ${verdict} ${result.overall_percent}%`);
      return result;
    } catch (err) {
      console.error(`[run] ${tag} ERROR:`, err);
      return errorResult(scenario, err, rubric);
    }
  });

  const endedAt = new Date().toISOString();
  const passCount = results.filter((r) => r.overall_pass).length;
  const passRate = results.length > 0 ? Math.round((passCount / results.length) * 100) : 0;

  const runResult: RunResult = {
    run_id: runId,
    started_at: startedAt,
    ended_at: endedAt,
    prompt_path: cli.prompt,
    prompt_sha256: promptSha,
    prompt_snapshot: promptSnapshot,
    scenarios_run: results.length,
    pass_rate: passRate,
    results,
    baseline_run_id: cli.baseline,
  };

  await Deno.writeTextFile(`${runDir}/run.json`, JSON.stringify(runResult, null, 2));

  let baseline: RunResult | undefined;
  if (cli.baseline) {
    try {
      baseline = JSON.parse(
        await Deno.readTextFile(`${REPO_ROOT}/${cli.baseline}/run.json`),
      );
    } catch (err) {
      console.warn("[runner] baseline not loadable:", err);
    }
  }

  await writeReport(runDir, runResult, rubric, baseline);

  console.log("\n=========================================");
  console.log(`Run ${runId}`);
  console.log(`Scenarios: ${results.length}`);
  console.log(`Pass rate: ${passRate}% (${passCount}/${results.length})`);
  console.log(`Prompt SHA: ${promptSha.slice(0, 12)}`);
  console.log(`Report:    ${runDir}/report.html`);
  console.log(`Scorecard: ${runDir}/scorecard.csv`);
  console.log(`Raw run:   ${runDir}/run.json`);
  console.log("=========================================\n");

  Deno.exit(passRate >= rubric.pass_threshold.min_overall_percent ? 0 : 1);
}

function extractMayaSystemPrompt(md: string): string {
  // Look for "## Prompt field" header followed by a fenced block.
  const idx = md.search(/^##\s+Prompt field/m);
  if (idx < 0) return md;
  const after = md.slice(idx);
  const fence = after.match(/```[\w-]*\s*\n([\s\S]*?)\n```/);
  if (fence && fence[1]) return fence[1].trim();
  return md;
}

async function loadScenarios(names: string[], filter?: string[]): Promise<Scenario[]> {
  const out: Scenario[] = [];
  for (const name of names) {
    const path = `${REPO_ROOT}/tests/eval/scenarios/${name}.json`;
    const data = JSON.parse(await Deno.readTextFile(path)) as Scenario[];
    out.push(...data);
  }
  if (filter && filter.length > 0) {
    const set = new Set(filter);
    return out.filter((s) => set.has(s.id));
  }
  return out;
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

function errorResult(scenario: Scenario, err: unknown, rubric: Rubric): ScenarioResult {
  const message = err instanceof Error ? err.message : String(err);
  const scores = rubric.dimensions.map((d) => ({
    id: d.id,
    label: d.label,
    score: 0,
    max: d.max,
    critical: d.critical,
    reasoning: `Run errored before judging: ${message}`,
  }));
  return {
    scenario,
    transcript: {
      scenario_id: scenario.id,
      turns: [],
      ended_at: new Date().toISOString(),
      end_reason: "error",
      tool_calls: [],
    },
    scores,
    overall_pass: false,
    overall_percent: 0,
    judge_summary: `Errored: ${message}`,
    duration_ms: 0,
  };
}

function parseCli(args: string[]): Cli {
  const map: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) {
        map[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        map[a.slice(2)] = args[i + 1] ?? "";
        i++;
      }
    }
  }
  return {
    scenarios: (map.scenarios ?? "reservations-baseline,trap-questions,edge-cases").split(","),
    prompt: map.prompt ?? "docs/maya-prompt.md",
    out: map.out ?? "tests/eval/runs",
    baseline: map.baseline || undefined,
    filter: map.filter ? map.filter.split(",") : undefined,
    concurrency: Number(map.concurrency ?? "3"),
  };
}

async function findRepoRoot(): Promise<string> {
  let dir = new URL(".", import.meta.url).pathname;
  for (let i = 0; i < 8; i++) {
    try {
      await Deno.stat(`${dir}/CLAUDE.md`);
      return dir.replace(/\/$/, "");
    } catch {
      dir = dir.replace(/\/$/, "").split("/").slice(0, -1).join("/") + "/";
      if (dir === "/" || dir === "//") break;
    }
  }
  return Deno.cwd();
}

function nowSlug(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

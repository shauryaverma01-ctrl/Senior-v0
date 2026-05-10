# Maya Eval Harness — `tests/eval/`

> **What this is.** A simulator that runs N test calls against Maya's prompt and
> scores each call against a rubric. Run after every prompt change. Catches
> regressions before they hit a real customer.
>
> **Why this exists.** Two reasons. (1) Maya's prompt changes weekly; without
> automated eval we can't tell whether a "tightening" actually made things
> better. (2) This is also DeepCall's MVP — voice-agent evaluation as a
> product. The same harness runs on customer voice agents in v1.

## Quickstart

```bash
# 1. Set your Anthropic key
export ANTHROPIC_API_KEY=sk-ant-...

# 2. Run the full suite (50 scenarios, ~3-5 min, ~$1-2 in API cost)
./scripts/run-eval.sh

# 3. Open the report
open tests/eval/runs/<latest>/report.html
```

Smoke-test offline (no API cost, returns canned scores):

```bash
MOCK_MODE=1 ./scripts/run-eval.sh --filter=RESV-001,TRAP-001
```

## What it does (one paragraph)

For each scenario, the harness spins up a **customer simulator** (Claude Haiku
playing the persona) that talks to **Maya** (Claude Sonnet using
`docs/maya-prompt.md`). When Maya emits a `<tool_use>` for `check_capacity`,
the harness intercepts it and feeds back a stub response — so the eval covers
tool-call decisions without needing the real backend. When the call ends, the
transcript goes to a **judge** (Claude Sonnet with the rubric) that scores
seven dimensions and writes a verdict. All transcripts + scores land in
`runs/<timestamp>/`.

## Scenario library (`scenarios/`)

| File | Count | Covers |
|---|---|---|
| `reservations-baseline.json` | 15 | Happy paths, ambiguous times, Hinglish, capacity-full, pre-given info |
| `trap-questions.json` | 20 | Off-card questions Maya must refuse vs on-card she must answer |
| `edge-cases.json` | 15 | Group >15, complaints, modifications, tool errors, hangups |

Add new scenarios by appending to the right file. Each scenario is a JSON
object — see `src/types.ts` for the `Scenario` interface.

## Rubric (`rubric.json`)

Seven dimensions, six of them critical:

1. **intent_classification** — did Maya pick the right intent?
2. **slot_extraction** — name, phone, party_size, date, time captured?
3. **ist_handling** — date/time normalized to IST?
4. **tool_use** — `check_capacity` called *before* confirming?
5. **escalation_judgement** — escalated when needed, didn't when not?
6. **no_hallucination** — no invented prices, chefs, policies, etc.?
7. **closure** — clean sign-off and `<call_end ... />`?
8. **conversational_quality** — natural flow, matches caller's language?

A run passes if **all critical dimensions pass** and **overall ≥ 80%**.

## CLI flags

| Flag | Default | Meaning |
|---|---|---|
| `--scenarios` | `reservations-baseline,trap-questions,edge-cases` | Comma-list of scenario files |
| `--prompt` | `docs/maya-prompt.md` | Path to Maya's prompt |
| `--filter` | (none) | Comma-list of scenario IDs to run only |
| `--baseline` | (none) | Path to a previous run dir; report will diff |
| `--concurrency` | `3` | Scenarios run in parallel |
| `--out` | `tests/eval/runs` | Where to write run artifacts |

Models can be swapped via env: `MAYA_MODEL`, `CUSTOMER_MODEL`, `JUDGE_MODEL`.

## Iterating Maya's prompt

```bash
# 1. Run baseline
./scripts/run-eval.sh
# -> tests/eval/runs/2026-05-09T1400/

# 2. Edit docs/maya-prompt.md

# 3. Re-run with diff
./scripts/run-eval.sh --baseline=tests/eval/runs/2026-05-09T1400
# -> report shows per-scenario delta vs baseline
```

The report's "delta" column tells you which scenarios newly pass/fail. That
loop is the entire point — you should not be eyeballing 50 conversations to
decide whether a prompt change was good.

## Run artifacts

Each run drops three files in `runs/<timestamp>/`:

- **`report.html`** — self-contained, demo-ready. Senior/DeepCall branded.
  Pass rate up top, dimension averages, expandable scenarios with full
  transcripts and per-dimension reasoning. Open in any browser; no external
  assets. **This is what you show investors.**
- **`scorecard.csv`** — one row per scenario, all rubric dimensions as
  columns. Drop into Sheets to track pass-rate trends across runs.
- **`run.json`** — raw machine-readable run data. Used by future runs as
  baseline.
- **`prompt-snapshot.md`** — the exact Maya prompt that was tested.
  Versions the prompt against the scorecard.

## May 21 demo path (DeepCall narrative)

When showing this to investors as the DeepCall product:

1. Open `report.html` from a recent run with ≥ 90% pass rate.
2. Click into a failed scenario. Show the transcript + the dimension that
   fired. Explain: "this is the rubric that catches a hallucination —
   without it, Maya could ship a prompt change that quietly invents prices."
3. Pull up the prompt-snapshot. Show how a one-line prompt edit moves the
   scorecard. "DeepCall is this — for any voice agent, in any vertical."

## Limitations (be honest)

- The simulator tests **prompt logic + tool-call decisions**, not STT/TTS or
  Zoronal-specific quirks. A prompt that scores 100% here can still fail on a
  real call due to accent or audio. Live-call mode is a planned v0.2.
- The customer simulator is a Claude impersonating personas; it's
  representative, not exhaustive. Real callers are weirder.
- Judge scores are LLM judgements; they can be wrong. Spot-check failed
  scenarios manually before trusting an aggregate. Run twice with different
  judges if a single result feels off.

## Adding a new dimension

1. Add to `rubric.json` (`dimensions[]`).
2. Append a paragraph to `prompts/judge.md` describing how to score it.
3. Re-run. The HTML/CSV pick it up automatically.

## Adding a new scenario

1. Append a JSON object to the appropriate file in `scenarios/`.
2. Use a unique ID prefix (`RESV-`, `TRAP-`, `EDGE-`, or invent your own).
3. If the scenario needs the tool to return a specific outcome (e.g.
   capacity-full), add an entry to `SCENARIO_OVERRIDES` in
   `src/tool-stubs.ts`.

---

*Owner: founder. Source of truth for Maya's evaluation. Last updated by the
eval harness build.*

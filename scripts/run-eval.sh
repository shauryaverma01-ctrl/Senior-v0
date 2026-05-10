#!/usr/bin/env bash
# Run the Maya eval harness. Wraps the Deno entry point with sane defaults.
#
# Usage:
#   ./scripts/run-eval.sh                                    # full suite
#   ./scripts/run-eval.sh --filter=RESV-001,TRAP-003         # specific scenarios
#   ./scripts/run-eval.sh --baseline=tests/eval/runs/PREV    # diff vs baseline
#   MOCK_MODE=1 ./scripts/run-eval.sh                        # offline smoke
#
# Env vars:
#   ANTHROPIC_API_KEY  required unless MOCK_MODE=1
#   MAYA_MODEL         default claude-sonnet-4-5
#   CUSTOMER_MODEL     default claude-haiku-4-5-20251001
#   JUDGE_MODEL        default claude-sonnet-4-5

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -z "${ANTHROPIC_API_KEY:-}" && "${MOCK_MODE:-}" != "1" ]]; then
  echo "ERROR: ANTHROPIC_API_KEY not set. Set it or use MOCK_MODE=1 for offline run." >&2
  exit 2
fi

exec deno run --allow-all tests/eval/src/runner.ts "$@"

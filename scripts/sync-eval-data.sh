#!/usr/bin/env bash
# Refresh the committed eval snapshot that the deployed dashboard reads.
#
# A deployment has no access to the machine that ran the eval suite, so this is
# how results get there: regenerate the exports in the seesaw checkout, then
# copy them into data/ to be committed.
#
# Run from the seesaw-web repo root.
set -euo pipefail

SEESAW="${SEESAW_REPO_DIR:-../seesaw}"
if [ ! -d "$SEESAW" ]; then
  echo "no seesaw checkout at $SEESAW — set SEESAW_REPO_DIR" >&2
  exit 1
fi

(
  cd "$SEESAW"
  python -m seesaw.cli eval --list --json outputs/eval_catalog.json >/dev/null
  python -m seesaw.cli fixtures --json outputs/fixture_check.json >/dev/null
)

mkdir -p data/eval_runs
cp "$SEESAW"/outputs/eval_catalog.json "$SEESAW"/outputs/fixture_check.json data/
cp "$SEESAW"/outputs/eval_runs/*.json data/eval_runs/ 2>/dev/null || true

echo "synced $(find data -name '*.json' | wc -l | tr -d ' ') files into data/"

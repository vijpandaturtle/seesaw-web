#!/usr/bin/env bash
# Refresh data/use-cases.json, the dashboard's copy of seesaw's use-case catalog
# (seesaw/use_cases.py). Run it whenever that file changes.
#
# Run from the seesaw-web repo root, with seesaw's virtualenv set up.
set -euo pipefail

SEESAW="${SEESAW_REPO_DIR:-../seesaw}"
if [ ! -d "$SEESAW" ]; then
  echo "no seesaw checkout at $SEESAW — set SEESAW_REPO_DIR" >&2
  exit 1
fi

PYTHON="$SEESAW/.venv/bin/python"
[ -x "$PYTHON" ] || PYTHON=python3

out="$(pwd)/data/use-cases.json"
(cd "$SEESAW" && "$PYTHON" -m seesaw.cli use-cases --json "$out")

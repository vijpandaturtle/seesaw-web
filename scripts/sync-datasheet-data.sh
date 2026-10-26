#!/usr/bin/env bash
# Refresh the committed Model Atlas snapshot that the deployed dashboard reads.
#
# Copies each outputs/datasheets/<slug>/datasheet.json from the seesaw checkout
# into data/datasheets/<slug>/. The results/ dirs beside them hold raw tensors
# and stay on the Python side.
#
# Run from the seesaw-web repo root.
set -euo pipefail

SEESAW="${SEESAW_REPO_DIR:-../seesaw}"
if [ ! -d "$SEESAW" ]; then
  echo "no seesaw checkout at $SEESAW — set SEESAW_REPO_DIR" >&2
  exit 1
fi

count=0
for sheet in "$SEESAW"/outputs/datasheets/*/datasheet.json; do
  [ -f "$sheet" ] || continue
  slug="$(basename "$(dirname "$sheet")")"
  if ! [[ "$slug" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
    echo "skipping $slug: not a valid slug" >&2
    continue
  fi
  mkdir -p "data/datasheets/$slug"
  cp "$sheet" "data/datasheets/$slug/datasheet.json"
  count=$((count + 1))
done

echo "synced $count datasheet(s) into data/datasheets/"

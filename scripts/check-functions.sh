#!/usr/bin/env bash
# Typechecks every edge function with Deno. Used by CI and `npm run check:functions`.
set -euo pipefail
cd "$(dirname "$0")/../supabase/functions"
status=0
for dir in */; do
  f="${dir}index.ts"
  [ -f "$f" ] || continue
  echo "== $f"
  deno check --no-lock "$f" || status=1
done
exit $status

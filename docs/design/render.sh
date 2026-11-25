#!/bin/sh
# Render every D2 diagram under docs/design/*/src/ to an SVG beside it.
#
#   sh docs/design/render.sh            render everything
#   sh docs/design/render.sh --check    render, then fail if any SVG changed
#                                       (CI uses this to catch stale diagrams)
#
# D2 comes from mise (see mise.toml at the repo root): `mise install` once.
set -eu

cd "$(dirname "$0")/../.."

if command -v d2 >/dev/null 2>&1; then
  D2="d2"
elif [ -x "$HOME/.local/bin/mise" ]; then
  D2="$HOME/.local/bin/mise exec -- d2"
else
  echo "d2 not found. Install mise (https://mise.jdx.dev) and run 'mise install'." >&2
  exit 1
fi

count=0
for src in docs/design/*/src/[0-9]*.d2; do
  [ -e "$src" ] || continue
  out="$(dirname "$(dirname "$src")")/$(basename "$src" .d2).svg"
  $D2 --omit-version "$src" "$out" >/dev/null 2>&1 || {
    echo "FAILED: $src" >&2
    $D2 --omit-version "$src" "$out"
    exit 1
  }
  count=$((count + 1))
done
echo "rendered $count diagram(s)"

if [ "${1:-}" = "--check" ]; then
  if ! git diff --quiet -- 'docs/design/*.svg' 'docs/design/**/*.svg'; then
    echo "Stale diagrams: the committed SVGs do not match their .d2 sources." >&2
    git diff --stat -- 'docs/design/*.svg' 'docs/design/**/*.svg' >&2
    echo "Run 'sh docs/design/render.sh' and commit the result." >&2
    exit 1
  fi
  echo "diagrams are up to date"
fi

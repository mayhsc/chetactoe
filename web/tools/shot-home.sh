#!/bin/zsh
# Captures the landing page at the design reference's resolution (1536x1024), so the
# 4x4 grid can be compared against it cell for cell. Needs `npm run dev` running.
#
#   tools/shot-home.sh home.png
#   tools/shot-home.sh home-dark.png "?theme=dark"
set -e
OUT="${OUTDIR:-renders}/$1"
PORT="${PORT:-5178}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
W="${W:-1536}"; H="${H:-1024}"
[[ -z "$1" ]] && { echo "usage: tools/shot-home.sh <out.png> [\"?query\"]" >&2; exit 1; }
mkdir -p "$(dirname "$OUT")"; rm -f "$OUT"
"$CHROME" --headless=new --disable-gpu-sandbox --enable-unsafe-webgpu \
  --enable-features=Vulkan,WebGPU --window-size=$W,$H --hide-scrollbars \
  --virtual-time-budget=14000 --screenshot="$OUT" \
  "http://localhost:${PORT}/${2:-}" >/dev/null 2>&1
[[ -f "$OUT" ]] || { echo "capture failed — dev server on :$PORT?" >&2; exit 1; }
ls -l "$OUT" | awk '{print $5, $9}'

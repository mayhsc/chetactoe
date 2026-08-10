#!/bin/zsh
# Captures the pieces page at reference/pieces.png's exact resolution.
#   tools/shot-pieces.sh out.png ["&extra=query"]
set -e
OUT="${OUTDIR:-renders}/$1"
PORT="${PORT:-5178}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[[ -z "$1" ]] && { echo "usage: tools/shot-pieces.sh <out.png>" >&2; exit 1; }
mkdir -p "$(dirname "$OUT")"; rm -f "$OUT"
"$CHROME" --headless=new --disable-gpu-sandbox --enable-unsafe-webgpu \
  --enable-features=Vulkan,WebGPU --window-size=750,230 --hide-scrollbars \
  --virtual-time-budget=15000 --screenshot="$OUT" \
  "http://localhost:${PORT}/pieces.html?w=750&h=230&gui=0${2:-}" >/dev/null 2>&1
[[ -f "$OUT" ]] || { echo "capture failed — dev server on :$PORT?" >&2; exit 1; }
ls -l "$OUT" | awk '{print $5, $9}'

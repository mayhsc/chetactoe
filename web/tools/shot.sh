#!/bin/zsh
# Captures the board at the reference's exact resolution so the measurement tools
# can compare pixel for pixel. Needs `npm run dev` already running.
#
#   tools/shot.sh latest.png
#   PORT=5180 OUTDIR=/tmp tools/shot.sh a.png
#
# Headless Chrome is used rather than canvas.toDataURL() because a WebGPU canvas
# has no preserved drawing buffer — the page screenshot goes through the
# compositor and captures the frame reliably.
set -e

OUT="${OUTDIR:-renders}/$1"
PORT="${PORT:-5178}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

if [[ -z "$1" ]]; then echo "usage: tools/shot.sh <outfile.png> [extra-query]" >&2; exit 1; fi
if [[ ! -x "$CHROME" ]]; then echo "Chrome not found at $CHROME (set CHROME=...)" >&2; exit 1; fi

mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"

"$CHROME" \
  --headless=new --disable-gpu-sandbox --enable-unsafe-webgpu \
  --enable-features=Vulkan,WebGPU \
  --window-size=1353,1162 --hide-scrollbars \
  --virtual-time-budget=12000 \
  --screenshot="$OUT" \
  "http://localhost:${PORT}/board.html?w=1353&h=1162&gui=0${2:-}" >/dev/null 2>&1

if [[ ! -f "$OUT" ]]; then echo "capture failed — is the dev server up on :$PORT?" >&2; exit 1; fi
ls -l "$OUT" | awk '{print $5, $9}'

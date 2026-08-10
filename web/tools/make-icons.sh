#!/bin/zsh
# Renders the UI's piece icons from the actual 3D models, on a transparent
# background, into public/icons/. Run once after changing a piece or a tone;
# the app loads the PNGs rather than standing up eight WebGPU contexts.
#
#   tools/make-icons.sh          (needs `npm run dev` running)
#
# Serial on purpose: two headless Chrome instances launched together race over the
# profile directory and one of them silently writes a 7-byte file.
set -e
OUT="${OUTDIR:-public/icons}"
PORT="${PORT:-5178}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
W=260; H=340

mkdir -p "$OUT"

shoot() { # shoot <outfile> <width> <height> <query>
  rm -f "$1"
  "$CHROME" --headless=new --disable-gpu-sandbox --enable-unsafe-webgpu \
    --enable-features=Vulkan,WebGPU --window-size=$2,$3 --hide-scrollbars \
    --default-background-color=00000000 --virtual-time-budget=15000 \
    --screenshot="$1" \
    "http://localhost:${PORT}/pieces.html?bg=none&gui=0&w=$2&h=$3&dist=0.20&fov=16&elev=6&y=0.022&$4" \
    >/dev/null 2>&1
  printf "%8s  %s\n" "$(stat -f%z "$1" 2>/dev/null || echo 0)" "$1"
}

for tone in light dark; do
  for piece in pawn knight rook bishop; do
    shoot "$OUT/${tone}-${piece}.png" $W $H "piece=${piece}&tone=${tone}"
  done
done

# The landing page's craft cell shows one piece the height of a whole grid cell, so
# the 260 px icon is not enough pixels for it. Same camera, four times the area.
shoot "$OUT/craft-knight.png" $(( W * 2 )) $(( H * 2 )) "piece=knight&tone=dark"

#!/usr/bin/env bash
# Pratinjau wajah Ciki di komputer: bash tools/firmware/pratinjau/buat.sh <folder Adafruit_GFX_Library> [keluaran.gif]
set -euo pipefail
GFX="${1:?pakai: buat.sh <folder Adafruit_GFX_Library> [keluaran.gif]}"
OUT="${2:-ciki.gif}"
D="$(cd "$(dirname "$0")" && pwd)"; FW="$D/../../../firmware"
K="$(mktemp -d)"
g++ -std=c++17 -O2 -DARDUINO=100 -w -I"$D/shim" -I"$GFX" -I"$FW/src/hadir" -I"$FW/lib/logika" \
  "$D/pratinjau.cpp" "$FW/src/hadir/wajah.cpp" "$FW/lib/logika/logika.cpp" "$FW/lib/logika/sha256.cpp" "$GFX/Adafruit_GFX.cpp" -o "$K/pratinjau"
"$K/pratinjau" "$K"
ffmpeg -v error -y -framerate 20 -i "$K/b%04d.ppm" -vf "scale=640:-1:flags=neighbor,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=none" "$OUT"
rm -rf "$K"
echo "Pratinjau: $OUT"

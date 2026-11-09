#!/usr/bin/env bash
# Kompilasi firmware tanpa PlatformIO, memakai arduino-cli (dipakai saat PlatformIO tidak tersedia).
#   ARDUINO_CLI=arduino-cli CONFIG=arduino-cli.yaml bash firmware/kompilasi.sh uji-kartu|hadir
set -euo pipefail
ENV="${1:?pakai: kompilasi.sh uji-kartu|hadir}"
DIR="$(cd "$(dirname "$0")" && pwd)"
CLI="${ARDUINO_CLI:-arduino-cli}"
KERJA="$(mktemp -d)/$ENV"
mkdir -p "$KERJA"
cp "$DIR"/src/"$ENV"/* "$KERJA"/
cp "$DIR"/include/*.h "$KERJA"/
[ -d "$DIR/lib/logika" ] && cp "$DIR"/lib/logika/*.h "$DIR"/lib/logika/*.cpp "$KERJA"/ 2>/dev/null || true
: > "$KERJA/$ENV.ino"
PART=default
[ "$ENV" = hadir ] && PART=min_spiffs
"$CLI" ${CONFIG:+--config-file "$CONFIG"} compile ${CTAGS:+--build-property "runtime.tools.ctags.path=$CTAGS"} --fqbn "esp32:esp32:esp32c3:CDCOnBoot=cdc,PartitionScheme=$PART" --warnings default --output-dir "$KERJA/keluaran" "$KERJA"
ls -la "$KERJA/keluaran"/*.bin

#!/usr/bin/env bash
# Ekstrak Capaian Pembelajaran dari PDF Keputusan Kepala BSKAP 046/H/KR/2025 menjadi data aplikasi.
#   bash tools/cp-extract/jalankan.sh /path/ke/NOMOR-046-H-KR-2025.pdf
# Butuh: pdftotext (poppler-utils), Python 3.
# Hasil: web/data/cp_2025_sd_sma.json dan supabase/migrations/20261024000003_ref_cp_2025.sql (ditimpa),
#        plus CSV di folder kerja sementara untuk diperiksa.
set -euo pipefail
PDF="${1:?Pakai: jalankan.sh <file PDF CP>}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
KERJA="$(mktemp -d)"
cp "$ROOT/tools/cp-extract/parse_cp.py" "$ROOT/tools/cp-extract/build.py" "$KERJA/"
cd "$KERJA"
pdftotext -layout "$PDF" cp_layout.txt
python3 parse_cp.py
python3 build.py
cp out/cp_2025_sd_sma.json "$ROOT/web/data/cp_2025_sd_sma.json"
cp out/seed_ref_cp_2025.sql "$ROOT/supabase/migrations/20261024000003_ref_cp_2025.sql"
echo "Selesai. CSV untuk diperiksa: $KERJA/out/"

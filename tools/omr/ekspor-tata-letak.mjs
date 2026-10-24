// Cetak tata letak LJK (JSON) untuk dipakai pembuat foto sintetis.
// Pakai: node tools/omr/ekspor-tata-letak.mjs '<json daftar soal>' > layout.json
import { tataLetak } from '../../web/js/core/ljk.js';

const soal = JSON.parse(process.argv[2] || '[]');
process.stdout.write(JSON.stringify(tataLetak(soal)));

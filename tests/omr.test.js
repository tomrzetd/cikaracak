import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { tataLetak, renderSVG, kodeKuis, hurufOpsi } from '../web/js/core/ljk.js';
import { pindai, homografi, putuskan } from '../web/js/core/omr.js';
import { bacaPGM } from './util/pgm.js';

const DIR = fileURLToPath(new URL('./fixtures/omr/', import.meta.url));


test('tata letak: 40 soal muat, 41 ditolak, B/S dua pilihan', () => {
  const L = tataLetak(Array(40).fill({ jenis: 'pg' }));
  assert.equal(L.soal.length, 40);
  assert.equal(L.soal[39].bulatan.at(-1).x <= 193 - 4, true, 'bulatan terakhir tidak menabrak penanda kanan');
  assert.throws(() => tataLetak(Array(41).fill({})), /maksimal 40/);
  assert.deepEqual(hurufOpsi({ jenis: 'bs' }), ['B', 'S']);
  assert.deepEqual(hurufOpsi({ opsi: 3 }), ['A', 'B', 'C']);
});

test('SVG lembar: ukuran A4, 4 penanda, absen tercetak terisi bila diberikan', () => {
  const L = tataLetak(Array(10).fill({}));
  const svg = renderSVG(L, { topik: 'Uji <&>', kode: '042', absen: 7, nama: 'Adit' });
  assert.match(svg, /width="210mm" height="297mm"/);
  assert.equal((svg.match(/fill="#000"\/>/g) || []).length >= 4, true);
  assert.match(svg, /Uji &lt;&amp;&gt;/);
  assert.equal((svg.match(/r="2.6" fill="#000"/g) || []).length, 3 + 2 + 1, 'kode 3 digit + absen 2 digit + contoh pengisian');
});

test('kode kuis stabil 3 digit', () => {
  assert.equal(kodeKuis('kuis-abc'), kodeKuis('kuis-abc'));
  assert.match(kodeKuis('x'), /^\d{3}$/);
});

test('homografi memetakan titik acuan dengan tepat', () => {
  const H = homografi([[0, 0], [10, 0], [0, 10], [10, 10]], [[5, 5], [105, 12], [2, 98], [110, 110]]);
  const [u, v] = H(10, 10);
  assert.ok(Math.abs(u - 110) < 1e-6 && Math.abs(v - 110) < 1e-6);
});

test('keputusan per baris: kosong, yakin, ragu, ganda', () => {
  assert.equal(putuskan([0.02, 0.05, 0.03]).status, 'kosong');
  assert.deepEqual(putuskan([0.02, 0.7, 0.03]), { pilihan: 1, status: 'yakin' });
  assert.equal(putuskan([0.6, 0.65, 0.02]).status, 'ganda');
  assert.equal(putuskan([0.22, 0.03, 0.02]).status, 'ragu');
});

const fixtures = readdirSync(DIR).filter(f => f.endsWith('.json')).sort();
assert.ok(fixtures.length >= 5, 'fixture foto sintetis harus ada (jalankan tools/omr/buat_sintetis.py)');

for (const f of fixtures) {
  test(`pindai foto sintetis ${f.replace('.json', '')}`, () => {
    const exp = JSON.parse(readFileSync(DIR + f, 'utf8'));
    const img = bacaPGM(gunzipSync(readFileSync(DIR + f.replace('.json', '.pgm.gz'))));
    const L = tataLetak(exp.soal);
    const h = pindai(img, L);
    assert.equal(h.ok, true, h.pesan);
    assert.equal(h.kode, exp.kode, 'kode kuis');
    assert.equal(h.absen, exp.absen, 'nomor absen');
    const salah = [];
    exp.harap.forEach((e, i) => {
      if (e.status === 'ganda') { if (h.status[i] !== 'ganda') salah.push(`no ${i + 1}: harap ganda, dapat ${h.status[i]} ${h.jawaban[i]}`); return; }
      if (e.status === 'kosong') { if (h.jawaban[i] !== null) salah.push(`no ${i + 1}: harap kosong, dapat ${h.jawaban[i]}`); return; }
      if (h.jawaban[i] !== e.jawaban) salah.push(`no ${i + 1}: harap ${e.jawaban}, dapat ${h.jawaban[i]} (${h.status[i]}) skor ${h.skor[i]}`);
    });
    assert.deepEqual(salah, []);
  });
}

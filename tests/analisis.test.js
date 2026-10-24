import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analisis, nilaiIsian, persen, saranKonsep, ringkasanWA } from '../web/js/core/analisis.js';

// Data contoh: kuis Sistem Pernapasan, 12 siswa, 10 soal, 4 konsep (sama dengan data contoh di aplikasi).
const konsep = [
  { id: 'k1', nama: 'Organ pernapasan' },
  { id: 'k2', nama: 'Mekanisme inspirasi–ekspirasi' },
  { id: 'k3', nama: 'Pertukaran gas di alveolus' },
  { id: 'k4', nama: 'Gangguan pernapasan' },
];
const peta = ['k1', 'k1', 'k1', 'k2', 'k2', 'k2', 'k3', 'k3', 'k4', 'k4'];
const soal = peta.map(k => ({ jenis: 'pg', kunci: null, konsepId: k }));
const data = [['Adit', '1111101110'], ['Bella', '1110101010'], ['Cahya', '1111111111'], ['Dewi', '1100000110'],
  ['Fajar', '1111001110'], ['Gilang', '1010011011'], ['Hana', '1111101110'], ['Intan', '1111011110'],
  ['Jajang', '1000000010'], ['Kiki', '1110101110'], ['Lutfi', '0111001011'], ['Nisa', '1110111110']];
const siswa = data.map(([n], i) => ({ id: 's' + i, nama: n }));
const jawaban = Object.fromEntries(data.map(([, a], i) => ['s' + i, [...a].map(Number)]));
const kuis = { konsep, soal, jawaban, batas: { ulang: 60, kktp: 75, siswa: 50 } };

test('persen', () => {
  assert.equal(persen(1, 3), 33);
  assert.equal(persen(0, 0), null);
});

test('nilaiIsian: manual, huruf, teks Google Form', () => {
  assert.equal(nilaiIsian(1, null), 1);
  assert.equal(nilaiIsian(0, 'A'), 0);
  assert.equal(nilaiIsian(null, 'A'), null);
  assert.equal(nilaiIsian('a', 'A'), 1);
  assert.equal(nilaiIsian('B', 'A'), 0);
  assert.equal(nilaiIsian('A. Paru-paru', 'A'), 1);
  assert.equal(nilaiIsian('Paru-paru', 'paru paru'), 1);
  assert.equal(nilaiIsian('C', null), null, 'tanpa kunci huruf tidak bisa dinilai');
});

test('statistik konsep dan status', () => {
  const h = analisis(kuis, siswa);
  const p = Object.fromEntries(h.konsep.map(k => [k.nama, [k.p, k.status]]));
  assert.deepEqual(p['Organ pernapasan'], [86, 'tuntas']);
  assert.deepEqual(p['Mekanisme inspirasi–ekspirasi'], [44, 'ulang']);
  assert.deepEqual(p['Pertukaran gas di alveolus'], [75, 'tuntas']);
  assert.deepEqual(p['Gangguan pernapasan'], [63, 'singkat']);
  assert.equal(h.ikut, 12);
  assert.equal(h.rataRata, 67); // 80 jawaban benar / 12 siswa
});

test('siswa perlu didampingi, terurut dari terendah', () => {
  const h = analisis(kuis, siswa);
  assert.deepEqual(h.dampingi.map(p => [p.nama, p.p]), [['Jajang', 20], ['Dewi', 40]]);
  assert.ok(h.dampingi[0].konsepLemah.includes('Mekanisme inspirasi–ekspirasi'));
});

test('kelompok kecil vs ulang klasikal (ambang 60% kelas)', () => {
  const h = analisis(kuis, siswa);
  const mek = h.kelompok.find(g => g.konsep.startsWith('Mekanisme'));
  assert.equal(mek.siswa.length, 7); // 7 dari 12 = 58%, di bawah 60%
  assert.equal(mek.klasikal, false);
  const tiga = { ...kuis, jawaban: { ...kuis.jawaban, s0: [1, 1, 1, 0, 0, 0, 1, 1, 1, 0] } }; // Adit ikut lemah → 8 dari 12
  assert.equal(analisis(tiga, siswa).kelompok.find(g => g.konsep.startsWith('Mekanisme')).klasikal, true);
});

test('soal yang perlu dicek: jauh di bawah konsepnya', () => {
  const h = analisis(kuis, siswa);
  assert.deepEqual(h.cekSoal, [{ no: 10, p: 25, pKonsep: 63 }]);
});

test('siswa tidak ikut tidak dihitung', () => {
  const s2 = [...siswa, { id: 'baru', nama: 'Zaki' }];
  const h = analisis(kuis, s2);
  assert.equal(h.ikut, 12);
  assert.equal(h.jumlahSiswa, 13);
  assert.equal(h.rataRata, 67); // 80 jawaban benar / 12 siswa
});

test('soal benar-salah yang setara menebak ditandai', () => {
  const k = { konsep: [{ id: 'a', nama: 'A' }], soal: [{ jenis: 'bs', kunci: 'B', konsepId: 'a' }], jawaban: {} };
  const ss = Array.from({ length: 10 }, (_, i) => ({ id: 'x' + i, nama: 'S' + i }));
  ss.forEach((s, i) => { k.jawaban[s.id] = [i < 5 ? 'B' : 'S']; });
  const h = analisis(k, ss);
  assert.deepEqual(h.bsMenebak, [{ no: 1, p: 50 }]);
});

test('kunci huruf dinilai otomatis', () => {
  const k = { konsep: [{ id: 'a', nama: 'A' }], soal: [{ kunci: 'C', konsepId: 'a' }, { kunci: 'A', konsepId: 'a' }], jawaban: { s: ['C', 'B'] } };
  const h = analisis(k, [{ id: 's', nama: 'Satu' }]);
  assert.equal(h.siswa[0].p, 50);
});

test('teks saran dan ringkasan WhatsApp', () => {
  const h = analisis(kuis, siswa);
  const mek = h.konsep.find(k => k.status === 'ulang');
  assert.match(saranKonsep(mek), /latihan mengingat/);
  const wa = ringkasanWA({ topik: 'Pernapasan', kelas: 'VIII-B', tanggal: '2026-10-23' }, h);
  assert.match(wa, /Perlu didampingi: Jajang \(20%\), Dewi \(40%\)/);
  assert.match(wa, /Cek ulang soal no\. 10/);
});

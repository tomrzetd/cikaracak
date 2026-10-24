import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buatStore, penyimpananMemori, dataContoh, migrasi } from '../web/js/state.js';
import { analisis } from '../web/js/core/analisis.js';

test('pertama kali dibuka: data contoh dimuat dan dianalisis sama dengan prototipe', async () => {
  const s = buatStore(penyimpananMemori());
  await s.muat();
  assert.equal(s.data.contoh, true);
  const h = analisis(s.kuis(), s.siswaAktif());
  assert.equal(h.rataRata, 67);
  assert.deepEqual(h.konsep.map(k => k.status), ['tuntas', 'ulang', 'tuntas', 'singkat']);
});

test('data tersimpan dan dimuat ulang', async () => {
  const mem = penyimpananMemori();
  const s = buatStore(mem);
  await s.muat();
  s.tambahRombel('VII-A');
  await s.simpanSekarang();
  const s2 = buatStore(mem);
  await s2.muat();
  assert.equal(s2.data.rombel.at(-1).nama, 'VII-A');
});

test('ubah daftar siswa: id dipertahankan, yang hilang jadi tidak aktif', async () => {
  const s = buatStore(penyimpananMemori());
  await s.muat();
  const r = s.rombel();
  const idAdit = r.siswa[0].id;
  s.aturSiswa(r.id, ['adit', 'Zaki', 'Bella']);
  const r2 = s.rombel();
  assert.equal(r2.siswa[0].id, idAdit);
  assert.equal(r2.siswa[0].nama, 'adit');
  assert.equal(s.siswaAktif().length, 3);
  assert.equal(r2.siswa.filter(x => !x.aktif).length, 10);
});

test('kuis baru, atur jumlah soal dan konsep', async () => {
  const s = buatStore(penyimpananMemori());
  await s.muat();
  const k = s.kuisBaru({ topik: 'Gaya', jumlahSoal: 6 });
  assert.equal(k.soal.length, 6);
  s.aturKonsep(k.id, [{ nama: 'A' }, { nama: 'B' }, { nama: 'C' }]);
  const k2 = s.kuis(k.id);
  assert.deepEqual(k2.soal.map(x => k2.konsep.findIndex(c => c.id === x.konsepId)), [0, 0, 1, 1, 2, 2]);
  s.isiJawaban(k.id, 'c1', ['A', 'B']);
  s.aturJumlahSoal(k.id, 3);
  assert.deepEqual(s.kuis(k.id).jawaban.c1, ['A', 'B', null]);
});

test('ketuk jawaban berputar kosong → benar → salah → kosong', async () => {
  const s = buatStore(penyimpananMemori());
  await s.muat();
  const k = s.kuisBaru({ jumlahSoal: 2 });
  const seq = [];
  for (let i = 0; i < 4; i++) { s.ketukJawaban(k.id, 'c1', 0); seq.push(s.kuis(k.id).jawaban.c1[0]); }
  assert.deepEqual(seq, [1, 0, null, 1]);
});

test('salin kuis tanpa jawaban; hapus rombel ikut menghapus kuisnya', async () => {
  const s = buatStore(penyimpananMemori());
  await s.muat();
  const salinan = s.salinKuis('q-contoh');
  assert.deepEqual(salinan.jawaban, {});
  assert.equal(salinan.konsep.length, 4);
  s.hapusRombel('r-contoh');
  assert.equal(s.data.kuis.length, 0);
});

test('migrasi data lama/rusak tidak membuat aplikasi macet', () => {
  assert.deepEqual(migrasi(null).rombel, []);
  const m = migrasi({ rombel: [{ nama: 'X', siswa: [{ nama: 'A' }] }], kuis: [{ id: 'q', topik: 'T' }] });
  assert.ok(m.rombel[0].id && m.rombel[0].siswa[0].id);
  assert.deepEqual(m.kuis[0].soal, []);
  assert.ok(dataContoh().kuis[0].soal.every(x => x.kunci));
});

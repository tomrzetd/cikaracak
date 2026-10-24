import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTabel, tebakPemisah, parseKunci, nilaiSel, bacaRespons, bacaDaftarSiswa, keCSV } from '../web/js/core/impor.js';
import { cocokkanNama, normNama, inisial } from '../web/js/core/nama.js';

test('tebak pemisah', () => {
  assert.equal(tebakPemisah('a\tb\tc'), '\t');
  assert.equal(tebakPemisah('a;b;c'), ';');
  assert.equal(tebakPemisah('a,b'), ',');
});

test('CSV dengan kutip, koma di dalam kutip, kutip ganda, dan baris baru', () => {
  const t = 'Nama,Soal 1\n"Lubis, Adit","Jawab ""A"""\n"Multi\nbaris",B\n';
  assert.deepEqual(parseTabel(t), [['Nama', 'Soal 1'], ['Lubis, Adit', 'Jawab "A"'], ['Multi\nbaris', 'B']]);
});

test('kunci jawaban', () => {
  assert.deepEqual(parseKunci('ABCDA'), ['A', 'B', 'C', 'D', 'A']);
  assert.deepEqual(parseKunci('a b c'), ['A', 'B', 'C']);
  assert.deepEqual(parseKunci('BSSB'), ['B', 'S', 'S', 'B']);
  assert.deepEqual(parseKunci('Paru-paru, Hidung'), ['Paru-paru', 'Hidung']);
  assert.deepEqual(parseKunci(''), []);
});

test('nilai sel: B adalah pilihan bila ada kunci, Benar bila tidak', () => {
  assert.equal(nilaiSel('B'), 1);
  assert.equal(nilaiSel('B', true), 'B');
  assert.equal(nilaiSel('salah'), 0);
  assert.equal(nilaiSel('✓', true), 1);
  assert.equal(nilaiSel('C. Trakea', true), 'C');
  assert.equal(nilaiSel(''), null);
});

test('respons Google Form: kolom stempel waktu, email, dan skor diabaikan', () => {
  const t = 'Stempel waktu\tAlamat email\tSkor\tNama\tSoal 1\tSoal 2\n' +
    '23/10/2026 07:01\ta@x.id\t1 / 2\tAdit\tA. Paru-paru\tB\n' +
    '23/10/2026 07:02\tb@x.id\t2 / 2\tBella\tA\tC\n';
  const r = bacaRespons(t, { adaKunci: true });
  assert.equal(r.jumlahSoal, 2);
  assert.deepEqual(r.kolomSoal, ['Soal 1', 'Soal 2']);
  assert.deepEqual(r.baris, [{ nama: 'Adit', isian: ['A', 'B'] }, { nama: 'Bella', isian: ['A', 'C'] }]);
});

test('respons tabel rekap 1/0 tanpa kunci', () => {
  const r = bacaRespons('Nama;1;2;3\nAdit;1;0;\nBella;benar;salah;1');
  assert.deepEqual(r.baris.map(b => b.isian), [[1, 0, null], [1, 0, 1]]);
});

test('daftar siswa: satu per baris atau tabel Dapodik', () => {
  assert.deepEqual(bacaDaftarSiswa('Adit\nBella\n\nCahya'), ['Adit', 'Bella', 'Cahya']);
  assert.deepEqual(bacaDaftarSiswa('No\tNama\tNISN\n1\tAdit Pratama\t0012\n2\tBella\t0013'), ['Adit Pratama', 'Bella']);
});

test('keCSV memberi kutip saat perlu', () => {
  assert.equal(keCSV([['a', 'b,c', 'd"e']]), 'a,"b,c","d""e"');
});

test('cocokkan nama', () => {
  const d = [{ nama: 'Adit Pratama' }, { nama: 'Bella Sari' }, { nama: 'Bella Putri' }, { nama: 'Cahya' }];
  assert.equal(cocokkanNama('adit pratama', d), 0);
  assert.equal(cocokkanNama('Adit', d), 0);
  assert.equal(cocokkanNama('Bella', d), -1, 'dua Bella: harus ditanyakan ke guru');
  assert.equal(cocokkanNama('Cahya Ningrum', d), 3);
  assert.equal(cocokkanNama('Zaki', d), -1);
  assert.equal(normNama('  Énggar  S. '), 'enggar s');
  assert.equal(inisial('Adit Pratama Jaya'), 'AP');
});

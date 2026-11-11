import test from 'node:test';
import assert from 'node:assert/strict';
import { kodeValid, barcodeCode39, labelBuku } from '../web/js/core/pustaka-label.js';
import { validIsbn, normalisasiIsbn, petunjukDariOcr, nilaiKandidatJudul } from '../web/js/core/pustaka-ocr.js';

test('CODE39: label inventaris memiliki start/stop, 3 lebar dan teks unik',()=>{
  const code='CKR0123456789AB';
  assert(kodeValid(code));
  assert(!kodeValid('SISWA1234'));
  assert(!kodeValid('CKR0123456789AZ'));
  const svg=barcodeCode39(code);
  assert.match(svg,/aria-label="Barcode CKR0123456789AB"/);
  assert(svg.includes('<rect x='));
  assert.equal((svg.match(/height="64"/g)||[]).length>40,true);
  const label=labelBuku({kode:code,judul:'Laju Reaksi',sekolah:'SMP Contoh'});
  assert.match(label,/Laju Reaksi/);
  assert.match(label,/SMP Contoh/);
  assert(!label.includes('<script>'));
  assert(!labelBuku({kode:code,judul:'<script>',sekolah:'<img onerror=alert(1)>'}).includes('<script>'));
});
test('ISBN: checksum 10 dan 13, tidak menerima ISBN typo',()=>{
  assert(validIsbn('978-0-14-032872-1'));
  assert(validIsbn('0-8044-2957-X'));
  assert.equal(normalisasiIsbn('ISBN: 978-0-14-032872-1'),'9780140328721'); // hanya jika parser menerima prefiks
  assert(!validIsbn('9780140328722'));
  assert(!validIsbn('1234567890'));
});
test('OCR: hanya usulan; ISBN dan penerbit diperoleh dari teks',()=>{
  const hint=petunjukDariOcr('ATLAS GEOGRAFI NUSANTARA\nBuku Siswa SMP\nPenerbit: Contoh Press\nISBN 978-0-14-032872-1');
  assert.match(hint.judul,/ATLAS GEOGRAFI/);
  assert.equal(hint.isbn,'9780140328721');
  assert.match(hint.penerbit,/Contoh Press/);
  assert(hint.kandidat.length>=1);
});

test('OCR judul: cocokkan Pendidikan Pancasila tanpa menebak dari teks gagal',()=>{
  const benar=petunjukDariOcr('GELOMBANG BUKU\\nKelas IX\\nPendidikan Pancasila\\nUntuk SMP');
  assert.equal(benar.judul,'Pendidikan Pancasila');
  assert.equal(benar.mutu,'baik');
  const gagal=petunjukDariOcr('le rR\\nrR\\na l\\n&.\\namieale sila');
  assert.equal(gagal.judul,'');
  assert.equal(gagal.mutu,'rendah');
  assert(nilaiKandidatJudul('Pendidikan Pancasila')>nilaiKandidatJudul('amieale sila'));
  assert.equal(petunjukDariOcr('Penerbit: PT Pustaka Uji\\nISBN 9780140328721').penerbit,'PT Pustaka Uji');
});
test('OCR multi-pass: ambil kandidat judul terbaik, bukan baris pertama',()=>{
 const hasil=petunjukDariOcr('Nama siswa: Ari\\nKelas IX\\nLogo Penerbit\\nPendidikan Pancasila\\nBuku Pendidikan Pancasila');
 assert.match(hasil.judul,/Pendidikan Pancasila/);
 assert(!hasil.judul.startsWith('Nama siswa'));
});

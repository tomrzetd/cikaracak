import test from 'node:test';
import assert from 'node:assert/strict';
import { dataDemoPustaka, ringkasanPustaka, pinjamBuku, kembalikanBuku,
         tambahJudul, sedangDipinjam } from '../web/js/core/pustaka-demo.js';
import { dasborFiktif } from '../web/js/core/dasbor-fiktif.js';

test('Pustaka demo: siswa fiktif, inventaris dan keterlambatan', () => {
  const d=dataDemoPustaka('2026-11-10');
  assert.equal(d.jenis,'DEMO_FIKTIF');
  assert.equal(d.siswa.length,5);
  assert.ok(d.siswa.every(s=>s.nama.includes('(fiktif)')));
  assert.deepEqual(ringkasanPustaka(d,'2026-11-10'),
    {judul:6,eksemplar:9,tersedia:7,dipinjam:2,terlambat:1,transaksi:2});
});
test('Pustaka demo: pinjam lalu kembali, tidak boleh double borrowing',()=>{
  const d=dataDemoPustaka('2026-11-10');
  const baru=pinjamBuku(d,{id:'P-003',eksemplarId:'EX-002',siswaId:'d03',tanggal:'2026-11-10',jatuhTempo:'2026-11-17'});
  assert.equal(ringkasanPustaka(baru,'2026-11-10').dipinjam,3);
  assert.equal(ringkasanPustaka(d,'2026-11-10').dipinjam,2,'data asal immutable');
  assert.ok(sedangDipinjam(baru,'EX-002'));
  assert.throws(()=>pinjamBuku(baru,{id:'P-004',eksemplarId:'EX-002',siswaId:'d02'}),/masih dipinjam/);
  assert.throws(()=>pinjamBuku(d,{id:'P-004',eksemplarId:'EX-001',siswaId:'d02'}),/masih dipinjam/);
  assert.throws(()=>pinjamBuku(d,{id:'P-004',eksemplarId:'EX-999',siswaId:'d02'}),/tidak ditemukan/);
  assert.throws(()=>pinjamBuku(d,{id:'P-004',eksemplarId:'EX-002',siswaId:'d02',tanggal:'2026-11-10',jatuhTempo:'2026-11-09'}),/Jatuh tempo/);
  const dikembalikan=kembalikanBuku(baru,'P-003','2026-11-11');
  assert.equal(ringkasanPustaka(dikembalikan,'2026-11-11').dipinjam,2);
  assert.equal(dikembalikan.peminjaman.find(p=>p.id==='P-003').kembali,'2026-11-11');
  assert.throws(()=>kembalikanBuku(dikembalikan,'P-003'),/tidak ditemukan/);
});
test('Pustaka demo: judul dan kode eksemplar harus unik',()=>{
  const d=dataDemoPustaka('2026-11-10');
  const tambah=tambahJudul(d,{id:'b07',judul:'Buku Uji',penulis:'Penulis Uji',kodeEksemplar:'EX-010'});
  assert.equal(tambah.buku.length,7);
  assert.equal(tambah.eksemplar.length,10);
  assert.throws(()=>tambahJudul(tambah,{id:'b07',judul:'Duplikat',penulis:'X',kodeEksemplar:'EX-011'}),/sudah ada/);
});
test('Dasbor simulasi: setiap hari dan kelas jumlahnya konsisten',()=>{
  const d=dasborFiktif({hari:14,hariIni:'2026-11-10'});
  assert.equal(d.simulasi_lokal,true);
  assert.equal(d.siswa,90);
  assert.equal(d.kelas.length,3);
  assert.ok(d.harian.length>0);
  for(const h of d.harian)assert.equal(h.hadir+h.terlambat+h.izin_sakit+h.tidak_tercatat,90);
  for(const k of d.kelas)assert.equal(k.hadir+k.terlambat+k.izin_sakit+k.tidak_tercatat,k.siswa);
});

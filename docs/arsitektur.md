# Arsitektur

Aplikasi web tanpa proses build, data di perangkat, dan logika murni yang bisa diuji di Node. Aplikasi Android membungkus web yang sama.

```
                ┌──────────────── web/ (satu kode untuk semua) ────────────────┐
  index.html ──►│ js/app.js  navigasi, modal, konteks kelas/kuis                │
                │   ├─ js/views/*     halaman: beranda, kelas, kuis, saran, …    │
                │   ├─ js/state.js    data & operasi (adapter penyimpanan)      │
                │   ├─ js/db.js       IndexedDB: data + foto siswa              │
                │   ├─ js/gambar.js   muat foto → abu-abu, kecilkan foto siswa  │
                │   └─ js/core/       LOGIKA MURNI (diuji di Node)              │
                │        analisis.js  statistik & aturan saran                  │
                │        impor.js     CSV/TSV, Google Form, kunci, daftar siswa │
                │        nama.js      pencocokan nama                           │
                │        ljk.js       tata letak LJK (mm) + SVG cetak           │
                │        omr.js       pemindai: penanda → homografi → skor      │
                └───────────────────────────────────────────────────────────────┘
        ▲ PWA: sw.js menyimpan semua file             ▲ Android: aset APK + jembatan native
```

## Aliran data

1. `state.js` memegang satu objek data: `guru`, `rombel[]` (dengan `siswa[]`), `kuis[]`, `aktif`, `fotoIzin`.
2. Halaman memanggil operasi `store.*` (mis. `store.isiJawaban`). Setiap perubahan memberi tahu pendengar, lalu `app.js` menggambar ulang halaman aktif (dikelompokkan per frame).
3. Penyimpanan ditunda 300 ms (`ubah`) dan dipaksa saat halaman disembunyikan (`simpanSekarang`).
4. Foto siswa disimpan terpisah (`db.js → foto`) dan tidak pernah masuk ke objek data, sehingga tidak ikut cadangan.

## Model data kuis

```js
{
  id, rombelId, topik, mapel, fase, tanggal,
  batas: { ulang: 60, kktp: 75, siswa: 50 },
  konsep: [{ id, nama, tp, cp }],                 // cp = id butir CP resmi bila dipilih dari CP
  soal:   [{ jenis: 'pg'|'bs', opsi: 3|4|5, kunci: 'A'…'E'|'B'|'S'|'', konsepId }],
  jawaban: { [siswaId]: [isian…] },              // isian: huruf, 1/0 (manual), teks Form, atau null
  tindakan: { dijalankan: 'Ya'|'Sebagian'|'Tidak'|'', catatan }
}
```

Nomor absen = urutan siswa aktif di rombel (1, 2, 3, …). LJK per siswa mencetak nomor itu, dan pemindai memetakannya kembali.

## Konvensi tampilan

- Setiap halaman mengekspor `render(el, ctx)` (menggambar ulang seluruh isi) dan, bila perlu, `pasang(el, ctx)` (memasang pendengar sekali, lewat delegasi `data-aksi`).
- Kolom isian yang belum disimpan ke data diberi `data-sementara` agar tidak hilang saat halaman digambar ulang.
- Tidak memakai `confirm()`/`alert()`: tindakan berbahaya memakai `konfirmasiDuaKetuk`.
- Warna lewat token CSS di `css/app.css`; mode gelap mengikuti sistem.

## Mengapa tanpa framework

Sasaran kontributor termasuk guru yang baru belajar koding. Tanpa build, mereka cukup membuka file di editor, mengubah, lalu memuat ulang browser. Aplikasi juga harus ringan di HP murah dan berjalan offline.

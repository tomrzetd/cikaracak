# Ekstraksi Capaian Pembelajaran

Mengubah Lampiran II (CP SD/MI, SMP/MTs, SMA/MA, halaman 23–347) dari PDF Keputusan Kepala BSKAP Kemendikdasmen Nomor 046/H/KR/2025 menjadi data terstruktur.

```bash
bash tools/cp-extract/jalankan.sh /path/ke/NOMOR-046-H-KR-2025.pdf
```

| Berkas | Fungsi |
| --- | --- |
| `parse_cp.py` | Membaca teks `pdftotext -layout`, memecah per mapel → fase → elemen. Menangani mapel satu fase (mis. Fisika, Fase F), sub-elemen PAK Kristen, judul elemen dua baris, dan blok tanda tangan di akhir lampiran. |
| `build.py` | Menyeragamkan nama elemen (nama asli tetap di `elemen_sumber`), memecah CP menjadi butir per kompetensi (dipisah titik koma/kalimat), lalu menulis CSV, JSON untuk aplikasi, dan SQL untuk Supabase. |

Hasil rilis 0.1.0: 46 mapel, 532 baris CP, 1.071 butir. Setiap teks CP sudah dicocokkan kata demi kata dengan sumbernya, dan semua baris yang dibuang hanya judul fase atau kalimat pengantar.

Catatan dari dokumen sumber: Bahasa Inggris dimulai di Fase B; PAK Katolik Fase F elemen "Yesus Kristus" bertanda "-" (disimpan kosong dengan catatan); beberapa salah tulis nama elemen di sumber diseragamkan.

Butir CP adalah **bahan menyusun TP**, bukan tujuan pembelajaran resmi.

# Cikaracak Hadir — server presensi di Supabase

Migrasi: `supabase/migrations/20261107000001_presensi.sql`. Uji: `bash tools/supabase/uji.sh`
(menjalankan `uji_rls.sql` lalu `uji_presensi.sql` di PostgreSQL sementara).

## Cara kerja singkat

```
Kartu ─► Alat ESP32 ──POST /rest/v1/rpc/catat_tap (kunci anon + tanda HMAC)──► Supabase
                                                                                  │
                     Aplikasi guru (login) ◄── presensi_kelas / rekap_bulan ──────┘
```

- **Alat tidak punya akun.** Setiap tap ditandatangani dengan kunci alat (32 byte, dibuat `buat_alat`):
  `tanda = hex(HMAC-SHA256(kunci, alat \n waktu \n nonce \n UID \n offline))`.
  `waktu` = detik Unix (0 = pakai jam server), `offline` = `1` bila tap diambil dari antrean.
- **UID tidak disimpan apa adanya**, hanya `HMAC-SHA256(UID, pepper)`. Pepper ada di tabel `rahasia`
  yang tidak bisa dibaca lewat API. Saat pindah server, pepper ikut dipindah; bila hilang, semua kartu didaftar ulang.
- **Kirim ulang aman.** Nonce yang sama dari alat yang sama mengembalikan jawaban pertama (`"ulang": true`).
- **Tidak ada tap ≠ Alpa.** Keadaan tanpa tap adalah `belum`. Sakit/Izin/Alpa diisi wali kelas lewat
  `ubah_presensi` dengan alasan wajib, dan tercatat di tabel `audit`.

## Aturan jam (tabel `jadwal`, per hari)

| Tap | Hasil |
|---|---|
| Pertama, sebelum `jam_pulang`, ≤ `jam_masuk + toleransi` | `hadir` |
| Pertama, sebelum `jam_pulang`, lewat toleransi | `terlambat` (menit dihitung dari `jam_masuk`) |
| Dalam 30 menit dari tap terakhir | `sudah` |
| Berikutnya, sebelum `jam_pulang` | `pulang_awal` |
| Berikutnya / pertama, setelah `jam_pulang` | `pulang` |
| Hari tanpa jadwal atau ada di `kalender_libur` | `libur` |

Hasil lain untuk layar alat: `terdaftar`, `kartu_terpakai`, `tidak_dikenal`, `nonaktif`, `kedaluwarsa`
(antrean offline > 7 hari), `waktu_salah`, `tanda_salah`, `format_salah`.

## Siapa boleh apa

| Peran | Boleh |
|---|---|
| Admin | alat, kartu, jadwal, libur, semua presensi, ubah presensi, log tap, audit, undang guru |
| Petugas piket (`pengguna.piket`) | lihat alat & semua presensi, mulai daftar kartu di alat |
| Wali kelas (`rombel.wali_id`) | lihat & ubah presensi kelasnya |
| Guru pengajar | lihat presensi kelas yang diajarnya |
| Tanpa login (alat) | hanya `catat_tap` dan `lapor_alat` |

## Menyiapkan demo (SMPN 2 Jalaksana, data siswa fiktif)

1. Buat proyek di supabase.com (gratis). Di **SQL Editor**, jalankan keempat file di `supabase/migrations/` berurutan.
2. **Authentication → Users → Add user**: buat akun admin (email + kata sandi).
3. Di SQL Editor, hubungkan akun itu ke sekolah (ganti email):
   ```sql
   with s as (insert into sekolah (nama, jenjang) values ('SMPN 2 Jalaksana', 'SMP') returning id)
   insert into pengguna (id, sekolah_id, nama, peran)
   select u.id, s.id, 'Operator', 'admin' from auth.users u, s where u.email = 'operator@contoh.sch.id';
   ```
4. Setelah halaman Presensi di aplikasi siap, rombel, siswa, jadwal, dan alat diatur dari sana.
   Kunci alat hanya tampil **sekali** saat alat dibuat. Bila hilang, pakai "ganti kunci".
5. Kartu bisa didaftarkan dengan mode daftar di alat (pilih siswa, tempel kartu dalam 60 detik) atau
   dengan mengetik UID yang tampil di firmware uji kartu.

## Pindah ke PHP + MySQL (idwebhost)

Aplikasi berbicara ke server lewat satu adaptor (`web/js/server/`). Versi PHP akan menyediakan endpoint
dengan nama dan format jawaban yang sama (`catat_tap`, `presensi_kelas`, dst.), memakai aturan jam di atas,
sehingga firmware dan aplikasi cukup diganti alamat servernya.

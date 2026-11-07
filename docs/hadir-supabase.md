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

## Menyiapkan demo di Supabase (SMPN 2 Jalaksana, siswa fiktif)

1. Buat proyek gratis di supabase.com. Pilih region **Singapore** (paling dekat).
2. **SQL Editor**: jalankan keempat file `supabase/migrations/*.sql` berurutan (salin-tempel isinya, Run).
3. **Authentication → Users → Add user → Create new user**: email operator + kata sandi, centang **Auto Confirm User**.
4. **SQL Editor**: buka `supabase/demo.sql`, ganti email di baris `v_email`, Run.
   Hasilnya: sekolah, jadwal Senin–Jumat, kelas VII-A/VIII-A/IX-A dengan 10 siswa fiktif masing-masing,
   dan satu alat "Gerbang utama". Tabel di bawah editor menampilkan **ID alat** dan **kunci alat**.
5. **Project Settings → API**: salin **Project URL** dan kunci **anon / publishable**.
6. Buka aplikasi → **Presensi** → isi alamat server dan kunci anon → masuk dengan akun operator.
7. Coba tanpa alat: tab **Kartu siswa** → *Ketik UID* (mis. `A1B2C3D4`), lalu tab **Simulator alat** →
   pilih alat, tempel kunci alat, UID yang sama → *Tempelkan kartu*. Daftar hadir di tab **Hari ini** langsung terisi.
8. Dengan alat sungguhan: tahan BOOT 3 detik, isi Project URL, kunci anon, ID alat, dan kunci alat.

Guru lain: buat akunnya di Authentication → Users, lalu di aplikasi tab **Kelas & guru → Tambah guru**.
Atur wali kelas di tabel kelas pada tab yang sama.

## Mencoba tanpa akun Supabase ("Supabase mini" di komputer)

Untuk pengembang dan uji otomatis: PostgreSQL + PostgREST asli + gerbang login tiruan, berisi data demo yang sama.

```
# PostgREST: unduh postgrest-v12.2.3-linux-static-x64.tar.xz dari github.com/PostgREST/postgrest/releases
POSTGREST=./postgrest bash tools/supabase/server-demo.sh          # mencetak alamat, kunci anon, akun, alat demo
node tools/serve.js 8080                                          # aplikasi di http://localhost:8080
```

Akun demo: `operator@contoh.sch.id` / `demo12345` (admin) dan `wali@contoh.sch.id` / `demo12345` (wali VIII-A).
Uji browser otomatis: `bash tools/supabase/server-demo.sh python3 tests/e2e/uji_presensi.py` (juga berjalan di CI).

## Aplikasi Android

Halaman Presensi berjalan sama di aplikasi Android (WebView). Syaratnya alamat server **https://** (Supabase
sudah https); alamat http biasa diblokir Android. Halaman lain tetap bekerja offline tanpa server.

## Pindah ke PHP + MySQL (idwebhost)

Aplikasi berbicara ke server lewat satu adaptor (`web/js/server/`). Versi PHP akan menyediakan endpoint
dengan nama dan format jawaban yang sama (`catat_tap`, `presensi_kelas`, dst.), memakai aturan jam di atas,
sehingga firmware dan aplikasi cukup diganti alamat servernya.

# Aplikasi Android

Folder `android/` adalah proyek Android Studio (Kotlin). Aplikasi membuka web app dari aset APK, jadi fiturnya selalu sama dengan versi web.

## Membangun

1. Pasang [Android Studio](https://developer.android.com/studio) (berisi JDK 17 dan Android SDK).
2. File → Open → pilih folder `android/`. Tunggu Gradle sync selesai (pertama kali mengunduh dependensi).
3. Build → Build App Bundle(s) / APK(s) → Build APK(s). APK debug ada di `android/app/build/outputs/apk/debug/`.

Dari terminal: `cd android && ./gradlew assembleDebug`.

Tugas `salinWeb` di `app/build.gradle.kts` menyalin `../web` ke `app/src/main/assets/web` setiap build (kecuali `sw.js`), jadi perubahan di `web/` otomatis ikut.

## Cara kerja

| Bagian | Berkas | Fungsi |
| --- | --- | --- |
| Pemuat halaman | `MainActivity.kt` | `WebViewAssetLoader` menyajikan aset di `https://appassets.androidplatform.net/assets/web/`, sehingga IndexedDB dan modul JS berfungsi. |
| Pilih file / kamera | `MainActivity.kt` | `onShowFileChooser`: `<input capture>` langsung membuka kamera bawaan; selain itu pemilih file plus opsi kamera. Foto sementara di cache dan dihapus saat aplikasi ditutup. |
| Simpan file | `Jembatan.simpanFile` | CSV dan cadangan JSON disimpan lewat dialog "Simpan sebagai" Android. |
| Cetak LJK | `Jembatan.cetak` | `PrintManager` dengan A4 tanpa margin: ke printer atau simpan PDF. |
| Salin teks | `Jembatan.salin` | Ringkasan WhatsApp ke papan klip. |
| Tombol kembali | `MainActivity.kt` | Menutup jendela yang terbuka di aplikasi dulu, baru keluar. |

Web mendeteksi `window.AndroidJembatan` untuk memakai fungsi native, dan tidak mendaftarkan service worker di dalam aplikasi.

## Privasi

- Tidak meminta izin kamera (memakai aplikasi kamera bawaan lewat intent).
- Pencadangan otomatis ke Google dimatikan (`allowBackup=false`, `data_extraction_rules.xml`).
- Izin INTERNET hanya karena WebView memuat halaman lewat alamat https lokal; CSP di `index.html` memblokir koneksi keluar.

## Status

Versi 0.1.0 ditulis tanpa sempat dibangun di lingkungan pengembang awal (tanpa Android SDK). Build pertama, uji kamera, simpan file, dan cetak di HP sungguhan adalah **Issue pertama yang perlu dikerjakan**. Laporkan hasilnya dengan merek HP dan versi Android.

## Rencana

- Clicker ESP32 lewat Bluetooth LE (`Jembatan` menerima jawaban per siswa).
- Rilis Play Store (penandatanganan, ikon, kebijakan privasi).

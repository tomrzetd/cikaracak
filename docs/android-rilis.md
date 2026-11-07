# Rilis aplikasi Android

APK **debug** dibuat CI setiap push (artefak `cikaracak-debug-apk`), cukup untuk mencoba.
APK **rilis** ditandatangani dengan kunci rilis, sehingga versi berikutnya bisa memperbarui aplikasi yang
sudah terpasang tanpa menghapus data guru.

## Kunci rilis

Kunci (keystore PKCS12, alias `cikaracak`) dipegang pemilik proyek dan **tidak pernah disimpan di repositori**
(`.gitignore` menolak `*.p12`, `*.jks`, `*.keystore`). Simpan cadangannya di dua tempat. Bila hilang, pembaruan
aplikasi tidak bisa dipasang di atas versi lama; bila bocor, orang lain bisa membuat pembaruan palsu.

## Membuat APK rilis otomatis di GitHub

Isi tiga secret di **Settings → Secrets and variables → Actions**:

| Nama secret | Isi |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | isi keystore dalam base64 (`base64 -w0 cikaracak-rilis.p12`) |
| `ANDROID_KEYSTORE_PASSWORD` | sandi keystore |
| `ANDROID_KEY_ALIAS` | `cikaracak` |

Setelah itu setiap push menghasilkan artefak **`cikaracak-release-apk`**. CI memeriksa tanda tangannya
(`apksigner verify`) dan mencetak sidik SHA-256 sertifikat di log. Cocokkan dengan sidik yang dicatat pemilik kunci.

Tanpa secret, CI tetap menjalankan `assembleRelease` dengan kunci debug, hanya untuk memastikan build rilis
(minify/ProGuard) tidak rusak. APK itu tidak diunggah.

## Membuat sendiri

Android Studio: **Build → Generate Signed App Bundle / APK**, atau dari folder `android/`:

```
CIKARACAK_KEYSTORE=/jalur/cikaracak-rilis.p12 CIKARACAK_KEYSTORE_PASSWORD='...' CIKARACAK_KEY_ALIAS=cikaracak ./gradlew assembleRelease
```

Naikkan `versionCode` dan `versionName` di `android/app/build.gradle.kts` setiap rilis.

# Cikaracak Hadir — perakitan dan uji kartu

## Bahan

| Komponen | Catatan |
|---|---|
| ESP32-C3 Super Mini | papan utama, USB-C |
| RC522 (13,56 MHz) | **VCC ke 3V3, jangan ke 5V** |
| Layar ST7789 1,47" 172×320 | SPI, 3,3 V |
| Modul buzzer aktif (picu LOW) | bila berbunyi terus, ubah `BUZZER_AKTIF_LOW` ke 0 di `firmware/include/pin.h` |

## Sambungan

RC522 dan layar berbagi SCK dan MOSI. Masing-masing punya pin CS sendiri.

| ESP32-C3 | RC522 | Layar ST7789 | Buzzer |
|---|---|---|---|
| 3V3 | 3.3V | VCC | VCC |
| GND | GND | GND | GND |
| GPIO4 | SCK | SCL | |
| GPIO5 | MISO | | |
| GPIO6 | MOSI | SDA | |
| GPIO0 | SDA (SS) | | |
| GPIO1 | RST | | |
| GPIO7 | | CS | |
| GPIO3 | | DC | |
| GPIO10 | | RST | |
| GPIO21 | | BLK | |
| GPIO20 | | | I/O |

Pin IRQ pada RC522 tidak dipakai. GPIO8 (LED biru) dan GPIO9 (tombol BOOT) sudah ada di papan.

### Pilihan lain: ESP32-S3-DevKitC-1U (antena eksternal)

Untuk gerbang yang jauh dari router, pakai **ESP32-S3-DevKitC-1U** (huruf **U** = soket antena U.FL)
dengan antena 2,4 GHz. Firmware-nya `cikaracak-hadir-esp32s3.bin` / `cikaracak-uji-kartu-esp32s3.bin`.
Semua kabel ada di **header kiri** papan, jadi tidak menyilang:

| ESP32-S3 | RC522 | Layar ST7789 | Buzzer |
|---|---|---|---|
| 3V3 | 3.3V | VCC | VCC |
| GND | GND | GND | GND |
| GPIO12 | SCK | SCL | |
| GPIO13 | MISO | | |
| GPIO11 | MOSI | SDA | |
| GPIO10 | SDA (SS) | | |
| GPIO9 | RST | | |
| GPIO14 | | CS | |
| GPIO8 | | DC | |
| GPIO18 | | RST | |
| GPIO17 | | BLK | |
| GPIO16 | | | I/O |

- **Pasang antena sebelum menyalakan papan.** Memancar tanpa antena bisa merusak bagian radio.
- DevKitC punya dua port USB. Untuk flash dan Serial Monitor pakai port berlabel **UART** (atau **COM**).
- Lampu RGB bawaan papan berkedip putih saat kartu terbaca. Tombol BOOT (GPIO0) dipakai untuk pengaturan.
- Pada S3, WiFi memakai daya pancar penuh. Daya rendah hanya dipakai pada C3 Super Mini.

## Flash firmware uji kartu tanpa instal apa pun

1. Buka **https://espressif.github.io/esptool-js/** di Chrome atau Edge (laptop).
2. Colok ESP32-C3 lewat USB-C. Bila tidak muncul port, tahan tombol **BOOT**, tekan **RST**, lepas BOOT.
3. Klik **Connect**, pilih port, lalu isi **Flash Address `0x0`** dan pilih file `cikaracak-uji-kartu-esp32c3.bin`.
4. Klik **Program**. Setelah selesai, tekan **RST** di papan.

Pengembang yang memakai PlatformIO cukup menjalankan `pio run -e uji-kartu -t upload` di folder `firmware/`.

## Yang harus terlihat

1. **Bilah merah–hijau–biru + 2 bip.** Layar dan buzzer benar. Bila layar putih/hitam saja, periksa CS, DC, RST, BLK.
2. **"RC522 terdeteksi"** beserta versinya. Versi FM17522 atau "tiruan" tetap boleh dipakai.
   Bila muncul **"RC522 TIDAK TERDETEKSI"**, layar menampilkan pin yang harus dicek.
3. **Tempelkan kartu.**
   - Hijau "KARTU BISA DIPAKAI" + 1 bip: kartu cocok untuk presensi.
   - Kuning "JENIS KARTU LAIN" + 2 bip: terbaca, tetapi jenisnya tidak umum. Catat jenisnya.
   - Tidak bereaksi sama sekali selama 30 detik: kartu kemungkinan 125 kHz, bukan 13,56 MHz, sehingga RC522 tidak bisa membacanya.
4. Tempel kartu yang sama beberapa kali. UID harus selalu sama ("Sama dengan kartu sebelumnya").

## Log untuk dicatat

Buka Serial Monitor 115200 (misalnya di https://espressif.github.io/esptool-js/ bagian Console, atau Arduino IDE).
Setiap kartu menghasilkan satu baris CSV:

```
no,uid,jenis,sak,ukuran_uid
1,A1B2C3D4,MIFARE 1KB,0x08,4
```

Firmware hanya membaca UID. Isi kartu, nama, dan data pribadi siswa tidak dibaca. UID juga tidak disimpan
di server dalam bentuk asli: server hanya menyimpan sidik (hash) UID.

## Firmware alat gerbang (`cikaracak-hadir-esp32c3.bin`)

Flash dengan cara yang sama (alamat `0x0`; pilih berkas `-esp32c3` atau `-esp32s3` sesuai papan). Berkas terbaru juga ada di tab **Actions** GitHub,
artefak `firmware-esp32`, bersama `ciki.gif` (pratinjau animasi).

### Pengaturan pertama

1. Saat pertama menyala, layar menampilkan **MODE PENGATURAN** dengan nama WiFi `Cikaracak-XXXX`, sandi `cikaracak`.
2. Sambungkan HP ke WiFi itu. Halaman pengaturan biasanya terbuka sendiri; bila tidak, buka `192.168.4.1`.
3. Pilih **Configure WiFi**, pilih WiFi sekolah, isi sandinya, lalu isi:
   - **Alamat server**: `https://xxxx.supabase.co` (Supabase → Project Settings → API → Project URL)
   - **Kunci anon / publishable**: dari halaman yang sama
   - **ID alat** dan **Kunci alat**: dari halaman Alat di aplikasi (kunci hanya tampil sekali saat alat dibuat)
   - **Pesan layar**: tulisan besar untuk screensaver, pisahkan dengan `|`
4. Simpan. Alat menyala ulang dan Ciki muncul.

Untuk mengubah pengaturan kapan saja: **tahan tombol BOOT 3 detik**. Kunci alat yang dikosongkan tidak diganti.

### Yang tampil di layar

| Keadaan | Ciki | Tulisan |
|---|---|---|
| Menunggu | melirik ke sana-sini, berkedip | Tempelkan kartu |
| Kartu terbaca | mata membesar | Sebentar... |
| Hadir | mata "^ ^", pipi merah, tetes air berjatuhan | Selamat pagi, Adit! / Hadir 06:50 |
| Terlambat | cemas, keringat | Halo, Adit / Tercatat 07:25, telat 25 menit |
| Sudah tap | mengedip | Sudah tercatat |
| Pulang | tersenyum puas | Hati-hati di jalan, Adit! |
| Kartu belum terdaftar | bingung, tanda tanya | Hubungi operator sekolah |
| Kartu baru didaftarkan | mata bintang | Kartu terdaftar! |
| Internet putus | tersenyum, awan | Tersimpan, dikirim saat internet kembali |

Setelah 45 detik tanpa kartu, layar berganti ke **screensaver**: jam besar dan tanggal, pesan berjalan dengan
huruf besar, jumlah siswa yang sudah tap hari ini, dan Ciki tidur. Tempel kartu kapan saja untuk membangunkannya.

Pojok kanan atas: batang hijau = tersambung ke server, abu-abu dicoret = offline. Angka kuning = jumlah tap
yang tersimpan dan belum terkirim (maksimal 2000, dikirim otomatis ketika internet kembali, berlaku 7 hari).

### Bila ada masalah

| Gejala | Coba |
|---|---|
| WiFi sering putus | Dekatkan alat ke router. Firmware sudah memakai daya pancar rendah yang lebih stabil untuk C3 Super Mini. |
| WiFi HP di dekat alat terganggu / putus | Lihat bagian "Mencegah gangguan WiFi" di bawah. |
| "Kunci alat salah" | Kunci di alat berbeda dengan server. Buat kunci baru di aplikasi, lalu tahan BOOT dan isi ulang. |
| Gambar berbintik | Kabel SPI terlalu panjang. Kompilasi ulang dengan `-D TFT_SPI_HZ=27000000`. |
| Jam "--:--" terus | Internet sekolah memblokir NTP. Minta operator jaringan membuka UDP port 123. |


## Mencegah gangguan WiFi di sekitar alat

Rakitan dengan kabel jumper panjang bisa memancarkan derau listrik ke pita 2,4 GHz (pita WiFi), sehingga
HP yang diletakkan dekat alat sinyalnya melemah atau putus. Firmware 0.2.1 sudah menguranginya:

- Jam SPI layar diturunkan dari 40 ke 26,7 MHz, dan layar hanya digambar seperlunya
  (30/detik saat bereaksi, 20 saat siaga, 4 saat screensaver diam).
- Pembaca kartu dipindai 10x per detik, bukan terus-menerus.
- WiFi memakai mode hemat daya modem, dan sambung ulang memakai jeda bertambah (10 detik … 2 menit),
  bukan memindai semua kanal terus-menerus.
- Tanpa WiFi tersimpan (mode demo), radio WiFi dimatikan sama sekali.

Di sisi rakitan, yang paling berpengaruh:

1. **Kabel sependek mungkin**, terutama SCK dan MOSI (kabel jam data). Kabel panjang = antena.
2. **Kabel GND ikut menyertai** kabel SCK/MOSI (dipilin atau dirapatkan berdampingan).
3. **Kapasitor penyangga** dekat pin daya: 10 µF + 100 nF antara 3V3–GND di modul layar dan di RC522.
4. **Catu daya bersih**: pakai charger/power bank yang baik; kabel USB murah sering menjadi sumber derau.
5. Untuk alat permanen, **pindah ke PCB atau papan berlubang** dengan kabel pendek, atau
   **ESP32-S3-DevKitC-1U** dengan antena eksternal yang diletakkan menjauhi papan.

Cara memastikan sumbernya: dekatkan HP ke alat, lalu cabut kabel layar (alat tetap menyala).
Bila sinyal HP kembali normal, sumbernya jalur layar (perbaiki poin 1–3). Bila tidak, sumbernya radio
WiFi atau catu daya.

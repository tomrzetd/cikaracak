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

// Peta pin Cikaracak Hadir untuk ESP32-C3 Super Mini.
// RC522 dan layar ST7789 berbagi jalur SPI (SCK, MOSI); masing-masing punya CS sendiri.
// Lihat docs/hadir-perakitan.md untuk gambar sambungan.
#pragma once

// SPI bersama
#define PIN_SCK      4   // RC522 SCK  + layar SCL
#define PIN_MISO     5   // RC522 MISO (layar tidak memakai MISO)
#define PIN_MOSI     6   // RC522 MOSI + layar SDA

// RC522 (13,56 MHz) — VCC ke 3V3, JANGAN ke 5V
#define PIN_RFID_SS  0   // label "SDA" pada modul RC522
#define PIN_RFID_RST 1

// Layar ST7789 1,47" 172x320
#define PIN_TFT_CS   7
#define PIN_TFT_DC   3
#define PIN_TFT_RST  10
#define PIN_TFT_BLK  21  // lampu latar

// Lain-lain
#define PIN_BUZZER   20  // modul buzzer aktif
#define PIN_LED      8   // LED biru bawaan papan, aktif LOW
#define PIN_TOMBOL   9   // tombol BOOT bawaan papan, aktif LOW

// Modul buzzer "低电平触发" (picu LOW): LOW = bunyi. Ganti ke 0 bila buzzer berbunyi saat HIGH.
#ifndef BUZZER_AKTIF_LOW
#define BUZZER_AKTIF_LOW 1
#endif

#define TFT_LEBAR    172
#define TFT_TINGGI   320

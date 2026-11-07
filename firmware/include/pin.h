// Peta pin Cikaracak Hadir.
//  • ESP32-C3 Super Mini (bawaan)
//  • ESP32-S3-DevKitC-1 / DevKitC-1U (versi -1U punya soket antena eksternal U.FL, WiFi lebih tangguh)
// RC522 dan layar ST7789 berbagi jalur SPI (SCK, MOSI); masing-masing punya CS sendiri.
// Lihat docs/hadir-perakitan.md untuk gambar sambungan.
#pragma once
#include <Arduino.h>

#if CONFIG_IDF_TARGET_ESP32S3
// ---- ESP32-S3-DevKitC-1(U): semua di header kiri (J1), menghindari pin strapping 0/3/45/46 dan USB 19/20 ----
#define PAPAN        "ESP32-S3"
#define PIN_SCK      12  // RC522 SCK  + layar SCL
#define PIN_MISO     13  // RC522 MISO
#define PIN_MOSI     11  // RC522 MOSI + layar SDA
#define PIN_RFID_SS  10  // label "SDA" pada modul RC522
#define PIN_RFID_RST 9
#define PIN_TFT_CS   14
#define PIN_TFT_DC   8
#define PIN_TFT_RST  18
#define PIN_TFT_BLK  17
#define PIN_BUZZER   16
#define PIN_TOMBOL   0   // tombol BOOT bawaan papan, aktif LOW
#ifdef RGB_BUILTIN
#define PIN_LED      RGB_BUILTIN   // LED RGB bawaan (GPIO48/38), digitalWrite HIGH = putih
#define LED_AKTIF_LOW 0
#else
#define PIN_LED      -1
#define LED_AKTIF_LOW 0
#endif

#else
// ---- ESP32-C3 Super Mini ----
#define PAPAN        "ESP32-C3"
#define PIN_SCK      4   // RC522 SCK  + layar SCL
#define PIN_MISO     5   // RC522 MISO (layar tidak memakai MISO)
#define PIN_MOSI     6   // RC522 MOSI + layar SDA
#define PIN_RFID_SS  0   // label "SDA" pada modul RC522
#define PIN_RFID_RST 1
#define PIN_TFT_CS   7
#define PIN_TFT_DC   3
#define PIN_TFT_RST  10
#define PIN_TFT_BLK  21  // lampu latar
#define PIN_BUZZER   20  // modul buzzer aktif
#define PIN_LED      8   // LED biru bawaan papan
#define LED_AKTIF_LOW 1
#define PIN_TOMBOL   9   // tombol BOOT bawaan papan, aktif LOW
#endif

// RC522 (13,56 MHz): VCC ke 3V3, JANGAN ke 5V.
// Modul buzzer "低电平触发" (picu LOW): LOW = bunyi. Ganti ke 0 bila buzzer berbunyi saat HIGH.
#ifndef BUZZER_AKTIF_LOW
#define BUZZER_AKTIF_LOW 1
#endif

static inline void ledPasang(bool nyala) {
  if (PIN_LED < 0) return;
  digitalWrite(PIN_LED, nyala == (bool)LED_AKTIF_LOW ? LOW : HIGH);
}

#define TFT_LEBAR    172
#define TFT_TINGGI   320

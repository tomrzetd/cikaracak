// Cikaracak — firmware UJI KARTU.
// Tujuan: memastikan rakitan (RC522, layar, buzzer) benar dan kartu siswa bisa dibaca.
// Tidak butuh WiFi atau server. Hanya UID kartu yang dibaca; tidak ada data pribadi di dalam kartu yang diambil.
//
// Yang terjadi:
//   1. Layar menampilkan bilah warna (merah, hijau, biru) + 2 bip  -> layar & buzzer OK
//   2. Memeriksa RC522: versi chip ditampilkan, atau pesan "tidak terdeteksi" beserta pin yang harus dicek
//   3. Setiap kartu yang ditempel: UID, jenis kartu, dan apakah bisa dipakai untuk presensi
//   4. Semua bacaan juga dikirim ke Serial Monitor (115200) sebagai baris CSV: no,uid,jenis,sak,ukuran_uid

#include <Arduino.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include "pin.h"

static Adafruit_ST7789 tft(&SPI, PIN_TFT_CS, PIN_TFT_DC, PIN_TFT_RST);
static MFRC522 rfid(PIN_RFID_SS, PIN_RFID_RST);

static const uint16_t HIJAU = 0x2E89, KUNING = 0xFE60, MERAH = 0xE8E4, BIRU = 0x3A9F, ABU = 0x8410, LATAR = 0x0000;

static uint32_t jumlahBaca = 0;
static String uidTerakhir;
static String daftarUnik[60];
static uint8_t jumlahUnik = 0;
static uint32_t terakhirAktif = 0;
static bool petunjukTampil = false;
static bool rfidSiap = false;
static bool tampilHasil = false;

static void bunyi(uint16_t ms) {
  digitalWrite(PIN_BUZZER, BUZZER_AKTIF_LOW ? LOW : HIGH);
  delay(ms);
  digitalWrite(PIN_BUZZER, BUZZER_AKTIF_LOW ? HIGH : LOW);
}

static void tengah(const String &teks, int16_t y, uint8_t ukuran, uint16_t warna) {
  int16_t x1, y1; uint16_t w, h;
  tft.setTextSize(ukuran);
  tft.getTextBounds(teks, 0, y, &x1, &y1, &w, &h);
  tft.setTextColor(warna);
  tft.setCursor((tft.width() - (int16_t)w) / 2, y);
  tft.print(teks);
}

static void layarSiaga() {
  tft.fillScreen(LATAR);
  tengah("CIKARACAK", 10, 2, ABU);
  tengah("UJI KARTU", 30, 1, ABU);
  tengah("Tempelkan kartu", 70, 2, 0xFFFF);
  tengah(String("Dibaca: ") + jumlahBaca + "   Kartu berbeda: " + jumlahUnik, 110, 1, ABU);
  tengah("Serial Monitor 115200 untuk log", 150, 1, ABU);
  terakhirAktif = millis();
  petunjukTampil = false;
}

static const char *namaVersi(byte v) {
  switch (v) {
    case 0x91: return "MFRC522 v1.0";
    case 0x92: return "MFRC522 v2.0";
    case 0x88: return "FM17522 (tiruan)";
    case 0xB2: return "FM17522 (tiruan)";
    case 0x12: return "tiruan (0x12)";
    default:   return nullptr;
  }
}

void setup() {
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, BUZZER_AKTIF_LOW ? HIGH : LOW);   // diam dulu
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, HIGH);
  pinMode(PIN_TFT_BLK, OUTPUT);
  digitalWrite(PIN_TFT_BLK, HIGH);
  Serial.begin(115200);
  delay(300);

  SPI.begin(PIN_SCK, PIN_MISO, PIN_MOSI);
  tft.init(TFT_LEBAR, TFT_TINGGI);   // pustaka mengatur offset kolom 34 untuk panel 172x320
  tft.setRotation(1);                // mendatar 320x172

  // 1. Uji layar & buzzer
  const uint16_t warna[] = {MERAH, HIJAU, BIRU};
  for (uint8_t i = 0; i < 3; i++) tft.fillRect(i * (tft.width() / 3), 0, tft.width() / 3 + 1, tft.height(), warna[i]);
  tengah("Layar OK?", 70, 2, 0xFFFF);
  bunyi(80); delay(120); bunyi(80);
  delay(1200);

  // 2. Uji RC522
  rfid.PCD_Init();
  delay(50);
  byte v = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  const char *nama = namaVersi(v);
  tft.fillScreen(LATAR);
  Serial.printf("\n# Cikaracak uji kartu. RC522 VersionReg=0x%02X\n", v);
  if (v == 0x00 || v == 0xFF) {
    rfidSiap = false;
    tengah("RC522 TIDAK TERDETEKSI", 12, 2, MERAH);
    tft.setTextSize(1); tft.setTextColor(0xFFFF);
    const char *baris[] = {
      "Cek kabel RC522:",
      "3.3V -> 3V3 (BUKAN 5V)   GND -> GND",
      "SCK  -> GPIO4    MISO -> GPIO5",
      "MOSI -> GPIO6    SDA  -> GPIO0",
      "RST  -> GPIO1",
      "Lalu tekan tombol RST di papan ESP32."};
    for (uint8_t i = 0; i < 6; i++) { tft.setCursor(14, 50 + i * 18); tft.print(baris[i]); }
    Serial.println("# RC522 tidak terdeteksi. Periksa kabel.");
    for (uint8_t i = 0; i < 3; i++) { bunyi(400); delay(200); }
    return;
  }
  rfidSiap = true;
  rfid.PCD_SetAntennaGain(MFRC522::RxGain_max);
  tengah("RC522 terdeteksi", 50, 2, HIJAU);
  tengah(nama ? nama : (String("versi 0x") + String(v, HEX)), 85, 2, 0xFFFF);
  bunyi(60);
  delay(1500);
  Serial.println("no,uid,jenis,sak,ukuran_uid");
  layarSiaga();
}

void loop() {
  if (!rfidSiap) { delay(1000); return; }

  // Kembali ke layar siaga 6 detik setelah kartu terbaca
  if (tampilHasil && millis() - terakhirAktif > 6000) { layarSiaga(); tampilHasil = false; }

  // Petunjuk bila sejak menyala belum ada satu kartu pun yang terbaca
  if (jumlahBaca == 0 && !petunjukTampil && millis() - terakhirAktif > 30000) {
    tft.fillRect(0, 128, tft.width(), 44, LATAR);
    tengah("Kartu tidak terbaca sama sekali?", 132, 1, KUNING);
    tengah("Mungkin bukan 13,56 MHz. Coba kartu/stiker MIFARE.", 148, 1, KUNING);
    petunjukTampil = true;
  }

  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) { delay(30); return; }

  String uid;
  for (byte i = 0; i < rfid.uid.size; i++) { if (rfid.uid.uidByte[i] < 0x10) uid += '0'; uid += String(rfid.uid.uidByte[i], HEX); }
  uid.toUpperCase();
  MFRC522::PICC_Type tipe = rfid.PICC_GetType(rfid.uid.sak);
  String namaTipe = String((const char *)rfid.PICC_GetTypeName(tipe));
  bool cocok = tipe == MFRC522::PICC_TYPE_MIFARE_1K || tipe == MFRC522::PICC_TYPE_MIFARE_4K ||
               tipe == MFRC522::PICC_TYPE_MIFARE_MINI || tipe == MFRC522::PICC_TYPE_MIFARE_UL ||
               tipe == MFRC522::PICC_TYPE_ISO_14443_4 || tipe == MFRC522::PICC_TYPE_MIFARE_PLUS;

  jumlahBaca++;
  bool baru = true;
  for (uint8_t i = 0; i < jumlahUnik; i++) if (daftarUnik[i] == uid) { baru = false; break; }
  if (baru && jumlahUnik < 60) daftarUnik[jumlahUnik++] = uid;
  bool sama = uid == uidTerakhir;
  uidTerakhir = uid;

  Serial.printf("%lu,%s,%s,0x%02X,%u\n", (unsigned long)jumlahBaca, uid.c_str(), namaTipe.c_str(), rfid.uid.sak, rfid.uid.size);

  tft.fillScreen(LATAR);
  tft.fillRect(0, 0, tft.width(), 6, cocok ? HIJAU : KUNING);
  tengah(cocok ? "KARTU BISA DIPAKAI" : "JENIS KARTU LAIN", 16, 2, cocok ? HIJAU : KUNING);
  tengah(uid, 52, uid.length() > 10 ? 2 : 3, 0xFFFF);
  tengah(namaTipe, 92, 1, ABU);
  tengah(String("UID ") + rfid.uid.size + " byte  |  SAK 0x" + String(rfid.uid.sak, HEX), 108, 1, ABU);
  tengah(sama ? "Sama dengan kartu sebelumnya" : (baru ? "Kartu baru" : "Pernah dibaca"), 128, 1, sama ? KUNING : 0xFFFF);
  tengah(String("Dibaca: ") + jumlahBaca + "   Kartu berbeda: " + jumlahUnik, 150, 1, ABU);

  if (cocok) bunyi(70); else { bunyi(70); delay(90); bunyi(70); }
  digitalWrite(PIN_LED, LOW); delay(60); digitalWrite(PIN_LED, HIGH);

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  terakhirAktif = millis();
  petunjukTampil = false;
  tampilHasil = true;
  delay(1200);   // jeda agar kartu yang sama tidak terbaca berulang saat masih menempel
}

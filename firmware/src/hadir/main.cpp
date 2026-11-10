// Cikaracak Hadir — firmware alat presensi gerbang (ESP32-C3 Super Mini + RC522 + ST7789 1,47").
//
// Alur: kartu ditempel -> UID dibaca -> tap ditandatangani (HMAC kunci alat) -> dikirim ke server.
//  • Internet lancar : jawaban server (hadir/terlambat/pulang …) + nama panggilan tampil di layar.
//  • Internet putus  : tap disimpan di memori alat (LittleFS) beserta jamnya, dikirim otomatis nanti.
//  • Tahan BOOT 3 detik: mode pengaturan (WiFi, alamat server, ID & kunci alat, pesan layar).
//
// Jaringan berjalan di tugas FreeRTOS terpisah, jadi animasi wajah Ciki tetap mulus saat menunggu server.
// Lihat docs/hadir-perakitan.md dan docs/hadir-supabase.md.

#include <Arduino.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <time.h>
#include <esp_system.h>
#include <esp_wifi.h>
#include <sys/time.h>
#include "pin.h"
#include "logika.h"
#include "wajah.h"
#include "akar_ca.h"

#define VERSI "0.3.0-serial"
#ifndef ZONA_WAKTU
#define ZONA_WAKTU "WIB-7"          // WITA-8 / WIT-9 untuk sekolah di zona lain
#endif
#ifndef WIFI_DAYA_RENDAH
#if CONFIG_IDF_TARGET_ESP32C3
#define WIFI_DAYA_RENDAH 1          // banyak papan C3 Super Mini lebih stabil dengan daya pancar rendah
#else
#define WIFI_DAYA_RENDAH 0          // ESP32-S3 DevKit (apalagi dengan antena eksternal): daya penuh
#endif
#endif
#ifndef TFT_SPI_HZ
#define TFT_SPI_HZ 27000000         // 26,7 MHz: cukup untuk 30 bingkai/detik, derau ke pita WiFi 2,4 GHz lebih kecil
#endif
#define SANDI_PORTAL "cikaracak"
#define MAKS_ANTREAN 2000
#define FILE_ANTREAN "/antrean.txt"
#define FILE_BARU "/antrean.baru"

// ---------------- perangkat ----------------
static Adafruit_ST7789 tft(&SPI, PIN_TFT_CS, PIN_TFT_DC, PIN_TFT_RST);
static MFRC522 rfid(PIN_RFID_SS, PIN_RFID_RST);
static GFXcanvas16 *kanvas = nullptr;
static ck::Layar *layar = nullptr;
static ck::DataLayar data;

// ---------------- pengaturan ----------------
struct Pengaturan {
  char server[100] = "";     // https://xxxx.supabase.co
  char anon[260] = "";       // kunci anon / publishable
  char alat[9] = "";         // ID alat 8 karakter
  uint8_t kunci[32];
  bool adaKunci = false;
  char pesan[400] = "";
};
static Pengaturan cfg;
static Preferences pref;

// Profil daya pancar dapat diganti lewat USB Serial tanpa mengompilasi ulang.
// Default C3 = 8,5 dBm (kompatibilitas); S3 = 19,5 dBm.
static uint8_t profilDayaWifi = WIFI_DAYA_RENDAH ? 0 : 3;
static bool wifiHemat = true;
static void terapkanDayaWifi() {
  switch (profilDayaWifi) {
    case 0: WiFi.setTxPower(WIFI_POWER_8_5dBm); break;
    case 1: WiFi.setTxPower(WIFI_POWER_11dBm); break;
    case 2: WiFi.setTxPower(WIFI_POWER_15dBm); break;
    default: WiFi.setTxPower(WIFI_POWER_19_5dBm); break;
  }
}
static const char *namaDayaWifi() {
  static const char *NAMA[] = {"8.5", "11", "15", "19.5"};
  return NAMA[profilDayaWifi < 4 ? profilDayaWifi : 0];
}

static bool cfgLengkap() {
  return !strncmp(cfg.server, "http", 4) && cfg.anon[0] && strlen(cfg.alat) == 8 && cfg.adaKunci;
}

static void muatPengaturan() {
  pref.begin("ckhadir", true);
  pref.getString("server", cfg.server, sizeof cfg.server);
  pref.getString("anon", cfg.anon, sizeof cfg.anon);
  pref.getString("alat", cfg.alat, sizeof cfg.alat);
  cfg.adaKunci = pref.getBytes("kunci", cfg.kunci, 32) == 32;
  pref.getString("pesan", cfg.pesan, sizeof cfg.pesan);
  profilDayaWifi = pref.getUChar("wifi_tx", profilDayaWifi);
  if (profilDayaWifi > 3) profilDayaWifi = 0;
  wifiHemat = pref.getBool("wifi_sleep", true);
  pref.end();
  size_t n = strlen(cfg.server);
  while (n && cfg.server[n - 1] == '/') cfg.server[--n] = 0;   // buang garis miring di akhir
  if (cfg.pesan[0]) snprintf(data.pesan, sizeof data.pesan, "%s", cfg.pesan);
}

// ---------------- komunikasi antar-tugas ----------------
struct Jawaban { char hasil[20]; char nama[20]; char jam[6]; int16_t menit; };
static QueueHandle_t qTugas, qJawaban;
static TaskHandle_t hJaringan = nullptr;
static SemaphoreHandle_t kunciFS, kunciData;
static volatile uint16_t jumlahAntrean = 0;
static volatile bool serverOk = false, kunciSalah = false, mintaNtp = false;
static char namaSekolah[48] = "";

static bool jamSiap() { return time(nullptr) > 1700000000; }

// Jam dari header "Date" jawaban server (RFC 1123, GMT). Lebih cepat dan lebih andal daripada NTP di jaringan
// sekolah yang memblokir UDP 123. NTP tetap berjalan dan akan menyempurnakan bila tersedia.
static void aturJamDariHttp(const String &tgl) {
  uint32_t t;
  if (!ck::waktuDariHttp(tgl.c_str(), t)) return;
  if (!jamSiap() || llabs((long long)t - (long long)time(nullptr)) > 120) {
    struct timeval tv = {(time_t)t, 0};
    settimeofday(&tv, nullptr);
    Serial.printf("[jam] dari server: %s\n", tgl.c_str());
  }
}

static void salinAscii(char *ke, size_t n, const char *dari) {   // font layar hanya ASCII
  size_t j = 0;
  for (size_t i = 0; dari && dari[i] && j + 1 < n; i++) {
    unsigned char c = (unsigned char)dari[i];
    if (c >= 32 && c < 127) ke[j++] = (char)c;
    else if (c >= 0xC0) ke[j++] = '?';   // awal karakter UTF-8 di luar ASCII
  }
  ke[j] = 0;
}

// ---------------- antrean offline (LittleFS) ----------------
static uint16_t hitungAntrean() {
  File f = LittleFS.open(FILE_ANTREAN, "r");
  if (!f) return 0;
  uint16_t n = 0;
  while (f.available()) if (f.read() == '\n') n++;
  f.close();
  return n;
}

static bool simpanAntre(const ck::Antre &a) {
  if (jumlahAntrean >= MAKS_ANTREAN || !a.waktu) return false;
  char baris[64];
  ck::tulisAntre(a, baris, sizeof baris);
  xSemaphoreTake(kunciFS, portMAX_DELAY);
  File f = LittleFS.open(FILE_ANTREAN, "a");
  bool ok = f && f.println(baris) > 0;
  if (f) f.close();
  if (ok) jumlahAntrean++;
  xSemaphoreGive(kunciFS);
  return ok;
}

// Buang n baris pertama (yang sudah terkirim). Baris baru yang ditambahkan sementara itu tetap aman.
static void buangAntrean(uint16_t n) {
  if (!n) return;
  xSemaphoreTake(kunciFS, portMAX_DELAY);
  File lama = LittleFS.open(FILE_ANTREAN, "r");
  File baru = LittleFS.open(FILE_BARU, "w");
  if (lama && baru) {
    uint16_t lewat = 0;
    while (lama.available() && lewat < n) if (lama.read() == '\n') lewat++;
    uint8_t buf[256];
    while (lama.available()) { size_t k = lama.read(buf, sizeof buf); baru.write(buf, k); }
  }
  if (lama) lama.close();
  if (baru) baru.close();
  LittleFS.remove(FILE_ANTREAN);
  LittleFS.rename(FILE_BARU, FILE_ANTREAN);
  jumlahAntrean = hitungAntrean();
  xSemaphoreGive(kunciFS);
}

// ---------------- HTTP ke server ----------------
static WiFiClientSecure klienAman;
static WiFiClient klienBiasa;

static bool posting(const char *fungsi, const char *badan, JsonDocument &doc) {
  if (!cfgLengkap() || WiFi.status() != WL_CONNECTED) return false;
  bool tls = !strncmp(cfg.server, "https://", 8);   // mbedTLS di sini tidak memeriksa tanggal sertifikat: jam tidak wajib
  char url[160];
  snprintf(url, sizeof url, "%s/rest/v1/rpc/%s", cfg.server, fungsi);
  HTTPClient http;
  http.setReuse(true);
  http.setConnectTimeout(4000);
  http.setTimeout(5000);
  if (!http.begin(tls ? (WiFiClient &)klienAman : klienBiasa, url)) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", cfg.anon);
  if (!strncmp(cfg.anon, "eyJ", 3)) {   // kunci anon lama (JWT); kunci "sb_publishable_" cukup di apikey
    char auth[280]; snprintf(auth, sizeof auth, "Bearer %s", cfg.anon);
    http.addHeader("Authorization", auth);
  }
  static const char *KEPALA[] = {"Date"};
  http.collectHeaders(KEPALA, 1);
  int kode = http.POST((uint8_t *)badan, strlen(badan));
  if (kode > 0) aturJamDariHttp(http.header("Date"));
  bool ok = false;
  if (kode == 200) {
    ok = !deserializeJson(doc, http.getString());
  } else {
    Serial.printf("[net] %s HTTP %d\n", fungsi, kode);
  }
  http.end();
  serverOk = ok;
  return ok;
}

static bool kirimTap(const ck::Antre &a, bool offline, Jawaban &j) {
  char pesan[96], tanda[65], badan[256];
  ck::pesanTap(pesan, sizeof pesan, cfg.alat, a.waktu, a.nonce, a.uid, offline);
  ck::tanda(cfg.kunci, pesan, tanda);
  snprintf(badan, sizeof badan,
           "{\"p_alat\":\"%s\",\"p_uid\":\"%s\",\"p_waktu\":%lu,\"p_nonce\":\"%s\",\"p_offline\":%s,\"p_tanda\":\"%s\"}",
           cfg.alat, a.uid, (unsigned long)a.waktu, a.nonce, offline ? "true" : "false", tanda);
  JsonDocument doc;
  if (!posting("catat_tap", badan, doc)) return false;
  memset(&j, 0, sizeof j);
  salinAscii(j.hasil, sizeof j.hasil, doc["hasil"] | "");
  salinAscii(j.nama, sizeof j.nama, doc["nama"] | "");
  salinAscii(j.jam, sizeof j.jam, doc["jam"] | "");
  j.menit = doc["terlambat_menit"] | 0;
  if (!strcmp(j.hasil, "tanda_salah")) kunciSalah = true;
  else if (j.hasil[0]) kunciSalah = false;
  return j.hasil[0] != 0;
}

static void lapor() {
  if (!jamSiap()) return;
  uint32_t w = (uint32_t)time(nullptr);
  char pesan[64], tanda[65], badan[200];
  ck::pesanLapor(pesan, sizeof pesan, cfg.alat, w, VERSI, jumlahAntrean);
  ck::tanda(cfg.kunci, pesan, tanda);
  snprintf(badan, sizeof badan, "{\"p_alat\":\"%s\",\"p_waktu\":%lu,\"p_versi\":\"%s\",\"p_antrean\":%u,\"p_tanda\":\"%s\"}",
           cfg.alat, (unsigned long)w, VERSI, (unsigned)jumlahAntrean, tanda);
  JsonDocument doc;
  if (!posting("lapor_alat", badan, doc)) return;
  const char *h = doc["hasil"] | "";
  kunciSalah = !strcmp(h, "tanda_salah");
  if (!strcmp(h, "waktu_salah")) mintaNtp = true;
  if (!strcmp(h, "ok")) {
    xSemaphoreTake(kunciData, portMAX_DELAY);
    salinAscii(namaSekolah, sizeof namaSekolah, doc["sekolah"] | "");
    xSemaphoreGive(kunciData);
  }
  Serial.printf("[net] lapor: %s, antrean %u, heap %u\n", h, (unsigned)jumlahAntrean, (unsigned)ESP.getFreeHeap());
}

// Kirim tap yang tersimpan, sedikit demi sedikit. Berhenti bila ada tap baru dari siswa (didahulukan).
static uint32_t jedaAntreanSampai = 0;
static void kirimAntrean() {
  if (!jumlahAntrean || millis() < jedaAntreanSampai) return;
  ck::Antre daftar[10]; uint8_t n = 0;
  xSemaphoreTake(kunciFS, portMAX_DELAY);
  File f = LittleFS.open(FILE_ANTREAN, "r");
  while (f && f.available() && n < 10) {
    String baris = f.readStringUntil('\n');
    ck::Antre a{};
    if (ck::uraiAntre(baris.c_str(), a)) daftar[n++] = a;
    else daftar[n++] = ck::Antre{};   // baris rusak: tetap dihitung agar terbuang
  }
  if (f) f.close();
  xSemaphoreGive(kunciFS);

  uint16_t selesai = 0;
  for (uint8_t i = 0; i < n; i++) {
    if (uxQueueMessagesWaiting(qTugas)) break;
    if (!daftar[i].uid[0]) { selesai++; continue; }
    Jawaban j;
    if (!kirimTap(daftar[i], true, j)) { jedaAntreanSampai = millis() + 30000; break; }
    if (!strcmp(j.hasil, "tanda_salah")) { jedaAntreanSampai = millis() + 600000; break; }   // tunggu kunci diperbaiki
    selesai++;
  }
  buangAntrean(selesai);
}

// Belum ada jam: minta jam ke server dengan permintaan ringan (apa pun jawabannya, header Date ikut).
static uint32_t mintaJamBerikut = 0;
static void ambilJamServer() {
  if (jamSiap() || millis() < mintaJamBerikut || !cfg.server[0]) return;
  mintaJamBerikut = millis() + 20000;
  bool tls = !strncmp(cfg.server, "https://", 8);
  char url[140];
  snprintf(url, sizeof url, "%s/rest/v1/", cfg.server);
  HTTPClient http;
  http.setConnectTimeout(4000);
  http.setTimeout(5000);
  if (!http.begin(tls ? (WiFiClient &)klienAman : klienBiasa, url)) return;
  if (cfg.anon[0]) http.addHeader("apikey", cfg.anon);
  static const char *KEPALA[] = {"Date"};
  http.collectHeaders(KEPALA, 1);
  if (http.GET() > 0) aturJamDariHttp(http.header("Date"));
  http.end();
}

static void tugasJaringan(void *) {
  klienAman.setCACert(AKAR_CA);
  klienAman.setHandshakeTimeout(6);
  uint32_t laporBerikut = 5000;
  for (;;) {
    ck::Antre a;
    if (xQueueReceive(qTugas, &a, pdMS_TO_TICKS(500)) == pdTRUE) {
      Jawaban j{};
      if (!kirimTap(a, false, j)) {
        memset(&j, 0, sizeof j);
        strcpy(j.hasil, (a.waktu && simpanAntre(a)) ? "simpan" : "gangguan");
      }
      xQueueSend(qJawaban, &j, 0);
      continue;
    }
    if (WiFi.status() == WL_CONNECTED && cfg.server[0]) ambilJamServer();
    if (WiFi.status() == WL_CONNECTED && cfgLengkap()) {
      if (millis() > laporBerikut) { lapor(); laporBerikut = millis() + 300000; }
      kirimAntrean();
    } else {
      serverOk = false;
    }
  }
}

// ---------------- buzzer & LED tanpa menghentikan animasi ----------------
static const uint16_t POLA_SENANG[] = {60, 60, 90, 0}, POLA_PENDEK[] = {80, 0}, POLA_RAGU[] = {60, 80, 60, 80, 60, 0}, POLA_GALAT[] = {450, 0};
static const uint16_t *pola = nullptr;
static uint8_t polaKe = 0;
static uint32_t polaSampai = 0;

static void buzzer(bool nyala) {
  digitalWrite(PIN_BUZZER, nyala == (bool)BUZZER_AKTIF_LOW ? LOW : HIGH);
  ledPasang(nyala);
}
static void bunyi(ck::Bunyi b) {
  pola = b == ck::Bunyi::Senang ? POLA_SENANG : b == ck::Bunyi::Pendek ? POLA_PENDEK : b == ck::Bunyi::Ragu ? POLA_RAGU : POLA_GALAT;
  polaKe = 0; polaSampai = millis() + pola[0]; buzzer(true);
}
static void langkahBunyi() {
  if (!pola || millis() < polaSampai) return;
  polaKe++;
  if (!pola[polaKe]) { pola = nullptr; buzzer(false); return; }
  buzzer(polaKe % 2 == 0);
  polaSampai = millis() + pola[polaKe];
}

// ---------------- layar ----------------
static void dorongLayar() { tft.drawRGBBitmap(0, 0, kanvas->getBuffer(), kanvas->width(), kanvas->height()); }

static void layarInfo(const char *judul, const char *b1, const char *b2, const char *b3, const char *b4 = "") {
  kanvas->fillScreen(0x0884);
  kanvas->setFont(nullptr); kanvas->setTextWrap(false);
  kanvas->setTextSize(2); kanvas->setTextColor(0xFE60); kanvas->setCursor(10, 12); kanvas->print(judul);
  kanvas->setTextColor(0xFFFF);
  kanvas->setCursor(10, 46); kanvas->print(b1);
  kanvas->setCursor(10, 76); kanvas->print(b2);
  kanvas->setCursor(10, 106); kanvas->print(b3);
  kanvas->setTextSize(1); kanvas->setTextColor(0x9CF3);
  kanvas->setCursor(10, 146); kanvas->print(b4);
  dorongLayar();
}

// ---------------- diagnosa WiFi ----------------
static volatile uint8_t alasanPutus = 0;
static volatile bool pernahTersambung = false;
static char ssidTersimpan[33] = "";

static void bacaSsidTersimpan() {
  wifi_config_t c;
  if (esp_wifi_get_config(WIFI_IF_STA, &c) == ESP_OK) snprintf(ssidTersimpan, sizeof ssidTersimpan, "%s", (const char *)c.sta.ssid);
}
static const char *artiAlasan(uint8_t a) {
  switch (a) {
    case 0: return "menyambung...";
    case 201: return "tidak ditemukan (harus 2,4 GHz)";
    case 2: case 15: case 202: case 204: return "sandi WiFi salah?";
    case 203: return "ditolak router";
    case 200: case 8: return "sinyal hilang";
    default: return "putus";
  }
}
static void peristiwaWifi(arduino_event_id_t e, arduino_event_info_t info) {
  if (e == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    alasanPutus = info.wifi_sta_disconnected.reason;
    Serial.printf("[wifi] putus, alasan %u (%s)\n", alasanPutus, artiAlasan(alasanPutus));
  } else if (e == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
    alasanPutus = 0; pernahTersambung = true;
    Serial.printf("[wifi] tersambung %s, IP %s, RSSI %d\n", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), WiFi.RSSI());
  }
}

static bool wifiDipakai = false;
static uint32_t cobaSambungBerikut = 0, jedaSambung = 10000;

static const char *HARI[] = {"Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"};
static const char *BULAN[] = {"Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"};
static int hariTerakhir = -1;

static void perbaruiData(struct tm &t, bool adaJam) {
  if (adaJam) {
    snprintf(data.jam, sizeof data.jam, "%02d:%02d", t.tm_hour, t.tm_min);
    snprintf(data.tanggal, sizeof data.tanggal, "%s, %d %s", HARI[t.tm_wday], t.tm_mday, BULAN[t.tm_mon]);
    if (t.tm_yday != hariTerakhir) { hariTerakhir = t.tm_yday; data.tapHariIni = 0; }
  } else {
    strcpy(data.jam, "--:--"); strcpy(data.tanggal, "Menunggu jam internet");
  }
  data.antrean = jumlahAntrean;
  data.online = WiFi.status() == WL_CONNECTED && serverOk;
  if (!wifiDipakai) snprintf(data.infoWifi, sizeof data.infoWifi, "WiFi belum diatur");
  else if (WiFi.status() != WL_CONNECTED) snprintf(data.infoWifi, sizeof data.infoWifi, "%s: %s", ssidTersimpan[0] ? ssidTersimpan : "WiFi", artiAlasan(alasanPutus));
  else if (!serverOk && cfgLengkap()) snprintf(data.infoWifi, sizeof data.infoWifi, "WiFi OK, server belum menjawab");
  else data.infoWifi[0] = 0;
  data.siapServer = cfgLengkap() && !kunciSalah;
  xSemaphoreTake(kunciData, portMAX_DELAY);
  snprintf(data.sekolah, sizeof data.sekolah, "%s", namaSekolah);
  xSemaphoreGive(kunciData);
}

// ---------------- mode pengaturan (portal WiFi non-blocking) ----------------
// Parameter harus hidup selama portal berjalan. Versi sebelumnya memakai variabel lokal
// dan startConfigPortal() blocking, sehingga USB Serial tidak responsif saat AP aktif.
static WiFiManager wmPortal;
static WiFiManagerParameter pServer("server", "Alamat server (https://xxxx.supabase.co)", "", sizeof cfg.server - 1);
static WiFiManagerParameter pAnon("anon", "Kunci anon / publishable", "", sizeof cfg.anon - 1);
static WiFiManagerParameter pAlat("alat", "ID alat (8 karakter)", "", 8);
static WiFiManagerParameter pKunci("kunci", "Kunci alat (64 hex; kosong = tidak berubah)", "", 64);
static WiFiManagerParameter pPesan("pesan", "Pesan layar, pisahkan dengan |", "", sizeof cfg.pesan - 1);
static bool portalAktif = false, portalSimpan = false, portalDisiapkan = false;
static uint32_t portalMulai = 0;

static void tutupPortal() {
  if (!portalAktif) return;
  wmPortal.stopConfigPortal();
  portalAktif = false;
  portalSimpan = false;
  wifiDipakai = wmPortal.getWiFiIsSaved();
  if (wifiDipakai) {
    WiFi.mode(WIFI_STA);
    terapkanDayaWifi();
    WiFi.setSleep(wifiHemat);
    WiFi.begin();
  } else {
    WiFi.mode(WIFI_OFF);
  }
  bacaSsidTersimpan();
  if (hJaringan) vTaskResume(hJaringan);
  if (layar) layar->siaga();
  Serial.println("[portal] ditutup; USB Serial tetap aktif");
}

static void bukaPortal() {
  if (portalAktif) return;
  if (hJaringan) vTaskSuspend(hJaringan);
  buzzer(false);
  char ap[24];
  snprintf(ap, sizeof ap, "Cikaracak-%04X", (unsigned)(ESP.getEfuseMac() & 0xFFFF));
  layarInfo("MODE PENGATURAN", (String("WiFi: ") + ap).c_str(), "Sandi: " SANDI_PORTAL,
            "Buka 192.168.4.1", "USB Serial tetap aktif. Batas 5 menit.");
  if (!portalDisiapkan) {
    std::vector<const char *> menu = {"wifi", "exit"};
    wmPortal.setMenu(menu);
    wmPortal.setRemoveDuplicateAPs(true);
    wmPortal.setMinimumSignalQuality(15);
    wmPortal.setConfigPortalBlocking(false);
    wmPortal.setAPCallback([](WiFiManager *) { terapkanDayaWifi(); });
    wmPortal.setSaveParamsCallback([]() { portalSimpan = true; });
    wmPortal.setSaveConfigCallback([]() { portalSimpan = true; });
    wmPortal.setTitle("Cikaracak Hadir");
    wmPortal.addParameter(&pServer);
    wmPortal.addParameter(&pAnon);
    wmPortal.addParameter(&pAlat);
    wmPortal.addParameter(&pKunci);
    wmPortal.addParameter(&pPesan);
    portalDisiapkan = true;
  }
  pServer.setValue(cfg.server, sizeof cfg.server - 1);
  pAnon.setValue(cfg.anon, sizeof cfg.anon - 1);
  pAlat.setValue(cfg.alat, 8);
  pKunci.setValue("", 64); // kunci rahasia jangan pernah tampil di form
  pPesan.setValue(cfg.pesan, sizeof cfg.pesan - 1);
  portalSimpan = false;
  portalMulai = millis();
  portalAktif = true;
  // Non-blocking: wmPortal.process() dipanggil setiap iterasi loop.
  wmPortal.startConfigPortal(ap, SANDI_PORTAL);
  Serial.printf("[portal] aktif: %s | http://192.168.4.1 | ketik 'help'\n", ap);
}

static void prosesPortal() {
  if (!portalAktif) return;
  wmPortal.process();
  if (portalSimpan) {
    // Menyimpan dari thread loop yang sama, bukan dari callback HTTP.
    pref.begin("ckhadir", false);
    pref.putString("server", pServer.getValue());
    pref.putString("anon", pAnon.getValue());
    char alat[9]; snprintf(alat, sizeof alat, "%s", pAlat.getValue());
    for (char *p = alat; *p; p++) *p = (char)toupper((unsigned char)*p);
    pref.putString("alat", alat);
    uint8_t k[32];
    if (pKunci.getValue()[0]) {
      if (ck::dariHex(pKunci.getValue(), k, 32)) pref.putBytes("kunci", k, 32);
      else Serial.println("[portal] kunci hex tidak sah; kunci lama dipertahankan");
    }
    pref.putString("pesan", pPesan.getValue());
    pref.end();
    Serial.println("[portal] pengaturan disimpan; mulai ulang");
    delay(200);
    ESP.restart();
  }
  if (!wmPortal.getConfigPortalActive() || millis() - portalMulai >= 300000UL) {
    Serial.println("[portal] keluar / batas 5 menit");
    tutupPortal();
  }
}

// ---------------- konfigurasi & diagnostik lewat USB Serial ----------------
// Perintah tidak di-echo (sandi dan kunci tidak dicetak lagi). Serial CDC ESP32-C3
// berjalan di USB-C bawaan papan; kabel SPI/perangkat tidak menghabiskan port ini.
static bool pindaiWifiAktif = false;
static char barisSerial[512];
static size_t panjangSerial = 0;
static bool serialTerlaluPanjang = false;

static void bantuanSerial() {
  Serial.println(F("\n--- CIKARACAK USB SERIAL 115200 ---"));
  Serial.println(F("help                       : daftar perintah"));
  Serial.println(F("status                     : jaringan, RSSI, pin, heap, antrean"));
  Serial.println(F("wifi scan                  : cari SSID 2,4 GHz + RSSI"));
  Serial.println(F("wifi set NAMA|SANDI        : simpan WiFi & restart (boleh spasi)"));
  Serial.println(F("wifi reconnect             : sambung ulang"));
  Serial.println(F("wifi forget                : hapus HANYA WiFi, bukan kunci/antrean"));
  Serial.println(F("wifi tx 8.5|11|15|19.5     : profil daya pancar (dBm)"));
  Serial.println(F("wifi sleep on|off          : hemat daya modem"));
  Serial.println(F("config show                : cek konfigurasi (rahasia disamarkan)"));
  Serial.println(F("config server https://...  : alamat Supabase"));
  Serial.println(F("config anon NILAI          : publishable/anon key"));
  Serial.println(F("config id XXXXXXXX         : ID alat 8 karakter"));
  Serial.println(F("config key 64_HEX          : kunci alat 32 byte (64 hex)"));
  Serial.println(F("config message PESAN      : pesan layar; pemisah |"));
  Serial.println(F("portal                     : buka portal 192.168.4.1"));
  Serial.println(F("portal off                 : tutup portal"));
  Serial.println(F("reboot                     : mulai ulang alat"));
  Serial.println(F("CATATAN: Jangan bagikan log/riwayat perintah berisi rahasia."));
}
static void statusSerial() {
  Serial.printf("[status] %s %s | uptime=%lus heap=%u antrean=%u\n",
                PAPAN, VERSI, (unsigned long)(millis() / 1000),
                (unsigned)ESP.getFreeHeap(), (unsigned)jumlahAntrean);
  Serial.printf("[status] wifi=%d ssid=\"%s\" IP=%s\n", (int)WiFi.status(),
                ssidTersimpan, WiFi.localIP().toString().c_str());
  Serial.printf("[status] RSSI=%d dBm kanal=%d BSSID=%s putus=%u (%s)\n",
                WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0, WiFi.channel(),
                WiFi.status() == WL_CONNECTED ? WiFi.BSSIDstr().c_str() : "-",
                (unsigned)alasanPutus, artiAlasan(alasanPutus));
  Serial.printf("[status] TX=%s dBm sleep=%s portal=%s server=%s waktu=%s\n",
                namaDayaWifi(), wifiHemat ? "ON" : "OFF",
                portalAktif ? "ON" : "OFF", serverOk ? "OK" : "BELUM",
                jamSiap() ? "OK" : "BELUM");
}
static void konfigurasiSerial() {
  Serial.printf("[config] server=%s\n", cfg.server[0] ? cfg.server : "(kosong)");
  Serial.printf("[config] id=%s anon=%s kunci=%s pesan=%s\n",
                cfg.alat[0] ? cfg.alat : "(kosong)",
                cfg.anon[0] ? "(tersimpan; disembunyikan)" : "(kosong)",
                cfg.adaKunci ? "(tersimpan; disembunyikan)" : "(kosong)",
                cfg.pesan[0] ? "(tersimpan)" : "(kosong)");
}
static void hasilPindaiWifi() {
  if (!pindaiWifiAktif) return;
  int16_t n = WiFi.scanComplete();
  if (n == WIFI_SCAN_RUNNING) return;
  pindaiWifiAktif = false;
  if (n < 0) Serial.printf("[scan] gagal: %d\n", (int)n);
  else {
    Serial.printf("[scan] ditemukan %d jaringan 2,4 GHz:\n", (int)n);
    for (int16_t i = 0; i < n; i++) {
      Serial.printf("  %2d. RSSI %4d dBm CH %2d %-5s %s\n", (int)i + 1,
                    WiFi.RSSI(i), WiFi.channel(i),
                    WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "OPEN" : "LOCK",
                    WiFi.SSID(i).c_str());
    }
  }
  WiFi.scanDelete();
  if (!wifiDipakai && !portalAktif) WiFi.mode(WIFI_OFF);
}
static void perintahSerial(String baris) {
  baris.trim();
  if (!baris.length()) return;
  if (baris == "help" || baris == "?") { bantuanSerial(); return; }
  if (baris == "status") { statusSerial(); return; }
  if (baris == "config show") { konfigurasiSerial(); return; }
  if (baris == "reboot") { Serial.println("[serial] restart"); delay(150); ESP.restart(); }
  if (baris == "portal") { bukaPortal(); return; }
  if (baris == "portal off") { tutupPortal(); return; }
  if (baris == "wifi scan") {
    if (portalAktif || pindaiWifiAktif) { Serial.println("[scan] portal / pindai masih aktif"); return; }
    if (WiFi.getMode() == WIFI_OFF) WiFi.mode(WIFI_STA);
    if (WiFi.scanNetworks(true, false) == WIFI_SCAN_FAILED) {
      Serial.println("[scan] gagal memulai");
      if (!wifiDipakai) WiFi.mode(WIFI_OFF);
    } else {
      pindaiWifiAktif = true;
      Serial.println("[scan] sedang memindai...");
    }
    return;
  }
  if (baris.startsWith("wifi set ")) {
    String nilai = baris.substring(9);
    int potong = nilai.indexOf('|');
    if (potong <= 0) { Serial.println("[wifi] format: wifi set NAMA|SANDI"); return; }
    String ssid = nilai.substring(0, potong), sandi = nilai.substring(potong + 1);
    ssid.trim();
    if (ssid.length() == 0 || ssid.length() > 32 ||
        (sandi.length() != 0 && (sandi.length() < 8 || sandi.length() > 63))) {
      Serial.println("[wifi] SSID 1..32; sandi kosong (OPEN) atau 8..63 karakter");
      return;
    }
    WiFi.mode(WIFI_STA);
    WiFi.persistent(true);
    WiFi.begin(ssid.c_str(), sandi.c_str());
    WiFi.persistent(false);
    Serial.println("[wifi] kredensial disimpan (sandi disembunyikan); mulai ulang");
    delay(400);
    ESP.restart();
    return;
  }
  if (baris == "wifi forget") {
    // Jangan reset Preferences atau LittleFS (kunci alat dan antrean offline tetap ada).
    WiFi.disconnect(true, true);
    Serial.println("[wifi] kredensial WiFi dihapus; mulai ulang");
    delay(200);
    ESP.restart();
    return;
  }
  if (baris == "wifi reconnect") {
    if (portalAktif || !wifiDipakai) { Serial.println("[wifi] tutup portal / atur SSID dulu"); return; }
    WiFi.disconnect(false, false);
    WiFi.begin();
    cobaSambungBerikut = millis() + 10000;
    jedaSambung = 10000;
    Serial.println("[wifi] menghubungkan ulang...");
    return;
  }
  if (baris.startsWith("wifi tx ")) {
    String nilai = baris.substring(8); nilai.trim();
    if (nilai == "8.5") profilDayaWifi = 0;
    else if (nilai == "11") profilDayaWifi = 1;
    else if (nilai == "15") profilDayaWifi = 2;
    else if (nilai == "19.5") profilDayaWifi = 3;
    else { Serial.println("[wifi] pilihan: 8.5, 11, 15, 19.5"); return; }
    pref.begin("ckhadir", false); pref.putUChar("wifi_tx", profilDayaWifi); pref.end();
    if (WiFi.getMode() != WIFI_OFF) terapkanDayaWifi();
    Serial.printf("[wifi] daya TX maksimum %s dBm (tersimpan)\n", namaDayaWifi());
    return;
  }
  if (baris.startsWith("wifi sleep ")) {
    String nilai = baris.substring(11); nilai.trim();
    if (nilai != "on" && nilai != "off") { Serial.println("[wifi] pilihan: on atau off"); return; }
    wifiHemat = nilai == "on";
    pref.begin("ckhadir", false); pref.putBool("wifi_sleep", wifiHemat); pref.end();
    if (WiFi.getMode() != WIFI_OFF) WiFi.setSleep(wifiHemat);
    Serial.printf("[wifi] modem sleep %s (tersimpan)\n", wifiHemat ? "ON" : "OFF");
    return;
  }
  if (baris.startsWith("config ")) {
    int mulai = baris.indexOf(' ', 7);
    if (mulai < 0) { Serial.println("[config] format: config server|anon|id|key|message NILAI"); return; }
    String nama = baris.substring(7, mulai), nilai = baris.substring(mulai + 1);
    nilai.trim();
    if (!nilai.length()) { Serial.println("[config] nilai kosong ditolak; data lama aman"); return; }
    if (nama == "server") {
      if (!nilai.startsWith("https://") || nilai.length() >= sizeof cfg.server) {
        Serial.println("[config] harus URL https:// yang valid dan singkat");
        return;
      }
    } else if (nama == "anon") {
      if (nilai.length() >= sizeof cfg.anon) { Serial.println("[config] kunci terlalu panjang"); return; }
    } else if (nama == "id") {
      if (nilai.length() != 8) { Serial.println("[config] ID harus 8 karakter"); return; }
      nilai.toUpperCase();
      for (size_t i = 0; i < nilai.length(); i++) {
        if (!isalnum((unsigned char)nilai[i])) { Serial.println("[config] ID hanya huruf dan angka"); return; }
      }
    } else if (nama == "key") {
      uint8_t k[32];
      if (!ck::dariHex(nilai.c_str(), k, 32)) { Serial.println("[config] kunci harus 64 digit heksadesimal"); return; }
      pref.begin("ckhadir", false); pref.putBytes("kunci", k, sizeof k); pref.end();
      Serial.println("[config] kunci disimpan (disembunyikan); reboot...");
      delay(150); ESP.restart(); return;
    } else if (nama == "message") {
      if (nilai.length() >= sizeof cfg.pesan) { Serial.println("[config] pesan terlalu panjang"); return; }
    } else {
      Serial.println("[config] pilihan: server, anon, id, key, message");
      return;
    }
    const char *prefKey = nama == "message" ? "pesan" : nama == "id" ? "alat" : nama.c_str();
    pref.begin("ckhadir", false); pref.putString(prefKey, nilai); pref.end();
    Serial.printf("[config] %s tersimpan (nilai rahasia tidak dicetak); reboot...\n", nama.c_str());
    delay(150); ESP.restart();
    return;
  }
  Serial.println("[serial] perintah tidak dikenal. Ketik help");
}
static void bacaSerial() {
  uint16_t banyak = 0;
  while (Serial.available() && banyak++ < 128) {
    int ch = Serial.read();
    if (ch == '\r') continue;
    if (ch == '\n') {
      if (serialTerlaluPanjang) Serial.println("[serial] baris >511 byte; diabaikan");
      else { barisSerial[panjangSerial] = 0; perintahSerial(String(barisSerial)); }
      panjangSerial = 0;
      serialTerlaluPanjang = false;
    } else if (!serialTerlaluPanjang) {
      if (panjangSerial + 1 < sizeof barisSerial) barisSerial[panjangSerial++] = (char)ch;
      else serialTerlaluPanjang = true;
    }
  }
}

// ---------------- setup & loop ----------------
static uint32_t tekanMulai = 0, terakhirKartu = 0, siagaSejak = 0, tampilSampai = 0, cekRfid = 0, bingkai = 0;
static char uidTerakhir[21] = "";

static void bacaKartu() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;
  char uid[21];
  ck::uidKeTeks(rfid.uid.uidByte, rfid.uid.size, uid);
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  if (!ck::uidSah(uid)) return;
  if (!strcmp(uid, uidTerakhir) && millis() - terakhirKartu < 3000) return;   // kartu yang sama masih menempel
  strcpy(uidTerakhir, uid);
  terakhirKartu = millis();
  layar->tidur(false);

  if (!cfgLengkap()) {   // MODE DEMO: server belum diatur, tampilkan reaksi Ciki bergiliran
    static const char *DEMO[] = {"hadir", "terlambat", "sudah", "tidak_dikenal", "terdaftar", "simpan", "pulang"};
    static uint8_t ke = 0;
    const char *h = DEMO[ke++ % (sizeof DEMO / sizeof DEMO[0])];
    struct tm tm{}; bool adaJam = getLocalTime(&tm, 0);
    ck::Teks t;
    ck::susunTeks(h, "Kawan", adaJam ? data.jam : "07:00", 12, adaJam ? tm.tm_hour : 7, t);
    char sub[48]; snprintf(sub, sizeof sub, "[DEMO] %s", t.sub);
    layar->tampil(t.suasana, t.judul, sub);
    bunyi(t.bunyi);
    Serial.printf("[demo] kartu %s -> %s\n", uid, h);
    tampilSampai = millis() + 4000;
    return;
  }

  ck::Antre a{};
  strcpy(a.uid, uid);
  a.waktu = jamSiap() ? (uint32_t)time(nullptr) : 0;
  uint8_t acak[10];
  esp_fill_random(acak, sizeof acak);
  ck::buatNonce(acak, a.nonce);

  if (WiFi.status() == WL_CONNECTED && xQueueSend(qTugas, &a, 0) == pdTRUE) {
    layar->tampil(ck::Suasana::Baca, "Sebentar...", "");
    tampilSampai = millis() + 9000;   // jawaban server biasanya < 2 detik
    return;
  }
  // tanpa internet: simpan bila jam alat sudah benar
  struct tm tm{}; getLocalTime(&tm, 0);
  ck::Teks t;
  ck::susunTeks(a.waktu && simpanAntre(a) ? "simpan" : (a.waktu ? "gangguan" : "jam_belum"), nullptr, data.jam, 0, tm.tm_hour, t);
  layar->tampil(t.suasana, t.judul, t.sub);
  bunyi(t.bunyi);
  if (t.suasana == ck::Suasana::Simpan) data.tapHariIni++;
  tampilSampai = millis() + 3500;
}

static void terimaJawaban() {
  Jawaban j;
  if (xQueueReceive(qJawaban, &j, 0) != pdTRUE) return;
  struct tm tm{}; bool adaJam = getLocalTime(&tm, 0);
  ck::Teks t;
  ck::susunTeks(j.hasil, j.nama, j.jam[0] ? j.jam : data.jam, j.menit, adaJam ? tm.tm_hour : 7, t);
  layar->tampil(t.suasana, t.judul, t.sub);
  bunyi(t.bunyi);
  if (!strcmp(j.hasil, "hadir") || !strcmp(j.hasil, "terlambat") || !strcmp(j.hasil, "simpan")) data.tapHariIni++;
  if (!strcmp(j.hasil, "waktu_salah") || !strcmp(j.hasil, "kedaluwarsa")) mintaNtp = true;
  tampilSampai = millis() + (t.suasana == ck::Suasana::Senang || t.suasana == ck::Suasana::Pulang ? 3500 : 4500);
  Serial.printf("[tap] %s %s %s\n", j.hasil, j.nama, j.jam);
}

void setup() {
  pinMode(PIN_BUZZER, OUTPUT); if (PIN_LED >= 0) pinMode(PIN_LED, OUTPUT); buzzer(false);
  pinMode(PIN_TFT_BLK, OUTPUT); digitalWrite(PIN_TFT_BLK, HIGH);
  pinMode(PIN_TOMBOL, INPUT_PULLUP);
  Serial.begin(115200);
  delay(200);
  Serial.printf("\n# Cikaracak Hadir %s (%s)\n", VERSI, PAPAN);
  Serial.println("# USB Serial tersedia: ketik help + Enter");

  // Kanvas 110 KB dipesan paling awal, sebelum WiFi dan TLS memecah memori.
  kanvas = new GFXcanvas16(TFT_TINGGI, TFT_LEBAR);
  SPI.begin(PIN_SCK, PIN_MISO, PIN_MOSI);
  tft.init(TFT_LEBAR, TFT_TINGGI);
  tft.setRotation(1);
  tft.setSPISpeed(TFT_SPI_HZ);
  if (!kanvas || !kanvas->getBuffer()) {
    tft.fillScreen(ST77XX_RED); tft.setCursor(10, 10); tft.setTextSize(2); tft.print("Memori layar kurang");
    for (;;) delay(1000);
  }
  layar = new ck::Layar(*kanvas);

  kunciFS = xSemaphoreCreateMutex();
  kunciData = xSemaphoreCreateMutex();
  qTugas = xQueueCreate(4, sizeof(ck::Antre));
  qJawaban = xQueueCreate(4, sizeof(Jawaban));

  if (!LittleFS.begin(true)) Serial.println("# LittleFS gagal");
  jumlahAntrean = hitungAntrean();
  muatPengaturan();

  rfid.PCD_Init();
  rfid.PCD_SetAntennaGain(MFRC522::RxGain_max);
  byte v = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  Serial.printf("# RC522 0x%02X, antrean %u, heap %u\n", v, (unsigned)jumlahAntrean, (unsigned)ESP.getFreeHeap());
  if (v == 0x00 || v == 0xFF) {
    layarInfo("RC522 TIDAK TERDETEKSI", "Periksa kabel RC522", "(firmware uji-kartu)", "", "Alat tetap jalan, tetapi kartu tidak bisa dibaca.");
    bunyi(ck::Bunyi::Galat);
    delay(3000);
  }

  // WiFi: tanpa pengaturan -> langsung portal. Dengan pengaturan -> coba sambung, bila gagal tetap jalan offline.
  WiFi.onEvent(peristiwaWifi);
  WiFi.mode(WIFI_STA);
  terapkanDayaWifi();
  bacaSsidTersimpan();
  Serial.printf("# WiFi tersimpan: %s\n", ssidTersimpan[0] ? ssidTersimpan : "(belum ada)");
  {
    WiFiManager wm;
    wifiDipakai = wm.getWiFiIsSaved();
    if (!wifiDipakai) bukaPortal();   // pertama kali: atur WiFi (ditutup tanpa simpan = lanjut mode demo)
    else {
      layarInfo("CIKARACAK HADIR", "Menyambung WiFi...", "", "", "Tahan BOOT 3 detik untuk pengaturan.");
      wm.setEnableConfigPortal(false);
      wm.setConnectTimeout(15);
      wm.autoConnect();
    }
  }
  if (wifiDipakai) {
    // Hemat daya modem: radio hanya bangun saat perlu, sehingga tidak mengganggu WiFi HP di dekatnya.
    // Sambung ulang diatur sendiri dengan jeda bertambah (bukan memindai terus-menerus).
    WiFi.setSleep(wifiHemat);
    WiFi.setAutoReconnect(false);
    terapkanDayaWifi();
  }
  configTzTime(ZONA_WAKTU, "id.pool.ntp.org", "pool.ntp.org", "time.google.com");

  xTaskCreate(tugasJaringan, "jaringan", 12288, nullptr, 1, &hJaringan);
  if (!portalAktif) layar->siaga();  // jangan menimpa layar MODE PENGATURAN saat portal non-blocking
  siagaSejak = millis();
}

void loop() {
  prosesPortal();
  bacaSerial();
  hasilPindaiWifi();
  if (portalAktif) { delay(1); return; }  // layar portal tidak ditimpa animasi siaga
  uint32_t kini = millis();

  // tahan BOOT 3 detik -> pengaturan
  if (digitalRead(PIN_TOMBOL) == LOW) {
    if (!tekanMulai) tekanMulai = kini;
    if (kini - tekanMulai > 3000) bukaPortal();
  } else {
    tekanMulai = 0;
  }

  if (portalAktif) { delay(1); return; }
  if (mintaNtp) { mintaNtp = false; configTzTime(ZONA_WAKTU, "id.pool.ntp.org", "pool.ntp.org", "time.google.com"); }

  // RC522 kadang "hang" karena gangguan listrik: periksa tiap 30 detik
  if (kini - cekRfid > 30000) {
    cekRfid = kini;
    byte v = rfid.PCD_ReadRegister(MFRC522::VersionReg);
    if (v == 0x00 || v == 0xFF) { rfid.PCD_Init(); rfid.PCD_SetAntennaGain(MFRC522::RxGain_max); }
  }

  // WiFi tersimpan tetapi tidak pernah tersambung 3 menit sejak menyala: buka pengaturan sekali, otomatis.
  static bool portalOtomatis = false;
  if (wifiDipakai && !pernahTersambung && !portalOtomatis && kini > 180000) {
    portalOtomatis = true;
    Serial.println("# WiFi gagal 3 menit: membuka mode pengaturan");
    bukaPortal();
  }

  // WiFi putus: coba sambung ulang 10 detik, 20, 40, … paling lama tiap 2 menit
  if (wifiDipakai && !pindaiWifiAktif) {
    if (WiFi.status() == WL_CONNECTED) jedaSambung = 10000;
    else if (kini > cobaSambungBerikut) {
      WiFi.reconnect();
      cobaSambungBerikut = kini + jedaSambung;
      jedaSambung = jedaSambung < 120000 ? jedaSambung * 2 : 120000;
    }
  }

  static uint32_t pindaiKartu = 0;
  if (kini - pindaiKartu >= 100) { pindaiKartu = kini; bacaKartu(); }   // 10x per detik sudah terasa seketika
  terimaJawaban();
  langkahBunyi();

  if (tampilSampai && kini > tampilSampai) { tampilSampai = 0; layar->siaga(); siagaSejak = kini; }
  if (!tampilSampai && !layar->sedangTidur() && kini - siagaSejak > 45000) layar->tidur(true);

  // Bingkai secukupnya: 30/detik saat bereaksi, 20 saat siaga, 4 saat screensaver diam (jam/jumlah).
  // Lalu lintas SPI ke layar berkurang, begitu pula derau listriknya.
  if (kini - bingkai >= layar->jedaBingkai()) {
    bingkai = kini;
    struct tm tm{};
    bool adaJam = jamSiap() && getLocalTime(&tm, 0);
    perbaruiData(tm, adaJam);
    layar->gambar(kini, data);
    dorongLayar();
  }
  delay(1);
}

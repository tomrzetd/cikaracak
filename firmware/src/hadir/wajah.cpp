#include "wajah.h"
#include <math.h>
#include <stdio.h>
#include <string.h>
#include <Fonts/FreeSansBold24pt7b.h>
#include <Fonts/FreeSansBold12pt7b.h>
#include <Fonts/FreeSansBold9pt7b.h>
#include <Fonts/FreeSans9pt7b.h>

namespace ck {

static constexpr uint16_t rgb(uint8_t r, uint8_t g, uint8_t b) { return (uint16_t)(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)); }
static const uint16_t LATAR = rgb(0, 0, 0);          // hitam pekat: kontras paling kuat di panel IPS
static const uint16_t AIR = rgb(30, 190, 255);      // warna mata: air jernih
static const uint16_t AIR_TUA = rgb(30, 120, 170);
static const uint16_t PUTIH = rgb(240, 248, 255);
static const uint16_t PIPI = rgb(255, 120, 160);
static const uint16_t KUNING = rgb(255, 210, 70);
static const uint16_t HIJAU = rgb(90, 230, 140);
static const uint16_t ABU = rgb(120, 140, 170);
static const uint16_t MERAH = rgb(255, 100, 100);

static const int W = 320, H = 172;

static float dekati(float now, float target, float laju, float dt) {
  float k = 1.0f - powf(1.0f - laju, dt * 60.0f);
  return now + (target - now) * k;
}

Layar::Layar(GFXcanvas16 &kanvas) : c_(kanvas) {
  Mata dasar{68, 84, 26, 0, 0, 0, 0};
  kiri_ = kanan_ = tKiri_ = tKanan_ = dasar;
  for (auto &t : tetes_) t.hidup = false;
}

uint32_t Layar::acak() { acak_ = acak_ * 1664525u + 1013904223u; return acak_ >> 8; }
float Layar::acakF(float a, float b) { return a + (b - a) * (float)(acak() % 10000) / 10000.0f; }

void Layar::tampil(Suasana s, const char *judul, const char *sub) {
  suasana_ = s;
  snprintf(judul_, sizeof judul_, "%s", judul ? judul : "");
  snprintf(sub_, sizeof sub_, "%s", sub ? sub : "");
  mulaiSuasana_ = sekarang_;
  tidur_ = false;
  if (s == Suasana::Senang || s == Suasana::Bintang || s == Suasana::Pulang) {
    static const uint16_t warna[] = {AIR, PIPI, KUNING, HIJAU, PUTIH};
    for (int i = 0; i < 14; i++)
      tetes_[i] = {acakF(10, W - 10), acakF(-120, -10), acakF(1.5f, 3.5f), warna[i % 5], true};
  }
  aturTarget();
}

void Layar::siaga() { tampil(Suasana::Siaga); }

void Layar::tidur(bool ya) {
  if (ya == tidur_) return;
  tidur_ = ya;
  mulaiTidur_ = mulaiHalaman_ = sekarang_;
  halaman_ = 0; geser_ = W;
  if (!ya) { suasana_ = Suasana::Siaga; judul_[0] = sub_[0] = 0; aturTarget(); }
}

void Layar::aturTarget() {
  Mata n{68, 84, 26, 0, 0, 0, 0};
  Mata a = n, b = n;
  tUkuran_ = judul_[0] ? 0.62f : 1.0f;
  tPipi_ = 0; tLihatX_ = 0; tLihatY_ = 0;
  switch (suasana_) {
    case Suasana::Siaga: mulut_ = Mulut::Kecil; break;
    case Suasana::Baca: a.h = b.h = 96; a.w = b.w = 74; tLihatY_ = 10; mulut_ = Mulut::O; break;
    case Suasana::Senang: a.senyum = b.senyum = 1; tPipi_ = 1; mulut_ = Mulut::Senyum; break;
    case Suasana::Terlambat: a.miring = b.miring = -16; a.tutup = b.tutup = 0.12f; mulut_ = Mulut::Datar; tLihatY_ = 4; break;
    case Suasana::Kedip: b.senyum = 1; tPipi_ = 0.6f; mulut_ = Mulut::Senyum; tLihatX_ = 6; break;
    case Suasana::Pulang: a.senyum = b.senyum = 0.7f; a.tutup = b.tutup = 0.2f; tPipi_ = 0.8f; mulut_ = Mulut::Senyum; break;
    case Suasana::Penasaran: a.h = 96; b.h = 66; tLihatX_ = 10; mulut_ = Mulut::O; break;
    case Suasana::Bingung: a.h = 62; b.h = 92; a.miring = 10; b.miring = -10; tLihatX_ = -8; mulut_ = Mulut::Datar; break;
    case Suasana::Bintang: a.bintang = b.bintang = 1; tPipi_ = 1; mulut_ = Mulut::O; break;
    case Suasana::Sedih: a.miring = b.miring = -22; a.tutup = b.tutup = 0.28f; tLihatY_ = 8; mulut_ = Mulut::Sedih; break;
    case Suasana::Simpan: a.senyum = b.senyum = 0.8f; tPipi_ = 0.5f; mulut_ = Mulut::Senyum; break;
    case Suasana::Tidur: a.tutup = b.tutup = 0.88f; mulut_ = Mulut::Kecil; tLihatY_ = 6; break;
  }
  tKiri_ = a; tKanan_ = b;
}

void Layar::langkahAnimasi(float dt) {
  auto dekatiMata = [&](Mata &m, const Mata &t) {
    m.w = dekati(m.w, t.w, 0.25f, dt); m.h = dekati(m.h, t.h, 0.25f, dt);
    m.tutup = dekati(m.tutup, t.tutup, 0.25f, dt); m.miring = dekati(m.miring, t.miring, 0.25f, dt);
    m.senyum = dekati(m.senyum, t.senyum, 0.3f, dt); m.bintang = dekati(m.bintang, t.bintang, 0.3f, dt);
  };
  dekatiMata(kiri_, tKiri_);
  dekatiMata(kanan_, tKanan_);
  ukuran_ = dekati(ukuran_, tUkuran_, 0.2f, dt);
  pipi_ = dekati(pipi_, tPipi_, 0.15f, dt);

  // melirik ke sana-sini saat siaga
  if (suasana_ == Suasana::Siaga && sekarang_ > lirikBerikut_) {
    bool tengah = acak() % 3 == 0;
    tLihatX_ = tengah ? 0 : acakF(-20, 20);
    tLihatY_ = tengah ? 0 : acakF(-8, 8);
    lirikBerikut_ = sekarang_ + 1200 + acak() % 3500;
  }
  lihatX_ = dekati(lihatX_, tLihatX_, 0.18f, dt);
  lihatY_ = dekati(lihatY_, tLihatY_, 0.18f, dt);

  // tetes air berjatuhan
  for (auto &t : tetes_) {
    if (!t.hidup) continue;
    t.y += t.vy * dt * 60; t.vy += 0.06f * dt * 60;
    if (t.y > H + 10) t.hidup = false;
  }
}

void Layar::gambarTetes(float x, float y, float s, uint16_t warna) {
  int16_t r = (int16_t)(4 * s + 0.5f);
  if (r < 2) r = 2;
  c_.fillCircle((int16_t)x, (int16_t)y, r, warna);
  c_.fillTriangle((int16_t)(x - r), (int16_t)y, (int16_t)(x + r), (int16_t)y, (int16_t)x, (int16_t)(y - r * 2.6f), warna);
}

void Layar::gambarBintang(float cx, float cy, float rLuar, float rDalam, uint16_t warna) {
  float px[10], py[10];
  for (int i = 0; i < 10; i++) {
    float sudut = -1.5708f + i * 0.62832f;
    float r = (i % 2) ? rDalam : rLuar;
    px[i] = cx + cosf(sudut) * r; py[i] = cy + sinf(sudut) * r;
  }
  for (int i = 0; i < 10; i++) {
    int j = (i + 1) % 10;
    c_.fillTriangle((int16_t)cx, (int16_t)cy, (int16_t)px[i], (int16_t)py[i], (int16_t)px[j], (int16_t)py[j], warna);
  }
}

void Layar::gambarMata(float cx, float cy, const Mata &m, float s, bool kiri) {
  // kedip
  float kedip = 0;
  if (kedipMulai_ && sekarang_ - kedipMulai_ < 160) {
    float t = (sekarang_ - kedipMulai_) / 160.0f;
    kedip = t < 0.5f ? t * 2 : (1 - t) * 2;
  }
  float w = m.w * s, h = m.h * s, r = m.r * s;
  if (m.bintang > 0.5f) {
    float rl = w * 0.62f * (0.92f + 0.08f * sinf(sekarang_ / 90.0f));
    gambarBintang(cx, cy, rl, rl * 0.45f, KUNING);
    return;
  }
  float x = cx - w / 2, y = cy - h / 2;
  if (r > w / 2) r = w / 2;
  c_.fillRoundRect((int16_t)x, (int16_t)y, (int16_t)w, (int16_t)h, (int16_t)r, AIR);
  // kilau kecil, khas tetes air
  c_.fillCircle((int16_t)(x + w * 0.30f), (int16_t)(y + h * 0.24f), (int16_t)(w * 0.10f), PUTIH);

  // mata senyum "^": tutup bagian bawah dengan lingkaran warna latar
  if (m.senyum > 0.02f) {
    float R = w * 0.85f;
    float atas = y + h - h * 0.62f * m.senyum;   // puncak lingkaran penutup
    c_.fillCircle((int16_t)cx, (int16_t)(atas + R), (int16_t)R, LATAR);
  }
  // kelopak atas (miring: sisi dalam = kanan untuk mata kiri)
  float tutup = m.tutup + (1 - m.tutup) * kedip;
  float dasar = y + h * tutup;
  float dalam = dasar + m.miring * s, luar = dasar - m.miring * s;
  float yKiri = kiri ? luar : dalam, yKanan = kiri ? dalam : luar;
  if (yKiri > y || yKanan > y) {
    int16_t x0 = (int16_t)(x - 2), x1 = (int16_t)(x + w + 2), y0 = (int16_t)(y - 3);
    c_.fillTriangle(x0, y0, x1, y0, x1, (int16_t)yKanan, LATAR);
    c_.fillTriangle(x0, y0, x1, (int16_t)yKanan, x0, (int16_t)yKiri, LATAR);
  }
}

void Layar::gambarMulut(float cx, float cy, float s) {
  int16_t x = (int16_t)cx, y = (int16_t)cy;
  switch (mulut_) {
    case Mulut::Tidak: break;
    case Mulut::Kecil: {
      int16_t R = (int16_t)(9 * s);
      c_.fillCircle(x, y, R, AIR);
      c_.fillCircle(x, (int16_t)(y - R * 0.55f), R, LATAR);
      break;
    }
    case Mulut::Senyum: {
      int16_t R = (int16_t)(17 * s);
      c_.fillCircle(x, y, R, AIR);
      c_.fillCircle(x, (int16_t)(y - R * 0.5f), R, LATAR);
      break;
    }
    case Mulut::O: {
      int16_t R = (int16_t)(7 * s + 1.5f * sinf(sekarang_ / 120.0f));
      c_.fillCircle(x, (int16_t)(y - 3 * s), R, AIR);
      c_.fillCircle(x, (int16_t)(y - 3 * s), R / 2, LATAR);
      break;
    }
    case Mulut::Datar: {
      int16_t lebar = (int16_t)(26 * s);
      for (int16_t i = -lebar / 2; i < lebar / 2; i++) {
        int16_t dy = (int16_t)(2.5f * s * sinf(i * 0.45f / s));
        c_.fillRect(x + i, y + dy - 1, 1, (int16_t)(3 * s), AIR);
      }
      break;
    }
    case Mulut::Sedih: {
      int16_t R = (int16_t)(13 * s);
      c_.fillCircle(x, (int16_t)(y + R * 0.9f), R, AIR);
      c_.fillCircle(x, (int16_t)(y + R * 1.45f), R, LATAR);
      break;
    }
  }
}

void Layar::gambarHiasan(float cx, float cy, float s, uint32_t ms) {
  uint32_t t = ms - mulaiSuasana_;
  switch (suasana_) {
    case Suasana::Terlambat: {   // tetes keringat di pelipis
      float yy = cy - 30 * s + fmodf(t / 28.0f, 40 * s);
      gambarTetes(cx + 112 * s, yy, s * 1.6f, AIR_TUA);
      break;
    }
    case Suasana::Bingung: {
      c_.setFont(&FreeSansBold24pt7b); c_.setTextSize(1); c_.setTextColor(KUNING);
      c_.setCursor((int16_t)(cx + 100 * s), (int16_t)(cy - 22 * s + 4 * sinf(ms / 160.0f)));
      c_.print("?");
      break;
    }
    case Suasana::Tidur: {
      c_.setFont(&FreeSansBold9pt7b); c_.setTextColor(ABU);
      for (int i = 0; i < 3; i++) {
        float f = fmodf(t / 1600.0f + i / 3.0f, 1.0f);
        c_.setTextSize(f > 0.5f ? 2 : 1);
        c_.setCursor((int16_t)(cx + 96 * s + f * 30), (int16_t)(cy - 20 * s - f * 50 * s));
        c_.print("z");
      }
      c_.setTextSize(1);
      break;
    }
    case Suasana::Simpan: {   // awan dengan panah: tersimpan, menunggu internet
      int16_t x = (int16_t)(cx + 112 * s), y = (int16_t)(cy - 34 * s);
      c_.fillCircle(x - 9, y, 8, ABU); c_.fillCircle(x + 2, y - 6, 10, ABU); c_.fillCircle(x + 12, y, 8, ABU);
      c_.fillRect(x - 9, y, 21, 9, ABU);
      int16_t naik = (int16_t)((t / 60) % 8);
      c_.fillTriangle(x + 1, y - 2 - naik, x - 4, y + 4 - naik, x + 6, y + 4 - naik, LATAR);
      break;
    }
    case Suasana::Bintang: {
      for (int i = 0; i < 3; i++) {
        float a = ms / 400.0f + i * 2.094f;
        gambarBintang(cx + cosf(a) * 120 * s, cy + sinf(a) * 40 * s, 7, 3, PUTIH);
      }
      break;
    }
    default: break;
  }
}

void Layar::gambarWajah(float cx, float cy, float s, uint32_t ms) {
  // memantul sedikit saat senang
  float lompat = 0;
  if (suasana_ == Suasana::Senang || suasana_ == Suasana::Bintang) {
    uint32_t t = ms - mulaiSuasana_;
    if (t < 1200) lompat = -fabsf(sinf(t / 1200.0f * 3.14159f * 3)) * 10 * s * (1 - t / 1200.0f);
  } else if (suasana_ == Suasana::Siaga || suasana_ == Suasana::Tidur) {
    lompat = sinf(ms / 900.0f) * 2.5f * s;   // "bernapas"
  }
  float x = cx + lihatX_ * s, y = cy + lihatY_ * s + lompat;
  float jarak = 66 * s;
  gambarMata(x - jarak, y, kiri_, s, true);
  gambarMata(x + jarak, y, kanan_, s, false);
  if (pipi_ > 0.05f) {
    int16_t r = (int16_t)(11 * s * pipi_);
    c_.fillCircle((int16_t)(x - jarak - 10 * s), (int16_t)(y + 50 * s), r, PIPI);
    c_.fillCircle((int16_t)(x + jarak + 10 * s), (int16_t)(y + 50 * s), r, PIPI);
  }
  gambarMulut(x, y + 58 * s, s);
  gambarHiasan(cx, cy, s, ms);
}

int16_t Layar::lebarTeks(const char *t, const GFXfont *f, uint8_t skala) {
  int16_t x1, y1; uint16_t w, h;
  c_.setFont(f); c_.setTextSize(skala);
  c_.getTextBounds(t, 0, 0, &x1, &y1, &w, &h);
  return (int16_t)w;
}

void Layar::tulisTengah(const char *t, int16_t y, const GFXfont *f, uint8_t skala, uint16_t warna, int16_t lebarMaks) {
  if (!t || !*t) return;
  int16_t x1, y1; uint16_t w, h;
  c_.setFont(f); c_.setTextSize(skala); c_.setTextWrap(false);
  c_.getTextBounds(t, 0, 0, &x1, &y1, &w, &h);
  if (lebarMaks && (int16_t)w > lebarMaks && f == &FreeSansBold12pt7b) {   // terlalu lebar: turunkan ukuran
    tulisTengah(t, y, &FreeSansBold9pt7b, skala, warna, lebarMaks);
    return;
  }
  char pendek[64];
  if (lebarMaks && (int16_t)w > lebarMaks) {   // masih terlalu lebar: potong dan beri ".."
    size_t n = strlen(t);
    if (n >= sizeof pendek) n = sizeof pendek - 1;
    memcpy(pendek, t, n); pendek[n] = 0;
    while (n > 3 && (int16_t)w > lebarMaks) {
      pendek[--n - 2] = '.'; pendek[n - 1] = '.'; pendek[n] = 0;
      c_.getTextBounds(pendek, 0, 0, &x1, &y1, &w, &h);
    }
    t = pendek;
  }
  c_.setTextColor(warna);
  c_.setCursor((W - (int16_t)w) / 2 - x1, y);
  c_.print(t);
}

void Layar::gambarStatus(const DataLayar &d) {
  // ikon sinyal kecil di pojok kanan atas + antrean offline
  int16_t x = W - 34, y = 22;   // panel 1,47" bersudut bulat: jauhi pojok
  for (int i = 0; i < 3; i++) {
    int16_t tinggi = 4 + i * 4;
    c_.fillRect(x + i * 6, y - tinggi, 4, tinggi, d.online ? HIJAU : rgb(70, 80, 100));
  }
  if (!d.online) { c_.drawLine(x - 2, y - 13, x + 16, y + 1, MERAH); }
  c_.setFont(&FreeSans9pt7b); c_.setTextSize(1);
  if (d.antrean) {
    char b[12]; snprintf(b, sizeof b, "%u", d.antrean);
    c_.setTextColor(KUNING); c_.setCursor(W - 44 - lebarTeks(b, &FreeSans9pt7b, 1), 22); c_.print(b);
  }
  c_.setTextColor(ABU); c_.setCursor(18, 22); c_.print(d.jam);
}

void Layar::gambarSiagaBawah(const DataLayar &d, uint32_t ms) {
  if (!d.siapServer) {
    tulisTengah("Mode demo: tempel kartu", 143, &FreeSansBold9pt7b, 1, KUNING);
    tulisTengah("Atur: tahan BOOT 3 detik", 161, &FreeSans9pt7b, 1, ABU);
    return;
  }
  // "Tempelkan kartu" berdenyut lembut
  float k = 0.6f + 0.4f * sinf(ms / 500.0f);
  uint16_t warna = rgb((uint8_t)(90 + 150 * k), (uint8_t)(200 + 48 * k), 255);
  tulisTengah("Tempelkan kartu", 158, &FreeSansBold12pt7b, 1, warna);
}

bool Layar::ambilPesan(const DataLayar &d, uint8_t ke, char *out, size_t n) {
  const char *p = d.pesan;
  for (uint8_t i = 0; i < ke && p; i++) { p = strchr(p, '|'); if (p) p++; }
  if (!p || !*p) return false;
  size_t len = strcspn(p, "|");
  if (len >= n) len = n - 1;
  memcpy(out, p, len); out[len] = 0;
  return len > 0;
}

void Layar::gambarScreensaver(uint32_t ms, const DataLayar &d) {
  static const uint16_t warnaHalaman[] = {AIR, KUNING, PIPI, HIJAU};
  uint32_t t = ms - mulaiHalaman_;
  bool ganti = false;
  char teks[120];

  switch (halaman_) {
    case 0: {   // jam besar + tanggal
      tulisTengah(d.jam, 98, &FreeSansBold24pt7b, 2, AIR);
      tulisTengah(d.tanggal, 136, &FreeSansBold12pt7b, 1, PUTIH);
      if (d.sekolah[0]) tulisTengah(d.sekolah, 158, &FreeSans9pt7b, 1, ABU);
      ganti = t > 9000;
      break;
    }
    case 1: {   // tulisan berjalan besar
      if (!ambilPesan(d, pesanKe_, teks, sizeof teks)) { pesanKe_ = 0; ambilPesan(d, 0, teks, sizeof teks); }
      int16_t lebar = lebarTeks(teks, &FreeSansBold24pt7b, 2);
      c_.setFont(&FreeSansBold24pt7b); c_.setTextSize(2); c_.setTextWrap(false);
      c_.setTextColor(warnaHalaman[pesanKe_ % 4]);
      c_.setCursor(geser_, 112);
      c_.print(teks);
      for (int i = 0; i < 5; i++) gambarTetes(30 + i * 65.0f, 150 + 4 * sinf(ms / 300.0f + i), 1.2f, AIR_TUA);
      geser_ -= (int)(110 * dtTerakhir_ + 0.5f);   // ~110 piksel per detik, apa pun kecepatan bingkainya
      if (geser_ < -lebar) { ganti = true; pesanKe_++; }
      break;
    }
    case 2: {   // jumlah tap hari ini
      if (d.tapHariIni == 0) { ganti = true; break; }
      snprintf(teks, sizeof teks, "%u", d.tapHariIni);
      tulisTengah(teks, 100, &FreeSansBold24pt7b, 2, HIJAU);
      tulisTengah("siswa sudah tap hari ini", 140, &FreeSansBold12pt7b, 1, PUTIH);
      ganti = t > 6000;
      break;
    }
    default: {  // Ciki tidur
      Suasana simpan = suasana_;
      suasana_ = Suasana::Tidur;
      gambarWajah(W / 2.0f, 70, 0.9f, ms);
      suasana_ = simpan;
      tulisTengah("Tempel kartu, Ciki bangun", 160, &FreeSans9pt7b, 1, ABU);
      ganti = t > 7000;
      break;
    }
  }
  if (ganti) {
    halaman_ = (uint8_t)((halaman_ + 1) % 4);
    mulaiHalaman_ = ms; geser_ = W;
  }
}

void Layar::gambar(uint32_t ms, const DataLayar &d) {
  float dt = bingkaiTerakhir_ ? (ms - bingkaiTerakhir_) / 1000.0f : 1 / 30.0f;
  if (dt > 0.2f) dt = 0.2f;
  bingkaiTerakhir_ = ms;
  sekarang_ = ms;
  dtTerakhir_ = dt;

  if (!kedipMulai_ || ms > kedipBerikut_) {
    kedipMulai_ = ms;
    kedipBerikut_ = ms + 2200 + acak() % 4000;
    if (acak() % 5 == 0) kedipBerikut_ = ms + 260;   // kadang kedip dua kali
  }
  if (tidur_) {
    Mata z{68, 84, 26, 0.88f, 0, 0, 0};
    tKiri_ = tKanan_ = z; tUkuran_ = 0.9f; tPipi_ = 0; tLihatX_ = 0; tLihatY_ = 6;
  }
  langkahAnimasi(dt);
  c_.fillScreen(LATAR);

  if (tidur_) { gambarScreensaver(ms, d); return; }

  bool adaTeks = judul_[0] != 0;
  float cy = adaTeks ? 52 : 64;
  gambarWajah(W / 2.0f, cy, ukuran_, ms);
  for (auto &t : tetes_) if (t.hidup) gambarTetes(t.x, t.y, 1.3f, t.warna);

  if (adaTeks) {
    uint16_t warnaJudul = suasana_ == Suasana::Sedih ? MERAH
                        : suasana_ == Suasana::Bingung || suasana_ == Suasana::Terlambat ? KUNING : PUTIH;
    tulisTengah(judul_, 131, &FreeSansBold12pt7b, 1, warnaJudul, W - 24);
    tulisTengah(sub_, 157, &FreeSans9pt7b, 1, ABU, W - 24);
  } else {
    gambarSiagaBawah(d, ms);
  }
  gambarStatus(d);
}

}  // namespace ck

// Wajah "Ciki" si tetes air + screensaver tulisan besar.
// Hanya menggambar ke GFXcanvas16 (320x172), tanpa menyentuh perangkat keras, sehingga
// tools/firmware/pratinjau bisa membuat GIF pratinjau di komputer dari kode yang sama.
#pragma once
#include <Adafruit_GFX.h>
#include "logika.h"

namespace ck {

struct Mata {
  float w, h, r;      // ukuran dasar
  float tutup;        // 0..1 kelopak atas menutup
  float miring;       // + sudut dalam lebih tertutup (kesal), - sudut luar lebih tertutup (sedih/cemas)
  float senyum;       // 0..1 mata melengkung "^"
  float bintang;      // 0..1 mata berbentuk bintang
};

enum class Mulut : uint8_t { Tidak, Kecil, Senyum, O, Datar, Sedih };

struct DataLayar {
  char jam[6] = "--:--";           // HH:MM
  char tanggal[32] = "";           // "Sabtu, 7 November"
  char sekolah[48] = "";
  char pesan[400] = "Tempelkan kartu di sini|Datang tepat waktu, pulang hati-hati|Semangat belajar hari ini!";
  uint16_t tapHariIni = 0;
  uint16_t antrean = 0;            // tap offline yang belum terkirim
  bool online = false;
  bool siapServer = true;          // false bila belum diatur (tampilkan petunjuk)
};

class Layar {
 public:
  explicit Layar(GFXcanvas16 &kanvas);
  // Tampilkan suasana dengan teks dua baris. Teks kosong = mode siaga.
  void tampil(Suasana s, const char *judul = "", const char *sub = "");
  void siaga();
  void tidur(bool ya);
  bool sedangTidur() const { return tidur_; }
  void gambar(uint32_t ms, const DataLayar &d);   // gambar satu bingkai ke kanvas

 private:
  GFXcanvas16 &c_;
  Suasana suasana_ = Suasana::Siaga;
  char judul_[44] = "", sub_[48] = "";
  bool tidur_ = false;
  uint32_t mulaiSuasana_ = 0, mulaiTidur_ = 0, sekarang_ = 0;
  // keadaan animasi (mengejar target)
  Mata kiri_, kanan_, tKiri_, tKanan_;
  float lihatX_ = 0, lihatY_ = 0, tLihatX_ = 0, tLihatY_ = 0;
  float ukuran_ = 1, tUkuran_ = 1;
  float pipi_ = 0, tPipi_ = 0;
  Mulut mulut_ = Mulut::Kecil;
  uint32_t kedipBerikut_ = 2000, kedipMulai_ = 0, lirikBerikut_ = 1500;
  uint32_t acak_ = 12345;
  struct Tetes { float x, y, vy; uint16_t warna; bool hidup; } tetes_[14];
  // screensaver
  uint8_t halaman_ = 0;
  uint32_t mulaiHalaman_ = 0;
  int geser_ = 0;
  uint8_t pesanKe_ = 0;
  uint32_t bingkaiTerakhir_ = 0;
  float dtTerakhir_ = 1 / 30.0f;

  uint32_t acak();
  float acakF(float a, float b);
  void aturTarget();
  void langkahAnimasi(float dt);
  void gambarWajah(float cx, float cy, float s, uint32_t ms);
  void gambarMata(float cx, float cy, const Mata &m, float s, bool kiri);
  void gambarMulut(float cx, float cy, float s);
  void gambarTetes(float x, float y, float s, uint16_t warna);
  void gambarBintang(float cx, float cy, float rLuar, float rDalam, uint16_t warna);
  void gambarHiasan(float cx, float cy, float s, uint32_t ms);
  void tulisTengah(const char *t, int16_t y, const GFXfont *f, uint8_t skala, uint16_t warna, int16_t lebarMaks = 0);
  int16_t lebarTeks(const char *t, const GFXfont *f, uint8_t skala);
  void gambarSiagaBawah(const DataLayar &d, uint32_t ms);
  void gambarStatus(const DataLayar &d);
  void gambarScreensaver(uint32_t ms, const DataLayar &d);
  bool ambilPesan(const DataLayar &d, uint8_t ke, char *out, size_t n);
};

}  // namespace ck

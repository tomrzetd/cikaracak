// Membuat bingkai pratinjau wajah Ciki ke berkas PPM (lalu disatukan jadi GIF oleh buat.sh).
#include <Adafruit_GFX.h>
#include <cstdio>
#include "wajah.h"
using namespace ck;

static void simpan(GFXcanvas16 &c, const char *dir, int no) {
  char nama[256]; snprintf(nama, sizeof nama, "%s/b%04d.ppm", dir, no);
  FILE *f = fopen(nama, "wb");
  fprintf(f, "P6\n%d %d\n255\n", c.width(), c.height());
  uint16_t *p = c.getBuffer();
  for (int i = 0; i < c.width() * c.height(); i++) {
    uint16_t v = p[i];
    uint8_t rgb[3] = {(uint8_t)((v >> 11) << 3), (uint8_t)(((v >> 5) & 63) << 2), (uint8_t)((v & 31) << 3)};
    fwrite(rgb, 1, 3, f);
  }
  fclose(f);
}

int main(int argc, char **argv) {
  const char *dir = argc > 1 ? argv[1] : ".";
  GFXcanvas16 c(320, 172);
  Layar l(c);
  DataLayar d;
  strcpy(d.jam, "06:50"); strcpy(d.tanggal, "Senin, 9 November"); strcpy(d.sekolah, "SMP Negeri 2 Jalaksana");
  d.online = true; d.tapHariIni = 132;
  struct Adegan { Suasana s; const char *hasil; uint32_t lama; } adegan[] = {
    {Suasana::Siaga, nullptr, 3500},
    {Suasana::Baca, "", 500},
    {Suasana::Senang, "hadir", 2600},
    {Suasana::Siaga, nullptr, 900},
    {Suasana::Terlambat, "terlambat", 2400},
    {Suasana::Kedip, "sudah", 2000},
    {Suasana::Bingung, "tidak_dikenal", 2400},
    {Suasana::Bintang, "terdaftar", 2400},
    {Suasana::Simpan, "simpan", 2200},
    {Suasana::Pulang, "pulang", 2400},
  };
  uint32_t ms = 1; int no = 0;
  const uint32_t langkah = 50;   // 20 fps
  for (auto &a : adegan) {
    if (!a.hasil) l.siaga();
    else if (!*a.hasil) l.tampil(Suasana::Baca, "Sebentar...", "");
    else {
      Teks t; susunTeks(a.hasil, "Adit", a.s == Suasana::Terlambat ? "07:25" : (a.s == Suasana::Pulang ? "13:40" : "06:50"), 25,
                        a.s == Suasana::Pulang ? 13 : 6, t);
      l.tampil(t.suasana, t.judul, t.sub);
    }
    for (uint32_t t = 0; t < a.lama; t += langkah, ms += langkah) { l.gambar(ms, d); simpan(c, dir, no++); }
  }
  // screensaver
  d.antrean = 0; d.online = true;
  strcpy(d.jam, "09:41");
  l.tidur(true);
  for (uint32_t t = 0; t < 30000; t += langkah, ms += langkah) { l.gambar(ms, d); if ((t / langkah) % 2 == 0) simpan(c, dir, no++); }
  printf("%d bingkai\n", no);
  return 0;
}

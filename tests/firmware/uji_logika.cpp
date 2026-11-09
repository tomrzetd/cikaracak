// Uji logika firmware di komputer:  g++ -std=c++17 -I firmware/lib/logika tests/firmware/uji_logika.cpp firmware/lib/logika/*.cpp
#include <cstdio>
#include <cstring>
#include "logika.h"
#include "sha256.h"

static int gagal = 0;
#define CEK(kondisi, pesan) do { if (!(kondisi)) { std::printf("GAGAL: %s (%s:%d)\n", pesan, __FILE__, __LINE__); gagal++; } } while (0)

int main() {
  using namespace ck;
  uint8_t h[32]; char hex[65];

  // SHA-256 standar (FIPS 180-2)
  sha256((const uint8_t *)"abc", 3, h); keHex(h, 32, hex);
  CEK(!strcmp(hex, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"), "sha256(abc)");
  const char *panjang = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
  sha256((const uint8_t *)panjang, strlen(panjang), h); keHex(h, 32, hex);
  CEK(!strcmp(hex, "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"), "sha256 dua blok");

  // HMAC RFC 4231 kasus 2
  hmacSha256((const uint8_t *)"Jefe", 4, (const uint8_t *)"what do ya want for nothing?", 28, h); keHex(h, 32, hex);
  CEK(!strcmp(hex, "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"), "hmac RFC 4231 #2");

  // Vektor bersama dengan tools/supabase/uji_presensi.sql
  uint8_t kunci[32];
  CEK(dariHex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f", kunci, 32), "kunci hex");
  char pesan[160];
  pesanTap(pesan, sizeof pesan, "ATESTKEY", 1762480000, "nonce0001", "A1B2C3D4", false);
  CEK(!strcmp(pesan, "ATESTKEY\n1762480000\nnonce0001\nA1B2C3D4\n0"), "susunan pesan tap");
  tanda(kunci, pesan, hex);
  CEK(!strcmp(hex, "c2aabcda63071a3c914a36ba5fdc4fc6cd215e37779ea37d35fa0a5ac0915a03"), "tanda sama dengan server");
  pesanLapor(pesan, sizeof pesan, "ATESTKEY", 1762480000, "0.2.0", 3);
  CEK(!strcmp(pesan, "ATESTKEY\n1762480000\n0.2.0\n3"), "susunan pesan lapor");

  // hex
  uint8_t b[4];
  CEK(!dariHex("12", b, 4), "hex terlalu pendek ditolak");
  CEK(!dariHex("zz00zz00", b, 4), "hex tidak sah ditolak");

  // nonce
  uint8_t acak[10] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9};
  char nonce[17]; buatNonce(acak, nonce);
  CEK(strlen(nonce) == 16, "nonce 16 karakter");
  for (int i = 0; i < 16; i++) CEK((nonce[i] >= 'A' && nonce[i] <= 'Z') || (nonce[i] >= '2' && nonce[i] <= '9'), "nonce alfanumerik");
  uint8_t acak2[10] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 10};
  char nonce2[17]; buatNonce(acak2, nonce2);
  CEK(strcmp(nonce, nonce2) != 0, "nonce berbeda untuk acak berbeda");

  // UID
  uint8_t u[7] = {0x04, 0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0x06};
  char uid[21]; uidKeTeks(u, 7, uid);
  CEK(!strcmp(uid, "04A1B2C3D4E506") && uidSah(uid), "UID 7 byte");
  CEK(uidSah("47DB1DE0"), "UID 4 byte sah");
  CEK(!uidSah("47db1de0"), "UID huruf kecil tidak sah (server butuh huruf besar)");
  CEK(!uidSah("47DB1D"), "UID 3 byte tidak sah");

  // antrean
  Antre a{}; std::strcpy(a.uid, "A1B2C3D4"); a.waktu = 1762480000; std::strcpy(a.nonce, "ABCDEFGH23456789");
  char baris[64]; tulisAntre(a, baris, sizeof baris);
  CEK(!strcmp(baris, "A1B2C3D4,1762480000,ABCDEFGH23456789"), "tulis antrean");
  Antre c{};
  CEK(uraiAntre("A1B2C3D4,1762480000,ABCDEFGH23456789\r\n", c) && c.waktu == 1762480000 && !strcmp(c.nonce, "ABCDEFGH23456789"), "urai antrean");
  CEK(!uraiAntre("A1B2C3D4,0,ABCDEFGH", c), "antrean tanpa waktu ditolak");
  CEK(!uraiAntre("rusak", c), "antrean rusak ditolak");
  CEK(!uraiAntre("XYZ,1762480000,ABCDEFGH", c), "antrean UID rusak ditolak");

  // teks layar
  Teks t;
  susunTeks("hadir", "Adit", "06:50", 0, 6, t);
  CEK(t.suasana == Suasana::Senang && !strcmp(t.judul, "Selamat pagi, Adit!") && !strcmp(t.sub, "Hadir 06:50"), "teks hadir");
  susunTeks("terlambat", "Adit", "07:25", 25, 7, t);
  CEK(t.suasana == Suasana::Terlambat && strstr(t.sub, "25 menit"), "teks terlambat");
  susunTeks("pulang", "Adit", "13:40", 0, 13, t);
  CEK(t.suasana == Suasana::Pulang && strstr(t.judul, "Hati-hati"), "teks pulang");
  susunTeks("tidak_dikenal", nullptr, "07:00", 0, 7, t);
  CEK(t.suasana == Suasana::Bingung && t.bunyi == Bunyi::Ragu, "teks kartu asing");
  susunTeks("hadir", "NamaYangSangatPanjangSekali", "06:50", 0, 6, t);
  CEK(strlen(t.judul) < sizeof t.judul, "nama panjang terpotong aman");
  susunTeks("kode_baru_yang_tidak_dikenal", "Adit", "", 0, 6, t);
  CEK(t.suasana == Suasana::Sedih, "kode tak dikenal = gangguan");
  CEK(!strcmp(ucapan(16), "Selamat sore") && !strcmp(ucapan(12), "Selamat siang") && !strcmp(ucapan(20), "Selamat malam"), "ucapan");

  // jam dari header Date
  uint32_t w = 0;
  CEK(waktuDariHttp("Tue, 10 Nov 2026 00:52:01 GMT", w) && w == 1794271921u, "Date RFC 1123");
  CEK(waktuDariHttp("Thu, 29 Feb 2028 23:59:59 GMT", w) && w == 1835481599u, "Date tahun kabisat");
  CEK(waktuDariHttp("Sat, 01 Jan 2033 00:00:00 GMT", w) && w == 1988150400u, "Date awal tahun");
  CEK(!waktuDariHttp("Tue, 10 Xyz 2026 00:52:01 GMT", w), "bulan tidak sah ditolak");
  CEK(!waktuDariHttp("Thu, 01 Jan 1970 00:00:00 GMT", w), "tahun terlalu lama ditolak");
  CEK(!waktuDariHttp("", w) && !waktuDariHttp(nullptr, w), "kosong ditolak");

  if (gagal) { std::printf("%d uji gagal\n", gagal); return 1; }
  std::printf("Semua uji logika firmware lulus.\n");
  return 0;
}

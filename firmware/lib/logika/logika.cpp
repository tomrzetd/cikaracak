#include "logika.h"
#include "sha256.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

namespace ck {

void keHex(const uint8_t *data, size_t n, char *out, bool besar) {
  const char *d = besar ? "0123456789ABCDEF" : "0123456789abcdef";
  for (size_t i = 0; i < n; i++) { out[i * 2] = d[data[i] >> 4]; out[i * 2 + 1] = d[data[i] & 15]; }
  out[n * 2] = 0;
}

static int nilaiHex(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

bool dariHex(const char *hex, uint8_t *out, size_t n) {
  if (!hex || strlen(hex) != n * 2) return false;
  for (size_t i = 0; i < n; i++) {
    int a = nilaiHex(hex[i * 2]), b = nilaiHex(hex[i * 2 + 1]);
    if (a < 0 || b < 0) return false;
    out[i] = (uint8_t)(a << 4 | b);
  }
  return true;
}

size_t pesanTap(char *buf, size_t n, const char *alat, uint32_t waktu, const char *nonce, const char *uid, bool offline) {
  int k = snprintf(buf, n, "%s\n%lu\n%s\n%s\n%c", alat, (unsigned long)waktu, nonce, uid, offline ? '1' : '0');
  return k < 0 ? 0 : (size_t)k;
}

size_t pesanLapor(char *buf, size_t n, const char *alat, uint32_t waktu, const char *versi, uint32_t antrean) {
  int k = snprintf(buf, n, "%s\n%lu\n%s\n%lu", alat, (unsigned long)waktu, versi, (unsigned long)antrean);
  return k < 0 ? 0 : (size_t)k;
}

void tanda(const uint8_t kunci[32], const char *pesan, char out[65]) {
  uint8_t mac[32];
  hmacSha256(kunci, 32, (const uint8_t *)pesan, strlen(pesan), mac);
  keHex(mac, 32, out);
}

void buatNonce(const uint8_t acak[10], char out[17]) {
  static const char huruf[] = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // 32 karakter, tanpa O/0/I/1
  // 10 byte = 80 bit = 16 karakter x 5 bit
  uint32_t simpan = 0; int bit = 0, j = 0;
  for (int i = 0; i < 10; i++) {
    simpan = (simpan << 8) | acak[i]; bit += 8;
    while (bit >= 5) { out[j++] = huruf[(simpan >> (bit - 5)) & 31]; bit -= 5; }
  }
  out[16] = 0;
}

bool uidSah(const char *uid) {
  if (!uid) return false;
  size_t n = strlen(uid);
  if (n != 8 && n != 14 && n != 20) return false;
  for (size_t i = 0; i < n; i++) {
    char c = uid[i];
    if (!((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F'))) return false;
  }
  return true;
}

void uidKeTeks(const uint8_t *b, uint8_t n, char out[21]) {
  if (n > 10) n = 10;
  keHex(b, n, out, true);
}

size_t tulisAntre(const Antre &a, char *buf, size_t n) {
  int k = snprintf(buf, n, "%s,%lu,%s", a.uid, (unsigned long)a.waktu, a.nonce);
  return k < 0 ? 0 : (size_t)k;
}

bool uraiAntre(const char *baris, Antre &a) {
  if (!baris) return false;
  const char *k1 = strchr(baris, ',');
  if (!k1) return false;
  const char *k2 = strchr(k1 + 1, ',');
  if (!k2) return false;
  size_t nu = (size_t)(k1 - baris);
  if (nu >= sizeof a.uid) return false;
  memcpy(a.uid, baris, nu); a.uid[nu] = 0;
  char *akhir;
  unsigned long w = strtoul(k1 + 1, &akhir, 10);
  if (akhir != k2 || w == 0) return false;
  a.waktu = (uint32_t)w;
  const char *n = k2 + 1;
  size_t nn = strcspn(n, "\r\n");
  if (nn < 8 || nn >= sizeof a.nonce) return false;
  memcpy(a.nonce, n, nn); a.nonce[nn] = 0;
  return uidSah(a.uid);
}

const char *ucapan(int jamLokal) {
  if (jamLokal >= 3 && jamLokal < 11) return "Selamat pagi";
  if (jamLokal >= 11 && jamLokal < 15) return "Selamat siang";
  if (jamLokal >= 15 && jamLokal < 18) return "Selamat sore";
  return "Selamat malam";
}

static void isi(Teks &t, Suasana s, Bunyi b, const char *judul, const char *sub) {
  t.suasana = s; t.bunyi = b;
  snprintf(t.judul, sizeof t.judul, "%s", judul);
  snprintf(t.sub, sizeof t.sub, "%s", sub);
}

void susunTeks(const char *hasil, const char *nama, const char *jam, int terlambatMenit, int jamLokal, Teks &t) {
  char n[17];
  snprintf(n, sizeof n, "%s", (nama && *nama) ? nama : "kamu");
  const char *j = (jam && *jam) ? jam : "";
  char a[44], b[48];
  if (!hasil) hasil = "";

  if (!strcmp(hasil, "hadir")) {
    snprintf(a, sizeof a, "%s, %s!", ucapan(jamLokal), n);
    snprintf(b, sizeof b, "Hadir %s", j);
    isi(t, Suasana::Senang, Bunyi::Senang, a, b);
  } else if (!strcmp(hasil, "terlambat")) {
    snprintf(a, sizeof a, "Halo, %s", n);
    snprintf(b, sizeof b, "Tercatat %s, telat %d menit", j, terlambatMenit);
    isi(t, Suasana::Terlambat, Bunyi::Pendek, a, b);
  } else if (!strcmp(hasil, "sudah")) {
    snprintf(a, sizeof a, "Sudah tercatat, %s", n);
    isi(t, Suasana::Kedip, Bunyi::Pendek, a, "Tidak perlu tap lagi");
  } else if (!strcmp(hasil, "pulang")) {
    snprintf(a, sizeof a, "Hati-hati di jalan, %s!", n);
    snprintf(b, sizeof b, "Pulang %s", j);
    isi(t, Suasana::Pulang, Bunyi::Senang, a, b);
  } else if (!strcmp(hasil, "pulang_awal")) {
    snprintf(a, sizeof a, "Pulang lebih awal, %s", n);
    snprintf(b, sizeof b, "Tercatat %s", j);
    isi(t, Suasana::Penasaran, Bunyi::Pendek, a, b);
  } else if (!strcmp(hasil, "terdaftar")) {
    snprintf(b, sizeof b, "Kartu milik %s", n);
    isi(t, Suasana::Bintang, Bunyi::Senang, "Kartu terdaftar!", b);
  } else if (!strcmp(hasil, "kartu_terpakai")) {
    isi(t, Suasana::Sedih, Bunyi::Galat, "Kartu milik siswa lain", "Tidak bisa didaftarkan");
  } else if (!strcmp(hasil, "tidak_dikenal")) {
    isi(t, Suasana::Bingung, Bunyi::Ragu, "Kartu belum terdaftar", "Hubungi operator sekolah");
  } else if (!strcmp(hasil, "libur")) {
    isi(t, Suasana::Tidur, Bunyi::Pendek, "Hari ini libur", "Selamat beristirahat");
  } else if (!strcmp(hasil, "simpan")) {
    isi(t, Suasana::Simpan, Bunyi::Senang, "Tersimpan", "Dikirim saat internet kembali");
  } else if (!strcmp(hasil, "nonaktif")) {
    isi(t, Suasana::Sedih, Bunyi::Galat, "Alat dinonaktifkan", "Hubungi operator sekolah");
  } else if (!strcmp(hasil, "waktu_salah") || !strcmp(hasil, "kedaluwarsa")) {
    isi(t, Suasana::Sedih, Bunyi::Galat, "Jam alat tidak cocok", "Menyamakan jam, coba lagi");
  } else if (!strcmp(hasil, "tanda_salah")) {
    isi(t, Suasana::Sedih, Bunyi::Galat, "Kunci alat salah", "Atur ulang: tahan BOOT 3 detik");
  } else if (!strcmp(hasil, "format_salah")) {
    isi(t, Suasana::Bingung, Bunyi::Ragu, "Kartu tidak terbaca", "Coba tempel lagi");
  } else if (!strcmp(hasil, "jam_belum")) {
    isi(t, Suasana::Sedih, Bunyi::Galat, "Jam belum tersinkron", "Tunggu internet sebentar");
  } else {
    isi(t, Suasana::Sedih, Bunyi::Galat, "Ada gangguan", "Coba tempel lagi");
  }
}

}  // namespace ck

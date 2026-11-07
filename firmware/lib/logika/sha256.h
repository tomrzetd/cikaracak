// SHA-256 dan HMAC-SHA256 tanpa ketergantungan (dipakai di ESP32 dan di uji g++ pada komputer).
#pragma once
#include <stddef.h>
#include <stdint.h>

namespace ck {

struct Sha256 {
  uint32_t h[8];
  uint8_t buf[64];
  uint64_t panjang;   // byte
  size_t isi;
  void mulai();
  void tambah(const uint8_t *data, size_t n);
  void selesai(uint8_t out[32]);
};

void sha256(const uint8_t *data, size_t n, uint8_t out[32]);
void hmacSha256(const uint8_t *kunci, size_t nKunci, const uint8_t *pesan, size_t nPesan, uint8_t out[32]);

}  // namespace ck

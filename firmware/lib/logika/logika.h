// Logika alat Cikaracak Hadir yang tidak bergantung pada perangkat keras, sehingga bisa diuji dengan g++.
#pragma once
#include <stddef.h>
#include <stdint.h>

namespace ck {

// ---- heksadesimal ----
void keHex(const uint8_t *data, size_t n, char *out, bool besar = false);   // out minimal 2n+1
bool dariHex(const char *hex, uint8_t *out, size_t n);                       // tepat 2n digit

// ---- tanda tangan permintaan (harus sama persis dengan catat_tap / lapor_alat di Supabase) ----
// pesan = alat \n waktu \n nonce \n UID \n (1|0)
size_t pesanTap(char *buf, size_t n, const char *alat, uint32_t waktu, const char *nonce, const char *uid, bool offline);
// pesan = alat \n waktu \n versi \n antrean
size_t pesanLapor(char *buf, size_t n, const char *alat, uint32_t waktu, const char *versi, uint32_t antrean);
void tanda(const uint8_t kunci[32], const char *pesan, char out[65]);

// ---- nonce: 16 huruf/angka dari 10 byte acak ----
void buatNonce(const uint8_t acak[10], char out[17]);

// ---- UID dari pembaca kartu ----
bool uidSah(const char *uid);   // 8, 14, atau 20 digit hex huruf besar
void uidKeTeks(const uint8_t *b, uint8_t n, char out[21]);

// ---- antrean offline: satu baris "UID,waktu,nonce" ----
struct Antre {
  char uid[21];
  uint32_t waktu;
  char nonce[17];
};
size_t tulisAntre(const Antre &a, char *buf, size_t n);
bool uraiAntre(const char *baris, Antre &a);

// ---- jam dari header HTTP "Date" (RFC 1123, GMT), mis. "Tue, 10 Nov 2026 00:52:01 GMT" ----
bool waktuDariHttp(const char *teks, uint32_t &detikUnix);

// ---- apa yang ditampilkan setelah jawaban server ----
enum class Suasana : uint8_t {
  Siaga, Baca, Senang, Terlambat, Kedip, Pulang, Penasaran, Bingung, Bintang, Sedih, Simpan, Tidur
};

enum class Bunyi : uint8_t { Senang, Pendek, Ragu, Galat };

struct Teks {
  Suasana suasana;
  Bunyi bunyi;
  char judul[44];
  char sub[48];
};

// hasil: kode dari server (hadir, terlambat, …) atau "simpan" bila tap disimpan offline.
// jamLokal: jam 0-23 saat ini, untuk ucapan pagi/siang/sore/malam.
void susunTeks(const char *hasil, const char *nama, const char *jam, int terlambatMenit, int jamLokal, Teks &t);
const char *ucapan(int jamLokal);

}  // namespace ck

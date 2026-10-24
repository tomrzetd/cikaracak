// Pencocokan nama siswa. Modul murni: tidak menyentuh DOM atau penyimpanan.

/** Ubah nama ke bentuk baku untuk dibandingkan: huruf kecil, tanpa aksen dan tanda baca. */
export function normNama(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cari indeks siswa yang namanya cocok dengan `nama`.
 * Urutan: sama persis → salah satu awalan yang lain (dan hanya satu kandidat) → kata pertama sama (dan hanya satu).
 * @param {string} nama
 * @param {{nama:string}[]} daftar
 * @returns {number} indeks, atau -1 bila tidak ada / lebih dari satu kemungkinan
 */
export function cocokkanNama(nama, daftar) {
  const a = normNama(nama);
  if (!a) return -1;
  const n = daftar.map((s, i) => [i, normNama(s.nama)]);
  const persis = n.filter(([, b]) => b === a);
  if (persis.length === 1) return persis[0][0];
  if (persis.length > 1) return -1;
  const awalan = n.filter(([, b]) => b && (b.startsWith(a + ' ') || a.startsWith(b + ' ')));
  if (awalan.length === 1) return awalan[0][0];
  const depan = a.split(' ')[0];
  const sama = n.filter(([, b]) => b.split(' ')[0] === depan);
  return sama.length === 1 ? sama[0][0] : -1;
}

/** Inisial dua huruf untuk avatar. */
export function inisial(nama) {
  return String(nama || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

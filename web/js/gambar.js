// Pengolahan gambar di browser: memuat foto LJK untuk dipindai, dan mengecilkan foto siswa.
import { keAbu } from './core/omr.js';

async function bitmap(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* lanjut ke cara lama */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url; await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

/** Muat foto LJK menjadi citra abu-abu, diperkecil ke sisi terpanjang `maks` piksel. */
export async function muatAbu(file, maks = 1800) {
  const b = await bitmap(file);
  const w0 = b.width, h0 = b.height, k = Math.min(1, maks / Math.max(w0, h0));
  const cv = document.createElement('canvas');
  cv.width = Math.round(w0 * k); cv.height = Math.round(h0 * k);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(b, 0, 0, cv.width, cv.height);
  return keAbu(ctx.getImageData(0, 0, cv.width, cv.height));
}

/** Potong persegi di tengah dan kecilkan ke 200×200 piksel JPEG (foto siswa). */
export async function kecilkanFoto(file, sisi = 200) {
  const b = await bitmap(file);
  const s = Math.min(b.width, b.height);
  const cv = document.createElement('canvas'); cv.width = cv.height = sisi;
  cv.getContext('2d').drawImage(b, (b.width - s) / 2, (b.height - s) / 2, s, s, 0, 0, sisi, sisi);
  return await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.82));
}

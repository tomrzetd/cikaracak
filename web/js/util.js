// Utilitas tampilan kecil yang dipakai semua halaman.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtP = p => (p === null || p === undefined ? '—' : p + '%');

let tToast;
export function toast(pesan) {
  const el = $('#toast');
  el.textContent = pesan; el.hidden = false;
  clearTimeout(tToast); tToast = setTimeout(() => { el.hidden = true; }, 3000);
}

export async function salin(teks, pesanOk = 'Disalin') {
  if (window.AndroidJembatan?.salin) { window.AndroidJembatan.salin(teks); toast(pesanOk); return true; }
  try { await navigator.clipboard.writeText(teks); toast(pesanOk); return true; }
  catch { toast('Tidak bisa menyalin otomatis; salin manual dari kotak teks.'); return false; }
}

/** Unduh teks/blob sebagai file (berjalan di PWA dan aplikasi Android). */
export function unduh(namaFile, isi, tipe = 'text/plain;charset=utf-8') {
  const blob = isi instanceof Blob ? isi : new Blob([isi], { type: tipe });
  // Di aplikasi Android, WebView tidak bisa mengunduh blob: → serahkan ke jembatan native (guru memilih lokasi simpan).
  if (window.AndroidJembatan?.simpanFile) {
    const r = new FileReader();
    r.onload = () => window.AndroidJembatan.simpanFile(namaFile, String(r.result).split(',')[1] || '');
    r.readAsDataURL(blob);
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = namaFile;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Tombol dua-ketuk untuk tindakan yang tidak bisa dibatalkan (tanpa dialog confirm()). */
export function konfirmasiDuaKetuk(tombol, aksi, teksTanya = 'Yakin?') {
  if (tombol.dataset.yakin) { delete tombol.dataset.yakin; tombol.textContent = tombol.dataset.teks; aksi(); return; }
  tombol.dataset.teks = tombol.textContent; tombol.dataset.yakin = '1'; tombol.textContent = teksTanya;
  setTimeout(() => { if (tombol.dataset.yakin) { delete tombol.dataset.yakin; tombol.textContent = tombol.dataset.teks; } }, 3500);
}

export const hariIni = () => new Date().toISOString().slice(0, 10);

// Potongan tampilan yang dipakai lebih dari satu halaman.
import { esc } from '../util.js';
import { inisial } from '../core/nama.js';

export const WARNA = { ulang: 'var(--peach-ink)', singkat: 'var(--butter-ink)', tuntas: 'var(--mint-ink)', kosong: 'var(--line)' };

export const IKON = {
  siswa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3 2 8l10 5 8-4v6h2V8z"/><path d="M6 12v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-4l-6 3z"/></svg>',
  konsep: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>',
  rata: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>',
  ulang: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 3-6.2M4 4v5h5"/></svg>',
};

export function kartuStat(warna, ikon, label, angka, sub) {
  return `<div class="stat clay t-${warna}"><span class="lbl">${label}</span><span class="num">${angka}</span><span class="sub" style="color:var(--${warna}-ink)">${sub}</span></div>`;
}

/** Avatar siswa: foto bila izin aktif dan foto ada, selain itu inisial. */
export function avatar(siswa, ctx) {
  const u = ctx.store.data.fotoIzin && ctx.foto.url[siswa.id];
  return u ? `<img class="av" src="${u}" alt="">` : `<span class="av" aria-hidden="true">${esc(inisial(siswa.nama))}</span>`;
}

export function kosong(judul, isi, tombol = '') {
  return `<div class="card clay"><h3>${judul}</h3><p class="muted">${isi}</p>${tombol ? `<div class="row">${tombol}</div>` : ''}</div>`;
}

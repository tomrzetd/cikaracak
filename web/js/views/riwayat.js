// Halaman Riwayat & Uji: semua kuis di kelas aktif, tindakan guru, dan ekspor CSV untuk penelitian tindakan kelas.
import { analisis, LABEL_STATUS } from '../core/analisis.js';
import { keCSV } from '../core/impor.js';
import { esc, fmtP, unduh, hariIni } from '../util.js';
import { kosong } from './bersama.js';

export function barisCSV(store) {
  const rows = [['kelas', 'tanggal', 'topik', 'mapel', 'fase', 'rata_rata', 'siswa_ikut', 'jumlah_siswa', 'konsep', 'persen_benar', 'status', 'saran_dijalankan', 'catatan']];
  for (const r of store.data.rombel) {
    for (const k of store.kuisRombel(r.id)) {
      const h = analisis(k, store.siswaAktif(r.id));
      for (const c of h.konsep) rows.push([r.nama, k.tanggal, k.topik, k.mapel || '', k.fase || '', h.rataRata ?? '', h.ikut, h.jumlahSiswa, c.nama, c.p ?? '', LABEL_STATUS[c.status], k.tindakan?.dijalankan || '', k.tindakan?.catatan || '']);
    }
  }
  return rows;
}

export function render(el, ctx) {
  const { store } = ctx;
  const r = store.rombel();
  if (!r) { el.innerHTML = kosong('Belum ada kelas', 'Riwayat muncul setelah ada kuis.'); return; }
  const ks = store.kuisRombel();
  el.innerHTML = `
    <div class="note clay">
      <h3>Menguji dengan jujur selama satu semester</h3>
      <ol>
        <li>Setelah tiap kuis, catat di halaman Saran apakah sarannya dijalankan: ya, sebagian, atau tidak.</li>
        <li>Di kuis berikutnya, masukkan lagi 1–2 soal dari konsep yang diulang dan bandingkan persennya di tabel ini.</li>
        <li>Catat juga saat hasilnya tidak berubah. Hasil "tidak berpengaruh" tetap temuan yang sah.</li>
        <li>Akhir semester: unduh CSV, bandingkan konsep yang sarannya dijalankan dengan yang tidak.</li>
      </ol>
    </div>
    ${ks.length ? `<div class="card clay"><div class="tablebox"><table>
      <tr><th class="l">Tanggal</th><th class="l">Topik</th><th>Rata-rata</th><th>Ikut</th><th class="l">Konsep</th><th class="l">Saran dijalankan</th><th class="l">Catatan</th></tr>
      ${ks.map(k => { const h = analisis(k, store.siswaAktif());
        return `<tr><td class="l">${esc(k.tanggal)}</td><td class="l"><a href="#saran" data-buka="${esc(k.id)}" style="color:inherit;font-weight:700">${esc(k.topik)}</a></td>
          <td><b>${fmtP(h.rataRata)}</b></td><td>${h.ikut}/${h.jumlahSiswa}</td>
          <td class="l"><div class="row" style="gap:4px">${h.konsep.map(c => `<span class="pill ${c.status}" title="${esc(c.nama)}" style="text-transform:none">${esc(c.nama.split(' ').slice(0, 2).join(' '))} ${fmtP(c.p)}</span>`).join('')}</div></td>
          <td class="l">${esc(k.tindakan?.dijalankan || '—')}</td><td class="l" style="white-space:normal;min-width:180px">${esc(k.tindakan?.catatan || '')}</td></tr>`; }).join('')}
    </table></div></div>` : kosong('Belum ada kuis', 'Buat kuis pertama di halaman Kuis.')}
    <div class="card clay">
      <div class="head"><div><h3>Ekspor data</h3><p>Satu baris per konsep per kuis, semua kelas. Buka di Google Sheets atau Excel. Tidak memuat nama siswa.</p></div></div>
      <div class="row"><button class="btn hijau" data-aksi="unduh-csv">Unduh CSV</button></div>
    </div>`;
}

export function pasang(el, ctx) {
  const { store } = ctx;
  el.addEventListener('click', e => {
    const bk = e.target.closest('[data-buka]');
    if (bk) { e.preventDefault(); store.pilih(store.data.aktif.rombelId, bk.dataset.buka); ctx.go('saran'); return; }
    if (e.target.closest('[data-aksi="unduh-csv"]')) unduh(`riwayat-kuis-${hariIni()}.csv`, '﻿' + keCSV(barisCSV(store)), 'text/csv;charset=utf-8');
  });
}

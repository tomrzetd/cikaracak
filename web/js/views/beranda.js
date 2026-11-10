// Halaman Beranda: sapaan, ringkasan kuis aktif, grafik per konsep, komposisi siswa.
import { analisis, persen } from '../core/analisis.js';
import { esc, fmtP } from '../util.js';
import { WARNA, kartuStat, kosong } from './bersama.js';
import { ringkasanModul } from './layanan.js';

export function render(el, ctx) {
  const { store } = ctx;
  const d = store.data, r = store.rombel(), k = store.kuis();
  const sapa = `<div class="hero clay">
    <div class="copy">
      <span class="pill peach" style="align-self:flex-start">${r ? esc(r.nama) : 'Belum ada kelas'}${k ? ' · ' + esc(k.topik) : ''}</span>
      <h2>Selamat mengajar${d.guru.nama ? ', ' + esc(d.guru.nama) : ''}!</h2>
      <p>Pilih konsep dari CP resmi, cetak lembar jawaban, pindai dengan kamera HP, lalu dapatkan saran konsep yang perlu diulang. Semua data tersimpan di perangkat ini dan aplikasi tetap jalan tanpa internet.</p>
      <div class="row">
        ${k ? '<button class="btn utama" data-go="kuis">Isi jawaban kuis</button><button class="btn" data-go="saran">Lihat saran</button>' : '<button class="btn utama" data-go="kuis">Buat kuis pertama</button>'}
      </div>
    </div></div>`;
  const modul = ringkasanModul();
  if (!r) { el.innerHTML = sapa + modul + kosong('Mulai dari kelas', 'Tambahkan kelas dan daftar siswa dulu.', '<button class="btn utama" data-go="kelas">Tambah kelas</button>'); return; }
  if (!k) { el.innerHTML = sapa + modul + kosong('Belum ada kuis di kelas ini', 'Buat kuis, pilih konsepnya, dan cetak lembar jawaban.', '<button class="btn utama" data-go="kuis">Buat kuis</button>'); return; }

  const siswa = store.siswaAktif();
  const h = analisis(k, siswa);
  const nU = h.konsep.filter(x => x.status === 'ulang').length;
  const tot = siswa.length || 1, nD = h.dampingi.length, nA = h.ikut - nD, nT = siswa.length - h.ikut;
  const a1 = (nA / tot) * 360, a2 = a1 + (nD / tot) * 360;
  el.innerHTML = sapa + modul + `
    <div class="stats">
      ${kartuStat('mint', '', 'Siswa ikut', `${h.ikut}/${siswa.length}`, 'kuis ini')}
      ${kartuStat('peach', '', 'Konsep', k.konsep.length, `${k.soal.length} soal`)}
      ${kartuStat('butter', '', 'Rata-rata benar', fmtP(h.rataRata), `KKTP ${h.batas.kktp}%`)}
      ${kartuStat('sky', '', 'Perlu diulang', nU, nU ? `konsep di bawah ${h.batas.ulang}%` : 'semua konsep aman')}
    </div>
    <div class="cols">
      <div class="card clay">
        <div class="head"><div><h3>Ketuntasan per konsep</h3><p>Persen jawaban benar sekelas</p></div></div>
        <div class="bars"><div class="kk" style="bottom:${h.batas.kktp}%"><em>KKTP ${h.batas.kktp}%</em></div>
          ${h.konsep.map(c => `<div class="b" title="${esc(c.nama)}"><span>${fmtP(c.p)}</span><i style="height:${Math.max(7, c.p ?? 0)}%;background:${WARNA[c.status]}"></i></div>`).join('')}</div>
        <div class="blbl">${h.konsep.map((c, i) => `<span title="${esc(c.nama)}">K${i + 1} ${esc(c.nama.split(' ')[0])}</span>`).join('')}</div>
      </div>
      <div class="card clay">
        <div class="head"><div><h3>Komposisi siswa</h3><p>Batas pendampingan ${h.batas.siswa}%</p></div><button class="btn kecil" data-go="saran">Detail</button></div>
        <div class="donut">
          <div class="ring" style="background:conic-gradient(var(--mint-ink) 0 ${a1}deg,var(--peach-ink) ${a1}deg ${a2}deg,var(--line) ${a2}deg 360deg)"><div><span><b style="font-size:1.4rem;display:block">${persen(nA, tot) ?? 0}%</b><small class="muted">Aman</small></span></div></div>
          <div class="legend">
            <div><i style="background:var(--mint-ink)"></i><span>Aman</span><span>${nA}</span></div>
            <div><i style="background:var(--peach-ink)"></i><span>Perlu didampingi</span><span>${nD}</span></div>
            <div><i style="background:var(--line)"></i><span>Belum ikut</span><span>${nT}</span></div>
          </div>
        </div>
      </div>
    </div>`;
}

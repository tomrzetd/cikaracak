// Halaman Saran: hasil aturan di core/analisis.js, ditampilkan beserta alasannya.
import { analisis, saranKonsep, alasanKonsep, ringkasanWA, LABEL_STATUS } from '../core/analisis.js';
import { esc, fmtP, salin } from '../util.js';
import { WARNA, kartuStat, avatar, kosong } from './bersama.js';

export function render(el, ctx) {
  const { store } = ctx;
  const k = store.kuis(), r = store.rombel();
  if (!k) { el.innerHTML = kosong('Belum ada kuis', 'Saran muncul setelah ada jawaban kuis.', '<button class="btn utama" data-go="kuis">Ke halaman Kuis</button>'); return; }
  const siswa = store.siswaAktif();
  const h = analisis(k, siswa);
  if (!h.ikut) { el.innerHTML = kosong('Belum ada jawaban', 'Pindai LJK, tempel dari Google Form, atau isi jawaban manual dulu.', '<button class="btn utama" data-go="kuis">Isi jawaban</button>'); return; }
  const byId = Object.fromEntries(siswa.map(s => [s.id, s]));
  const nU = h.konsep.filter(c => c.status === 'ulang').length;
  el.innerHTML = `
    <div><span class="pill peach">${esc(r.nama)} · ${esc(k.tanggal)}${store.data.contoh ? ' · data contoh' : ''}</span><h2 style="margin-top:8px">${esc(k.topik)}</h2></div>
    <div class="stats">
      ${kartuStat('butter', '', 'Rata-rata benar', fmtP(h.rataRata), `${h.ikut}/${h.jumlahSiswa} siswa ikut`)}
      ${kartuStat('peach', '', 'Konsep perlu diulang', nU, `di bawah ${h.batas.ulang}%`)}
      ${kartuStat('sky', '', 'Perlu didampingi', h.dampingi.length, `di bawah ${h.batas.siswa}%`)}
    </div>
    <div class="cols">
      <div class="card clay"><h3>Per konsep</h3>
        ${[...h.konsep].sort((a, b) => (a.p ?? 101) - (b.p ?? 101)).map(c => `<div class="konsep">
          <b>K${c.i + 1} · ${esc(c.nama)}</b><div class="row"><b>${fmtP(c.p)}</b><span class="pill ${c.status}">${LABEL_STATUS[c.status]}</span></div>
          ${c.tp ? `<p class="tp full">${esc(c.tp)}</p>` : ''}
          <div class="track"><i style="width:${c.p ?? 0}%;background:${WARNA[c.status]}"></i><span class="kk" style="left:${h.batas.kktp}%"></span></div>
          <p class="full">${esc(saranKonsep(c))}</p>
          ${c.p !== null ? `<p class="why full">Alasan: ${esc(alasanKonsep(c, h))}</p>` : ''}</div>`).join('')}
      </div>
      <div style="display:flex;flex-direction:column;gap:22px;min-width:0">
        <div class="card clay"><h3>Siswa perlu didampingi</h3><ul class="daftar">
          ${h.dampingi.length ? h.dampingi.map(p => `<li class="row" style="flex-wrap:nowrap;align-items:flex-start">${avatar(byId[p.id] || p, ctx)}
            <span><b>${esc(p.nama)}</b> <span class="muted">${p.p}% (${p.benar}/${p.total})</span><br>
            <span class="muted kecil">Lemah di: ${p.konsepLemah.length ? p.konsepLemah.map(esc).join(', ') : 'merata'}. Ajak bicara singkat dulu untuk mencari penyebabnya sebelum menambah latihan.</span></span></li>`).join('')
            : `<li class="muted">Tidak ada siswa di bawah ${h.batas.siswa}%.</li>`}</ul></div>
        <div class="card clay"><h3>Usulan kelompok kecil</h3><ul class="daftar">
          ${h.kelompok.length ? h.kelompok.map(g => g.klasikal
            ? `<li><b>${esc(g.konsep)}</b><br><span class="muted kecil">${g.siswa.length} dari ${h.ikut} siswa masih lemah. Lebih tepat diulang klasikal untuk seluruh kelas.</span></li>`
            : `<li><b>${esc(g.konsep)}</b><br>${g.siswa.map(s => esc(s.nama)).join(', ')}<br><span class="muted kecil">Dampingi bersama 10 menit, atau pasangkan dengan teman yang sudah paham.</span></li>`).join('')
            : '<li class="muted">Tidak ada kelompok yang perlu dibentuk.</li>'}</ul></div>
        ${h.cekSoal.length || h.bsMenebak.length ? `<div class="card clay t-butter"><h3>Cek soalnya juga</h3><ul class="daftar">
          ${h.cekSoal.map(q => `<li><b>Soal no. ${q.no}</b><br><span class="kecil">Hanya ${q.p}% benar, jauh di bawah konsepnya (${q.pKonsep}%). Mungkin soalnya membingungkan atau kuncinya keliru. Periksa soalnya sebelum menyimpulkan siswa belum paham.</span></li>`).join('')}
          ${h.bsMenebak.map(q => `<li><b>Soal no. ${q.no} (benar-salah)</b><br><span class="kecil">${q.p}% benar, setara menebak. Konfirmasi dengan soal pilihan ganda.</span></li>`).join('')}
        </ul></div>` : ''}
      </div>
    </div>
    <div class="card clay">
      <h3>Tindakan guru</h3>
      <div class="row" style="align-items:flex-end">
        <label style="width:200px">Saran dijalankan? <select id="dijalankan"><option value="">— belum dicatat —</option>${['Ya', 'Sebagian', 'Tidak'].map(o => `<option${k.tindakan?.dijalankan === o ? ' selected' : ''}>${o}</option>`).join('')}</select></label>
        <label style="flex:1;min-width:220px">Catatan <input id="catatan" value="${esc(k.tindakan?.catatan || '')}" placeholder="mis. konsep mekanisme diulang dengan model balon, kuis berikutnya naik ke 70%"></label>
      </div>
      <div class="row"><button class="btn utama" data-aksi="salin-wa">Salin ringkasan untuk WhatsApp</button><span class="privasi">Ringkasan memuat nama siswa; bagikan hanya ke grup yang berwenang.</span></div>
    </div>`;
}

export function pasang(el, ctx) {
  const { store } = ctx;
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-aksi="salin-wa"]'); if (!b) return;
    const k = store.kuis(), h = analisis(k, store.siswaAktif());
    salin(ringkasanWA({ topik: k.topik, kelas: store.rombel().nama, tanggal: k.tanggal }, h), 'Ringkasan disalin');
  });
  el.addEventListener('change', e => {
    const id = store.data.aktif.kuisId;
    if (e.target.id === 'dijalankan') store.ubahKuis(id, k => { k.tindakan = { ...k.tindakan, dijalankan: e.target.value }; });
    if (e.target.id === 'catatan') store.ubahKuis(id, k => { k.tindakan = { ...k.tindakan, catatan: e.target.value }; });
  });
}

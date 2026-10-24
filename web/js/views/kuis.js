// Halaman Kuis: identitas, konsep/TP, soal & kunci, dan pengisian jawaban.
import { esc, toast, konfirmasiDuaKetuk } from '../util.js';
import { nilaiIsian } from '../core/analisis.js';
import { hurufOpsi, MAKS_SOAL } from '../core/ljk.js';
import { parseKunci } from '../core/impor.js';
import { uid } from '../state.js';
import { avatar, kosong } from './bersama.js';
import { bukaPilihCP } from './pilih-cp.js';
import { prosesPindai } from './pindai.js';
import { bukaTempel } from './tempel.js';
import { bukaCetak } from './cetak.js';

const FASE = ['', 'A', 'B', 'C', 'D', 'E', 'F'];

export function render(el, ctx) {
  const { store } = ctx;
  const r = store.rombel();
  if (!r) { el.innerHTML = kosong('Belum ada kelas', 'Tambahkan kelas dan daftar siswa dulu.', '<button class="btn utama" data-go="kelas">Tambah kelas</button>'); return; }
  const k = store.kuis();
  const aksi = `<div class="row">
      <button class="btn utama" data-aksi="kuis-baru">+ Kuis baru</button>
      ${k ? `<button class="btn kecil" data-aksi="salin-kuis">Salin kuis ini</button><button class="btn kecil polos bahaya" data-aksi="hapus-kuis">Hapus kuis</button>` : ''}
    </div>`;
  if (!k) { el.innerHTML = aksi + kosong('Belum ada kuis di kelas ini', 'Buat kuis baru, lalu pilih konsepnya dari CP resmi atau tulis sendiri.'); return; }
  const siswa = store.siswaAktif();
  const optKonsep = sel => k.konsep.map((c, i) => `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>K${i + 1} · ${esc(c.nama)}</option>`).join('');
  const kunciLengkap = k.soal.every(s => s.kunci);

  el.innerHTML = aksi + `
  <div class="cols">
    <div class="card clay">
      <h3>Identitas kuis</h3>
      <label>Topik <input data-f="topik" value="${esc(k.topik)}" maxlength="120"></label>
      <div class="grid2">
        <label>Tanggal <input type="date" data-f="tanggal" value="${esc(k.tanggal)}"></label>
        <label>Mapel <input data-f="mapel" value="${esc(k.mapel || '')}" maxlength="60"></label>
        <label>Fase <select data-f="fase">${FASE.map(f => `<option value="${f}"${f === (k.fase || '') ? ' selected' : ''}>${f ? 'Fase ' + f : '—'}</option>`).join('')}</select></label>
      </div>
      <h3>Batas saran</h3>
      <div class="grid2">
        <label>Ulang jika &lt; <small>% benar sekelas</small><input type="number" min="0" max="100" data-b="ulang" value="${k.batas.ulang}"></label>
        <label>KKTP konsep <small>di bawahnya: bahas singkat</small><input type="number" min="0" max="100" data-b="kktp" value="${k.batas.kktp}"></label>
        <label>Dampingi jika &lt; <small>% benar siswa</small><input type="number" min="0" max="100" data-b="siswa" value="${k.batas.siswa}"></label>
      </div>
    </div>
    <div class="card clay">
      <div class="head"><div><h3>Konsep / TP</h3><p>Setiap soal menguji satu konsep.</p></div><button class="btn hijau kecil" data-aksi="pilih-cp">Pilih dari CP 2025</button></div>
      ${k.konsep.map((c, i) => `<div style="display:flex;flex-direction:column;gap:6px">
        <div class="row" style="flex-wrap:nowrap"><b style="min-width:30px">K${i + 1}</b><input data-k="${esc(c.id)}" data-kf="nama" value="${esc(c.nama)}" aria-label="Nama konsep ${i + 1}">
        <button class="btn kecil polos bahaya" data-aksi="hapus-konsep" data-id="${esc(c.id)}" ${k.konsep.length < 2 ? 'disabled' : ''} aria-label="Hapus konsep ${i + 1}">✕</button></div>
        <input data-k="${esc(c.id)}" data-kf="tp" value="${esc(c.tp || '')}" placeholder="Tujuan pembelajaran (opsional)" style="font-size:.85rem;font-weight:500">
      </div>`).join('')}
      <button class="btn kecil" data-aksi="tambah-konsep" style="align-self:flex-start">+ Konsep</button>
    </div>
  </div>

  <div class="card clay">
    <div class="head"><div><h3>Soal &amp; kunci jawaban</h3><p>${kunciLengkap ? 'Kunci lengkap; jawaban huruf dinilai otomatis.' : 'Isi kunci agar jawaban dari LJK atau Google Form bisa dinilai.'}</p></div></div>
    <div class="row" style="align-items:flex-end">
      <label style="width:130px">Jumlah soal <input type="number" min="1" max="${MAKS_SOAL}" id="jumlahSoal" value="${k.soal.length}"></label>
      <label style="flex:1;min-width:200px">Kunci cepat <small>mis. ABCDA BCDAB (B/S untuk benar-salah)</small><input id="kunciCepat" data-sementara placeholder="${esc(k.soal.map(s => s.kunci || '_').join(''))}"></label>
      <button class="btn kecil" data-aksi="kunci-cepat">Terapkan kunci</button>
    </div>
    <div class="tablebox"><table>
      <tr><th>No</th><th class="l">Jenis</th><th class="l">Pilihan</th><th class="l">Kunci</th><th class="l">Konsep</th></tr>
      ${k.soal.map((s, j) => `<tr><td><b>${j + 1}</b></td>
        <td class="l"><select data-s="${j}" data-sf="jenis" aria-label="Jenis soal ${j + 1}"><option value="pg"${s.jenis !== 'bs' ? ' selected' : ''}>Pilihan ganda</option><option value="bs"${s.jenis === 'bs' ? ' selected' : ''}>Benar-salah</option></select></td>
        <td class="l">${s.jenis === 'bs' ? '<span class="muted kecil">B / S</span>' : `<select data-s="${j}" data-sf="opsi" aria-label="Jumlah pilihan soal ${j + 1}">${[3, 4, 5].map(n => `<option value="${n}"${(s.opsi || 4) === n ? ' selected' : ''}>A–${'ABCDE'[n - 1]}</option>`).join('')}</select>`}</td>
        <td class="l"><select data-s="${j}" data-sf="kunci" aria-label="Kunci soal ${j + 1}"><option value="">—</option>${hurufOpsi(s).map(hf => `<option${hf === s.kunci ? ' selected' : ''}>${hf}</option>`).join('')}</select></td>
        <td class="l"><select data-s="${j}" data-sf="konsepId" aria-label="Konsep soal ${j + 1}">${optKonsep(s.konsepId)}</select></td></tr>`).join('')}
    </table></div>
  </div>

  <div class="card clay">
    <div class="head"><div><h3>Jawaban siswa</h3><p>Pindai LJK, tempel dari Google Form, atau ketuk kotak: kosong → ✓ → ✗. Kosong berarti tidak ikut.</p></div></div>
    <div class="row">
      <span class="btn utama file">Pindai LJK<input type="file" id="filePindai" accept="image/*" capture="environment" multiple aria-label="Pindai lembar jawaban"></span>
      <button class="btn" data-aksi="tempel">Tempel dari Google Form</button>
      <button class="btn" data-aksi="cetak">Cetak LJK</button>
      <button class="btn polos" data-go="saran">Lihat saran →</button>
    </div>
    ${siswa.length ? `<div class="tablebox"><table>
      <tr><th class="l">Siswa</th>${k.soal.map((s, j) => `<th>${j + 1}<br><span style="color:var(--sky-ink)">K${k.konsep.findIndex(c => c.id === s.konsepId) + 1}</span></th>`).join('')}<th>Benar</th></tr>
      ${siswa.map((x, i) => {
        const isi = k.jawaban[x.id] || [];
        let b = 0, t = 0;
        const sel = k.soal.map((s, j) => {
          const v = isi[j] ?? null, n = nilaiIsian(v, s.kunci);
          if (n !== null) { t++; if (n === 1) b++; }
          const teks = v === 1 ? '✓' : v === 0 ? '✗' : v === null ? '' : esc(String(v).slice(0, 2));
          return `<td><button class="sel${n === 1 ? ' b' : n === 0 ? ' s' : ''}" data-ketuk="${j}" data-siswa="${esc(x.id)}" aria-label="${esc(x.nama)} soal ${j + 1}">${teks}</button></td>`;
        }).join('');
        return `<tr><td class="l nama"><button class="namabtn" data-lihat="${i}">${avatar(x, ctx)}${esc(x.nama)}</button></td>${sel}<td><b>${t ? Math.round((b / t) * 100) + '%' : '—'}</b></td></tr>`;
      }).join('')}
    </table></div>` : '<p class="muted">Belum ada siswa di kelas ini. <a href="#kelas" data-go="kelas">Tambah siswa</a>.</p>'}
  </div>`;
}

export function pasang(el, ctx) {
  const { store } = ctx;
  const kid = () => store.data.aktif.kuisId;
  el.addEventListener('click', e => {
    const lihat = e.target.closest('[data-lihat]');
    if (lihat) { const s = store.siswaAktif()[+lihat.dataset.lihat]; ctx.lihatSiswa(s, `No. absen ${+lihat.dataset.lihat + 1} · ${store.rombel().nama}`); return; }
    const kt = e.target.closest('[data-ketuk]');
    if (kt) { store.ketukJawaban(kid(), kt.dataset.siswa, +kt.dataset.ketuk); return; }
    const b = e.target.closest('[data-aksi]'); if (!b) return;
    switch (b.dataset.aksi) {
      case 'kuis-baru': store.kuisBaru(); toast('Kuis baru dibuat. Atur konsep dan kuncinya.'); break;
      case 'salin-kuis': store.salinKuis(kid()); toast('Kuis disalin tanpa jawaban'); break;
      case 'hapus-kuis': konfirmasiDuaKetuk(b, () => { store.hapusKuis(kid()); toast('Kuis dihapus'); }, 'Yakin hapus kuis?'); break;
      case 'tambah-konsep': store.ubahKuis(kid(), k => k.konsep.push({ id: uid('k'), nama: `Konsep ${k.konsep.length + 1}`, tp: '' })); break;
      case 'hapus-konsep': store.ubahKuis(kid(), k => {
        if (k.konsep.length < 2) return;
        k.konsep = k.konsep.filter(c => c.id !== b.dataset.id);
        k.soal.forEach(s => { if (s.konsepId === b.dataset.id) s.konsepId = k.konsep[0].id; });
      }); break;
      case 'kunci-cepat': {
        const kunci = parseKunci(el.querySelector('#kunciCepat').value);
        if (!kunci.length) { toast('Ketik kuncinya dulu, mis. ABCDA'); return; }
        store.ubahKuis(kid(), k => kunci.forEach((h, j) => {
          if (!k.soal[j]) return;
          const v = String(h).toUpperCase();
          if (v === 'S') k.soal[j].jenis = 'bs'; // "S" hanya ada di soal benar-salah
          k.soal[j].kunci = hurufOpsi(k.soal[j]).includes(v) ? v : '';
        }));
        toast(`Kunci ${kunci.length} soal diterapkan`); break;
      }
      case 'pilih-cp': bukaPilihCP(ctx); break;
      case 'tempel': bukaTempel(ctx); break;
      case 'cetak': bukaCetak(ctx); break;
    }
  });
  el.addEventListener('change', e => {
    const t = e.target, id = kid();
    if (t.dataset.f) { store.ubahKuis(id, k => { k[t.dataset.f] = t.value; }); return; }
    if (t.dataset.b) { const v = Math.max(0, Math.min(100, Number(t.value) || 0)); store.ubahKuis(id, k => { k.batas[t.dataset.b] = v; }); return; }
    if (t.dataset.k) { store.ubahKuis(id, k => { const c = k.konsep.find(x => x.id === t.dataset.k); if (c) c[t.dataset.kf] = t.value.trim(); }); return; }
    if (t.dataset.s) {
      const j = +t.dataset.s, f = t.dataset.sf;
      store.ubahKuis(id, k => {
        const s = k.soal[j];
        s[f] = f === 'opsi' ? Number(t.value) : t.value;
        if (f === 'jenis' || f === 'opsi') { if (!hurufOpsi(s).includes(s.kunci)) s.kunci = ''; }
      });
      return;
    }
    if (t.id === 'jumlahSoal') { store.aturJumlahSoal(id, Number(t.value)); return; }
    if (t.id === 'filePindai' && t.files.length) { prosesPindai([...t.files], ctx); t.value = ''; }
  });
}

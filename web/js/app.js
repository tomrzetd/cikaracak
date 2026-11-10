// Titik masuk aplikasi: memuat data, mengatur navigasi, dan menghubungkan halaman-halaman.
import { buatStore } from './state.js';
import { penyimpananIDB, foto, mintaPenyimpananTetap } from './db.js';
import { $, $$, esc, toast } from './util.js';
import { inisial } from './core/nama.js';
import * as beranda from './views/beranda.js';
import * as kelas from './views/kelas.js';
import * as kuis from './views/kuis.js';
import * as saran from './views/saran.js';
import * as riwayat from './views/riwayat.js';
import * as presensi from './views/presensi.js';
import * as layanan from './views/layanan.js';
import * as pustaka from './views/pustaka.js';
import * as pengaturan from './views/pengaturan.js';

const VIEWS = { beranda, kelas, kuis, saran, riwayat, presensi, pustaka, layanan, pengaturan };
const JUDUL = { beranda: 'Beranda', kelas: 'Kelas & Siswa', kuis: 'Asesmen', saran: 'Saran', riwayat: 'Riwayat & Uji', presensi: 'Presensi', pustaka: 'Perpustakaan Demo', layanan: 'Layanan Sekolah', pengaturan: 'Pengaturan' };

const store = buatStore(penyimpananIDB);
let aktif = 'beranda';

// ---------- lapisan (modal) ----------
let saatTutup = null;
function buka(html, { sempit = false, onTutup = null } = {}) {
  const isi = $('#lapisIsi');
  isi.className = 'sheet clay' + (sempit ? ' sempit' : '');
  isi.innerHTML = html;
  $('#lapis').hidden = false;
  saatTutup = onTutup;
  (isi.querySelector('[autofocus]') || isi.querySelector('button, input, select, textarea'))?.focus();
  return isi;
}
function tutup() {
  if ($('#lapis').hidden) return;
  $('#lapis').hidden = true; $('#lapisIsi').innerHTML = '';
  const f = saatTutup; saatTutup = null; f && f();
}
$('#lapis').addEventListener('click', e => { if (e.target.id === 'lapis' || e.target.closest('[data-tutup]')) tutup(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') tutup(); });

/** Tampilkan foto siswa ukuran besar (ketuk nama di tabel). */
function lihatSiswa(siswa, keterangan = '') {
  const u = store.data.fotoIzin && foto.url[siswa.id];
  buka(`${u ? `<img class="foto-besar" src="${u}" alt="Foto ${esc(siswa.nama)}">` : `<div class="foto-besar" aria-hidden="true">${esc(inisial(siswa.nama))}</div>`}
    <h2>${esc(siswa.nama)}</h2><p class="muted">${esc(keterangan)}${store.data.fotoIzin && !u ? ' · belum ada foto' : ''}</p>
    <button class="btn kecil" data-tutup>Tutup</button>`, { sempit: true });
}

// ---------- konteks: kelas & kuis aktif ----------
function renderKonteks() {
  const d = store.data;
  $('#pilihRombel').innerHTML = d.rombel.length
    ? d.rombel.map(r => `<option value="${esc(r.id)}"${r.id === d.aktif.rombelId ? ' selected' : ''}>${esc(r.nama)}</option>`).join('')
    : '<option value="">Belum ada kelas</option>';
  const ks = store.kuisRombel();
  $('#pilihKuis').innerHTML = ks.length
    ? ks.map(k => `<option value="${esc(k.id)}"${k.id === d.aktif.kuisId ? ' selected' : ''}>${esc(k.tanggal)} · ${esc(k.topik)}</option>`).join('')
    : '<option value="">Belum ada kuis</option>';
  if (!d.aktif.kuisId && ks.length) store.pilih(d.aktif.rombelId, ks[0].id);
  $('#pillContoh').hidden = !d.contoh || aktif === 'presensi' || aktif === 'layanan' || aktif === 'pustaka';   // data contoh di perangkat tidak berlaku untuk presensi server
  // Nama di kepala aplikasi: akun server yang sedang masuk; bila tidak, nama guru di perangkat ini.
  const p = presensi.st.profil;
  const nama = p?.nama || (!d.contoh && d.guru.nama) || 'Belum masuk';
  $('#namaGuru').textContent = nama;
  $('#subGuru').textContent = p ? [presensi.JABATAN[p.peran] || p.peran, p.sekolah?.nama].filter(Boolean).join(' · ') : 'Laun-laun jadi legok';
  $('#avatarGuru').textContent = nama === 'Belum masuk' ? '?' : inisial(nama.replace(/,.*$/, '').replace(/^((bu|pak|ibu|bapak|h|hj|dr|drs|ir)\.?\s+)+/i, ''));
  $('#statusAkses').textContent = p ? 'Server sekolah • masuk' : 'Data lokal • offline-first';
}
$('#pilihRombel').onchange = e => { const ks = store.kuisRombel(e.target.value); store.pilih(e.target.value, ks[0]?.id || null); };
$('#pilihKuis').onchange = e => store.pilih(store.data.aktif.rombelId, e.target.value || null);

// ---------- navigasi ----------
const ctx = { store, foto, buka, tutup, lihatSiswa, go: v => go(v), render: () => render() };

function go(v) {
  if (!VIEWS[v]) v = 'beranda';
  aktif = v;
  $$('.nav').forEach(b => (b.dataset.v === v ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  Object.keys(VIEWS).forEach(k => { $('#v-' + k).hidden = k !== v; });
  $('#judulView').textContent = JUDUL[v];
  $('.konteks').hidden = v === 'presensi' || v === 'layanan' || v === 'pustaka';   // kelas & kuis di perangkat tidak berlaku untuk presensi server
  if (location.hash.slice(1) !== v) history.replaceState(null, '', '#' + v);
  render();
  window.scrollTo(0, 0);
}
let antre = false;
function render() {
  if (antre) return;
  antre = true;
  requestAnimationFrame(() => {
    antre = false;
    renderKonteks();
    // Isian sementara (belum disimpan ke data) dijaga agar tidak hilang saat halaman digambar ulang.
    const el = $('#v-' + aktif);
    const sementara = $$('[data-sementara]', el).map(x => [x.id, x.value, x === document.activeElement, x.selectionStart]);
    try {
      VIEWS[aktif].render(el, ctx);
      for (const [id, nilai, fokus, pos] of sementara) {
        const x = el.querySelector('#' + id);
        if (!x) continue;
        if (nilai) x.value = nilai;
        if (fokus) { x.focus(); try { x.setSelectionRange(pos, pos); } catch { /* bukan input teks */ } }
      }
    }
    catch (e) { console.error(e); $('#v-' + aktif).innerHTML = `<div class="card clay"><h3>Terjadi kesalahan</h3><p class="muted">${esc(e.message)}</p><p class="kecil">Mohon laporkan lewat GitHub Issues beserta langkah yang dilakukan.</p></div>`; }
  });
}
$$('.nav').forEach(b => { b.onclick = () => go(b.dataset.v); });
document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); go(g.dataset.go); } });
window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (v !== aktif && VIEWS[v]) go(v); });

// ---------- mulai ----------
(async function mulai() {
  try { await store.muat(); }
  catch (e) { console.error(e); toast('Penyimpanan perangkat tidak tersedia; data hanya bertahan sampai halaman ditutup.'); }
  for (const [nama, v] of Object.entries(VIEWS)) v.pasang?.($('#v-' + nama), ctx);
  store.dengar(() => render());
  go(location.hash.slice(1) || 'beranda');
  foto.muat().then(render).catch(() => {});
  mintaPenyimpananTetap();
  // Di aplikasi Android semua file sudah ada di APK, jadi service worker tidak diperlukan.
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !window.AndroidJembatan) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.addEventListener('pagehide', () => store.simpanSekarang());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') store.simpanSekarang(); });
})();

// Dasbor sekolah (operator, kepala sekolah, wakasek, kesiswaan, piket) dan Uji & demo mesin (operator).
//  • Uji mesin: tempel kartu sungguhan ke alat ESP32, halaman ini membuktikan jalurnya langkah demi langkah.
//  • Layar langsung: tap terbaru tampil besar (bisa layar penuh untuk proyektor).
//  • Kelas demo: siswa fiktif + riwayat presensi tersimulasi, terpisah dari data asli dan bisa dihapus.
import * as srv from '../server/supabase.js';
import { esc, toast, konfirmasiDuaKetuk } from '../util.js';
import { teksHasil } from '../core/tanda.js';
import { kartuStat } from './bersama.js';
import { dasborFiktif } from '../core/dasbor-fiktif.js';

const SERI = [['hadir', 'Hadir tepat waktu'], ['terlambat', 'Terlambat'], ['izin_sakit', 'Izin / sakit'], ['tidak_tercatat', 'Tidak tercatat']];
const tglPendek = t => { const [, m, d] = t.split('-'); return `${+d}/${+m}`; };
const persen = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const relatif = iso => {
  if (!iso) return 'belum pernah';
  const s = Math.round((Date.now() - new Date(iso)) / 1000);
  return s < 60 ? `${Math.max(s, 0)} detik lalu` : s < 3600 ? `${Math.round(s / 60)} menit lalu` : s < 86400 ? `${Math.round(s / 3600)} jam lalu` : `${Math.round(s / 86400)} hari lalu`;
};
const online = a => a.terakhir_kontak && Date.now() - new Date(a.terakhir_kontak) < 6.5 * 60000;

// ---------- memuat ----------
export async function muat(st) {
  st.db = st.db || { hari: 14, demo: false };
  if (st.tab === 'dasbor') {
    if (st.db.lokal) {
      st.isi.dasbor = dasborFiktif({ hari: st.db.hari });
    } else {
      try {
        st.isi.dasbor = await srv.rpc('dasbor_sekolah', { p_hari: st.db.hari, p_demo: st.db.demo });
        st.db.kesalahan = '';
      } catch (e) {
        if (e.status !== 404 && e.kode !== 'PGRST202') throw e;
        // Fungsi belum ada di server Supabase. Jangan mengklaim ini data nyata.
        st.db.lokal = true;
        st.db.kesalahan = 'Fungsi dasbor_sekolah belum tersedia di Supabase. Jalankan migrasi dasbor pada SQL Editor untuk mengaktifkan laporan server asli.';
        st.isi.dasbor = dasborFiktif({ hari: st.db.hari });
      }
    }
  }
  if (st.tab === 'demo') {
    st.isi.demo = (await srv.daftar('rombel', 'id,nama', { demo: 'is.true' }))[0] || null;
    await muatFeed(st);
  }
}

async function muatFeed(st) {
  st.isi.feed = await srv.daftar('tap', 'id,waktu,diterima_at,hasil,offline,alat_id,jawaban,siswa(nama,panggilan,rombel(nama))', { order: 'id.desc', limit: 12 });
  st.alat = await srv.daftar('alat', 'id,nama,titik,aktif,versi,antrean,terakhir_kontak', { order: 'nama' });
  const u = st.uji;
  if (u?.menunggu) {
    const baru = st.isi.feed.find(t => t.alat_id === u.alat && t.id > u.dariId);
    if (baru) { u.menunggu = false; u.tap = baru; }
    else if (Date.now() - u.mulai > 60000) { u.menunggu = false; u.habis = true; }
  }
}

// ---------- grafik (SVG sederhana, warna lewat token CSS --c-*) ----------
function grafikHarian(d) {
  const h = d.harian || [];
  if (!h.length) return '<p class="muted">Belum ada hari sekolah dalam rentang ini.</p>';
  const W = 640, H = 220, kiri = 34, bawah = 26, atas = 10;
  const maks = Math.max(1, d.siswa);
  const lebar = (W - kiri - 8) / h.length, bar = Math.max(4, Math.min(28, lebar - 6));
  const y = v => atas + (H - atas - bawah) * (1 - v / maks);
  const grid = [0, 0.5, 1].map(f => { const v = Math.round(maks * f); return `<line x1="${kiri}" x2="${W - 4}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${kiri - 6}" y="${y(v) + 4}" text-anchor="end" class="sumbu">${v}</text>`; }).join('');
  const batang = h.map((x, i) => {
    let dasar = 0;
    const cx = kiri + i * lebar + (lebar - bar) / 2;
    const seg = SERI.map(([k, l]) => {
      const v = x[k] || 0; if (!v) return '';
      const y1 = y(dasar + v), y0 = y(dasar); dasar += v;
      return `<rect x="${cx}" y="${y1 + 1}" width="${bar}" height="${Math.max(0, y0 - y1 - 2)}" rx="3" class="s-${k}"><title>${tglPendek(x.tanggal)} · ${l}: ${v} siswa</title></rect>`;
    }).join('');
    const label = h.length <= 16 || i % Math.ceil(h.length / 12) === 0 ? `<text x="${cx + bar / 2}" y="${H - 8}" text-anchor="middle" class="sumbu">${tglPendek(x.tanggal)}</text>` : '';
    return seg + label;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="grafik" role="img" aria-label="Presensi harian, ${h.length} hari sekolah">${grid}${batang}</svg>`;
}

function grafikKedatangan(d) {
  const k = d.kedatangan || [];
  if (!k.length) return '<p class="muted">Belum ada data jam datang.</p>';
  const W = 640, H = 180, kiri = 34, bawah = 26, atas = 10;
  const maks = Math.max(...k.map(x => x.jumlah));
  const lebar = (W - kiri - 8) / k.length, bar = Math.max(3, Math.min(22, lebar - 3));
  const y = v => atas + (H - atas - bawah) * (1 - v / maks);
  const batas = d.jam_masuk ? (() => { const [a, b] = d.jam_masuk.split(':').map(Number); const m = a * 60 + b + (d.toleransi || 0); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; })() : null;
  let garis = '';
  const batang = k.map((x, i) => {
    const cx = kiri + i * lebar + (lebar - bar) / 2;
    if (batas && !garis && x.jam > batas) garis = `<line x1="${cx - 2}" x2="${cx - 2}" y1="${atas}" y2="${H - bawah}" class="batas"/><text x="${cx + 2}" y="${atas + 10}" class="sumbu">batas terlambat ${batas}</text>`;
    const lbl = i % Math.ceil(k.length / 10) === 0 ? `<text x="${cx + bar / 2}" y="${H - 8}" text-anchor="middle" class="sumbu">${x.jam}</text>` : '';
    return `<rect x="${cx}" y="${y(x.jumlah)}" width="${bar}" height="${H - bawah - y(x.jumlah)}" rx="3" class="s-datang"><title>${x.jam}: ${x.jumlah} tap masuk</title></rect>${lbl}`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="grafik" role="img" aria-label="Sebaran jam kedatangan per 5 menit">${batang}${garis}</svg>`;
}

const legenda = () => `<div class="legenda">${SERI.map(([k, l]) => `<span><i class="s-${k}"></i>${l}</span>`).join('')}</div>`;

export function renderDasbor(st) {
  const d = st.isi.dasbor;
  const kontrol = `<div class="row">
    <label>Rentang <select id="dbHari">${[7, 14, 30].map(h => `<option value="${h}"${h === st.db?.hari ? ' selected' : ''}>${h} hari terakhir</option>`).join('')}</select></label>
    ${st.db?.publik ? '<span class="pill peach">Data fiktif, hanya pratinjau</span>' : `<label>Data <select id="dbSumber"><option value="0"${(!st.db?.lokal && !st.db?.demo) ? ' selected' : ''}>Sekolah (server)</option><option value="1"${(!st.db?.lokal && st.db?.demo) ? ' selected' : ''}>Kelas demo (server)</option><option value="2"${st.db?.lokal ? ' selected' : ''}>Pratinjau lokal (fiktif)</option></select></label>`}</div>`;
  if (!d) return `<div class="card clay">${kontrol}<p class="muted">Memuat…</p></div>`;
  const total = (d.harian || []).reduce((a, x) => ({ h: a.h + x.hadir + x.terlambat, n: a.n + x.hadir + x.terlambat + x.izin_sakit + x.tidak_tercatat, t: a.t + x.terlambat }), { h: 0, n: 0, t: 0 });
  const acuan = (d.harian || []).find(x => x.tanggal === d.acuan) || { hadir: 0, terlambat: 0, izin_sakit: 0, tidak_tercatat: 0 };
  const label = d.acuan === d.hari_ini ? 'hari ini' : d.acuan ? tglPendek(d.acuan) : '—';
  return `<div class="card clay">${kontrol}
    ${st.db?.lokal ? `<div class="note clay" style="margin:5px 0">
      <h3>SIMULASI LOKAL — bukan laporan sekolah</h3>
      <p class="kecil">Grafik dan seluruh angka di bawah dibuat dari data fiktif di browser. Tidak mengambil presensi siswa asli.</p>
      ${st.db.kesalahan ? `<p class="status err">${esc(st.db.kesalahan)}</p>
        <p class="kecil">Panduan migrasi: <a href="https://github.com/tomrzetd/cikaracak/blob/hadir-uji-kartu/supabase/migrations/20261110000002_dasbor_demo.sql" target="_blank" rel="noopener noreferrer">20261110000002_dasbor_demo.sql</a>. Jalankan pada proyek Supabase yang benar, lalu muat ulang.</p>
        <button class="btn kecil" data-aksi="dasbor-coba-server">Coba laporan server lagi</button>` : ''}</div>`
      : st.db?.demo ? '<p class="status">Menampilkan kelas demo dari server dengan siswa fiktif.</p>'
      : '<p class="muted kecil">Laporan presensi dari server sekolah.</p>'}
    <div class="stats">
      ${kartuStat('mint', '', `Hadir ${label}`, `${persen(acuan.hadir + acuan.terlambat, d.siswa)}%`, `${acuan.hadir + acuan.terlambat} dari ${d.siswa} siswa`)}
      ${kartuStat('butter', '', `Terlambat ${label}`, acuan.terlambat, 'siswa')}
      ${kartuStat('peach', '', `Tidak tercatat ${label}`, acuan.tidak_tercatat, 'belum tap / alpa')}
      ${kartuStat('sky', '', `Rata-rata ${st.db?.hari || 14} hari`, `${persen(total.h, total.n)}%`, `kehadiran · ${persen(total.t, total.n)}% terlambat`)}
    </div></div>
  <div class="card clay"><h3>Presensi harian</h3>${legenda()}${grafikHarian(d)}
    <details><summary class="kecil">Lihat sebagai tabel</summary><div class="tablebox"><table><tr><th class="l">Tanggal</th>${SERI.map(([, l]) => `<th>${l}</th>`).join('')}</tr>
      ${(d.harian || []).map(x => `<tr><td class="l">${esc(x.tanggal)}</td>${SERI.map(([k]) => `<td>${x[k]}</td>`).join('')}</tr>`).join('')}</table></div></details></div>
  <div class="cols"><div class="card clay"><h3>Per kelas · ${label}</h3>${legenda()}
    <div class="per-kelas">${(d.kelas || []).map(x => `<div class="baris-kelas"><b>${esc(x.kelas)}</b>
      <div class="bar100" role="img" aria-label="${esc(x.kelas)}: ${persen(x.hadir + x.terlambat, x.siswa)}% hadir">${SERI.map(([k, l]) => x[k] ? `<i class="s-${k}" style="flex:${x[k]}" title="${l}: ${x[k]}"></i>` : '').join('')}</div>
      <span class="kecil">${persen(x.hadir + x.terlambat, x.siswa)}%</span></div>`).join('') || '<p class="muted">Tidak ada data.</p>'}</div></div>
    <div class="card clay"><h3>Jam kedatangan</h3><p class="muted kecil">Jumlah tap masuk per 5 menit, ${st.db?.hari || 14} hari terakhir.</p>${grafikKedatangan(d)}</div></div>`;
}

// ---------- Uji & demo mesin ----------
function kartuHasil(t, alatNama) {
  const j = teksHasil(t.jawaban || { hasil: t.hasil });
  return `<div class="tap-besar"><div class="sim-wajah" aria-hidden="true">${j.wajah}</div>
    <div><h2>${esc(j.judul)}</h2><p>${esc(j.sub)}${t.siswa?.rombel?.nama ? ` · ${esc(t.siswa.rombel.nama)}` : ''}</p>
    <p class="muted kecil">${esc(alatNama)} · ${relatif(t.diterima_at)}${t.offline ? ' · dari antrean offline' : ''}</p></div></div>`;
}

export function renderDemo(st) {
  const alat = st.alat || [], feed = st.isi.feed || [], u = st.uji || {};
  const namaAlat = id => alat.find(a => a.id === id)?.nama || id;
  const pilih = u.alat || alat[0]?.id;
  const a = alat.find(x => x.id === pilih);
  let uji = '';
  if (u.menunggu) uji = `<div class="langkah"><p class="ok">✔ Alat <b>${esc(namaAlat(u.alat))}</b> dipilih</p><p><span class="denyut"></span> <b>Tempelkan kartu apa saja ke alat sekarang…</b> (${Math.max(0, 60 - Math.round((Date.now() - u.mulai) / 1000))} detik)</p></div>`;
  else if (u.tap) {
    const t = u.tap, waktu = t.waktu && t.diterima_at ? Math.max(0, (new Date(t.diterima_at) - new Date(t.waktu)) / 1000) : null;
    uji = `<div class="langkah">
      <p class="ok">✔ Alat tersambung ke server lewat internet</p>
      <p class="ok">✔ Kartu MIFARE terbaca, UID sah</p>
      <p class="ok">✔ Tanda tangan HMAC alat sah (kunci alat cocok)</p>
      <p class="ok">✔ Server menjawab: <b>${esc(teksHasil(t.jawaban || { hasil: t.hasil }).judul)}</b></p>
      ${waktu != null && !t.offline ? `<p class="ok">✔ Waktu tempuh ± ${waktu.toFixed(1)} detik (menurut jam alat)</p>` : ''}
      <p class="hasil-uji">✅ Mesin presensi berfungsi</p></div>`;
  } else if (u.habis) uji = `<div class="langkah"><p class="status err">Belum ada tap dari alat ini dalam 60 detik.</p>
    <p class="kecil">Periksa: alat menyala dan menampilkan wajah Ciki; ikon sinyal hijau; ID & kunci alat di pengaturan alat sama dengan tab Alat; jam alat tidak "--:--".</p></div>`;
  return `<div class="cols">
    <div class="card clay"><h3>1 · Uji mesin presensi</h3>
      <p class="muted kecil">Membuktikan rantai lengkap: kartu MIFARE → pembaca RC522 → ESP32 → internet → server → jawaban di layar alat.</p>
      ${alat.length ? `<label>Alat <select id="ujiAlat">${alat.map(x => `<option value="${esc(x.id)}"${x.id === pilih ? ' selected' : ''}>${esc(x.nama)} (${esc(x.id)})</option>`).join('')}</select></label>
      ${a ? `<p class="kecil">${online(a) ? '<span class="pill tuntas">Online</span>' : '<span class="pill ulang">Offline</span>'} kontak terakhir ${relatif(a.terakhir_kontak)} · firmware ${esc(a.versi || '—')} · antrean ${a.antrean ?? 0}</p>` : ''}
      <div class="row"><button class="btn utama" data-aksi="uji-mulai"${u.menunggu ? ' disabled' : ''}>${u.tap || u.habis ? 'Uji lagi' : 'Mulai uji'}</button></div>${uji}`
      : '<p class="muted">Belum ada alat. Buat di tab Alat.</p>'}</div>
    <div class="card clay layar-langsung" id="layarLangsung"><div class="head"><h3>2 · Layar langsung</h3><button class="btn kecil polos" data-aksi="layar-penuh">Layar penuh</button></div>
      ${feed[0] ? kartuHasil(feed[0], namaAlat(feed[0].alat_id)) : '<p class="muted">Belum ada tap. Tempelkan kartu ke alat, atau pakai Simulator alat.</p>'}
      <div class="feed">${feed.slice(1, 8).map(t => { const j = teksHasil(t.jawaban || { hasil: t.hasil }); return `<div class="row feed-baris"><span aria-hidden="true">${j.wajah}</span><b>${esc(t.siswa?.panggilan || '—')}</b><span class="kecil">${esc(j.judul)}</span><span class="kecil muted">${relatif(t.diterima_at)}</span></div>`; }).join('')}</div>
      <p class="muted kecil">Diperbarui tiap 2 detik.</p></div></div>
    <div class="card clay"><h3>3 · Kelas demo (siswa fiktif)</h3>
      ${st.isi.demo ? `<p>Kelas <b>${esc(st.isi.demo.nama)}</b> aktif: 30 siswa fiktif dengan riwayat presensi 20 hari sekolah tersimulasi.
        Kartu uji: UID <code>DE000001</code> (Adit), <code>DE000002</code> (Bella), … <code>DE00001E</code>. Pakai di <b>Simulator alat</b>, atau buka <b>Dasbor sekolah → Data: Kelas demo</b>.</p>
        <div class="row"><button class="btn polos" data-aksi="demo-dasbor">Buka dasbor demo</button><button class="btn bahaya" data-aksi="demo-hapus">Hapus kelas demo</button></div>`
      : `<p class="muted kecil">Untuk presentasi: membuat kelas "DEMO (simulasi)" berisi 30 siswa fiktif, kartu uji, dan riwayat presensi 20 hari sekolah
        (sebagian sering terlambat, sesekali sakit/izin). Terpisah dari data asli dan bisa dihapus bersih.</p>
        <div class="row"><button class="btn hijau" data-aksi="demo-buat">Buat kelas demo</button></div>`}</div>`;
}

export async function aksi(a, b, st, ctx, muatTab) {
  if (a === 'uji-mulai') {
    const alat = document.getElementById('ujiAlat')?.value || st.alat?.[0]?.id;
    const terakhir = await srv.daftar('tap', 'id', { alat_id: 'eq.' + alat, order: 'id.desc', limit: 1 });
    st.uji = { alat, mulai: Date.now(), dariId: terakhir[0]?.id || 0, menunggu: true };
    ctx.render(); return true;
  }
  if (a === 'layar-penuh') { const el = document.getElementById('layarLangsung'); if (el?.requestFullscreen) el.requestFullscreen().catch(() => toast('Layar penuh tidak didukung di sini')); return true; }
  if (a === 'demo-buat') {
    b.disabled = true; b.textContent = 'Membuat…';
    const j = await srv.rpc('buat_kelas_demo', { p_siswa: 30, p_hari: 28 });
    toast(`Kelas demo dibuat: ${j.siswa} siswa, ${j.hari_sekolah} hari sekolah`); st.profil = null; muatTab(ctx); return true;
  }
  if (a === 'demo-hapus') { konfirmasiDuaKetuk(b, async () => { try { await srv.rpc('hapus_kelas_demo'); toast('Kelas demo dihapus'); st.profil = null; muatTab(ctx); } catch (e) { toast(e.message); } }, 'Yakin hapus?'); return true; }
  if (a === 'demo-dasbor') { st.db = { hari: 14, demo: true, lokal: false }; st.tab = 'dasbor'; muatTab(ctx); return true; }
  if (a === 'dasbor-coba-server') { st.db.lokal = false; st.db.demo = false; st.db.kesalahan = ''; muatTab(ctx); return true; }
  return false;
}

export function ubahIsian(e, st, ctx, muatTab) {
  if (e.target.id === 'dbHari') { st.db.hari = Number(e.target.value); muatTab(ctx); }
  if (e.target.id === 'dbSumber') {
    st.db.demo = e.target.value === '1';
    st.db.lokal = e.target.value === '2';
    st.db.kesalahan = '';
    muatTab(ctx);
  }
  if (e.target.id === 'ujiAlat') { st.uji = { alat: e.target.value }; ctx.render(); }
}

/** Segarkan layar langsung tiap 2 detik selama tab Uji & demo terbuka. */
export function pasang(el, st, ctx, bolehSegar) {
  setInterval(async () => {
    if (el.hidden || st.tab !== 'demo' || !st.profil || document.visibilityState !== 'visible' || !bolehSegar()) return;
    try { await muatFeed(st); ctx.render(); } catch { /* coba lagi nanti */ }
  }, 2000);
}

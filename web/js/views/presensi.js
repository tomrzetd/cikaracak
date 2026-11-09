// Halaman Presensi (Cikaracak Hadir): tersambung ke server sekolah, berbeda dari halaman lain yang offline.
//  • Semua guru: daftar hadir hari ini, rekap bulanan, "perlu disapa".
//  • Wali kelas & admin: mengisi Sakit/Izin/Alpa beserta alasan.
//  • Kepala sekolah, wakasek, kesiswaan, piket (pada harinya): melihat semua kelas.
//  • Operator/piket: kartu siswa. Operator: alat, jadwal, pegawai & kelas, simulator alat.
import * as srv from '../server/supabase.js';
import { esc, toast, unduh } from '../util.js';
import { keCSV } from '../core/impor.js';
import { kosong } from './bersama.js';
import * as admin from './presensi-admin.js';
import * as demo from './presensi-demo.js';

export const st = {
  tab: 'hari', profil: null, rombel: [], rombelId: null, tanggal: null, bulan: null,
  isi: {}, memuat: false, galat: '', alat: [], sim: { alat: '', kunci: '', offline: false },
};

export const KEADAAN = {
  hadir: ['Hadir', 'tuntas'], terlambat: ['Terlambat', 'singkat'], sakit: ['Sakit', 'sky'], izin: ['Izin', 'sky'],
  alpa: ['Alpa', 'ulang'], belum: ['Belum tercatat', 'kosong'], libur: ['Libur', 'kosong'],
};
const OFFSET = { 'Asia/Jakarta': 7, 'Asia/Makassar': 8, 'Asia/Jayapura': 9 };

export const zona = () => st.profil?.sekolah?.zona || 'Asia/Jakarta';
export const tglZona = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: zona(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
export const jamZona = iso => (iso ? new Intl.DateTimeFormat('en-GB', { timeZone: zona(), hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) : '—');
/** "2026-11-06T06:50" (jam sekolah) -> detik Unix */
export function detikDariLokal(nilai) {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(nilai || '');
  if (!m) throw new Error('Isi tanggal dan jam');
  return Math.floor(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) / 1000) - (OFFSET[zona()] ?? 7) * 3600;
}
export const JABATAN = { admin: 'Operator', kepsek: 'Kepala sekolah', guru: 'Guru', tu: 'Tenaga TU' };
export const TUGAS = { piket: 'Piket', bendahara: 'Bendahara', keuangan: 'Keuangan', pustakawan: 'Perpustakaan',
  wakasek: 'Wakasek', kurikulum: 'Kurikulum', kesiswaan: 'Kesiswaan', kepala_lab: 'Kepala lab' };
export const HARI_PENDEK = ['', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
export const hariIniIso = () => ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 })[new Intl.DateTimeFormat('en-US', { timeZone: zona(), weekday: 'short' }).format(new Date())];
const punyaTugas = j => (st.profil?.tugas || []).some(t => t.jenis === j);
export const adalahAdmin = () => st.profil?.peran === 'admin';
// Sama dengan saya_piket() dan saya_lihat_semua() di server
export const adalahPiket = () => adalahAdmin() || (st.profil?.tugas || []).some(t => t.jenis === 'piket' && t.hari === hariIniIso());
const lihatSemua = () => ['admin', 'kepsek'].includes(st.profil?.peran) || punyaTugas('wakasek') || punyaTugas('kesiswaan') || adalahPiket();
export function ringkasTugas(tugas = []) {
  const piket = tugas.filter(t => t.jenis === 'piket').map(t => t.hari).sort();
  return [...(piket.length ? [`Piket ${piket.map(h => HARI_PENDEK[h]).join(', ')}`] : []),
          ...tugas.filter(t => t.jenis !== 'piket').map(t => TUGAS[t.jenis] || t.jenis)];
}
const rombelAktif = () => st.rombel.find(r => r.id === st.rombelId) || null;
const bolehUbah = () => adalahAdmin() || rombelAktif()?.wali_id === st.profil?.id;

function tabTersedia() {
  const t = [['hari', 'Hari ini']];
  if (lihatSemua()) t.push(['dasbor', 'Dasbor sekolah']);
  t.push(['rekap', 'Rekap bulanan'], ['disapa', 'Perlu disapa']);
  if (adalahPiket()) t.push(['kartu', 'Kartu siswa']);
  if (adalahAdmin()) t.push(['demo', 'Uji & demo mesin'], ['alat', 'Alat'], ['jadwal', 'Jadwal'], ['sekolah', 'Pegawai & kelas'], ['simulator', 'Simulator alat']);
  return t;
}

// ---------- memuat data ----------
export async function muatTab(ctx, { diam = false } = {}) {
  if (!diam) { st.memuat = true; st.galat = ''; ctx.render(); }
  try {
    if (!st.profil) await muatProfil();
    if (st.profil) {
      if (['hari', 'kartu'].includes(st.tab) && st.rombelId) st.isi.kelas = await srv.rpc('presensi_kelas', { p_rombel: st.rombelId, p_tanggal: st.tanggal });
      if (st.tab === 'rekap' && st.rombelId) st.isi.rekap = await srv.rpc('rekap_bulan', { p_rombel: st.rombelId, p_bulan: st.bulan + '-01' });
      if (st.tab === 'disapa' && st.rombelId) st.isi.disapa = await srv.rpc('peringatan_kelas', { p_rombel: st.rombelId, p_hari: 30 });
      if (['kartu', 'alat', 'simulator'].includes(st.tab) && adalahPiket()) st.alat = await srv.daftar('alat', 'id,nama,titik,aktif,versi,antrean,terakhir_kontak', { order: 'nama' });
      await admin.muat(st, ctx);
      await demo.muat(st);
    }
  } catch (e) {
    st.galat = e.message;
    if (!srv.masukSebagai()) st.profil = null;
  }
  st.memuat = false;
  ctx.render();
}

async function muatProfil() {
  const u = srv.masukSebagai();
  if (!u) return;
  const p = await srv.daftar('pengguna', 'id,nama,peran,wajib_ganti_sandi,sekolah_id,sekolah(nama,zona),tugas(jenis,hari)', { akun_id: 'eq.' + u.id });
  if (!p.length) { st.galat = 'Akun ini belum tersambung ke data pegawai, atau sudah dinonaktifkan. Hubungi operator sekolah.'; return; }
  st.profil = p[0];
  st.rombel = await srv.daftar('rombel', 'id,nama,tingkat,tahun_ajaran,wali_id', { order: 'tingkat,nama' });
  const wali = st.rombel.find(r => r.wali_id === st.profil.id);
  if (!st.rombel.some(r => r.id === st.rombelId)) st.rombelId = (wali || st.rombel[0])?.id || null;
  st.tanggal = st.tanggal || tglZona();
  st.bulan = st.bulan || tglZona().slice(0, 7);
}

// ---------- tampilan ----------
const pill = k => { const [l, c] = KEADAAN[k] || [k, 'kosong']; return `<span class="pill ${c}">${esc(l)}</span>`; };

function formServer() {
  const s = srv.pengaturan() || {};
  return `<div class="cols"><div class="card clay">
    <h3>Sambungkan ke server sekolah</h3>
    <p class="muted kecil">Presensi kartu membutuhkan server bersama (Supabase). Halaman lain tetap berjalan offline tanpa server.</p>
    <label>Alamat server <input id="srvUrl" data-sementara value="${esc(s.url || '')}" placeholder="https://xxxx.supabase.co" inputmode="url" autocomplete="off"></label>
    <label>Kunci anon / publishable <input id="srvAnon" data-sementara value="${esc(s.anon || '')}" placeholder="eyJ... atau sb_publishable_..." autocomplete="off"></label>
    <div class="row"><button class="btn hijau" data-aksi="simpan-server">Simpan & lanjut</button></div>
  </div>
  <div class="note clay"><h3>Belum punya server?</h3><ol>
    <li>Buat proyek gratis di supabase.com.</li>
    <li>Di SQL Editor, jalankan file <code>supabase/migrations/*.sql</code> berurutan, lalu <code>supabase/demo.sql</code>.</li>
    <li>Alamat server dan kunci anon ada di Project Settings → API.</li>
  </ol><p class="kecil">Panduan lengkap: docs/hadir-supabase.md di repositori.</p></div></div>`;
}

function formMasuk() {
  return `<div class="cols"><div class="card clay">
    <h3>Masuk</h3>
    <p class="muted kecil">Server: ${esc(srv.pengaturan()?.url)}</p>
    <form id="formMasuk" class="kolom">
      <label>NIP / PegID <input id="masukEmail" data-sementara autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="ID login dari operator sekolah" required></label>
      <label>Kata sandi <input id="masukSandi" type="password" autocomplete="current-password" required></label>
      <div class="row"><button class="btn hijau" type="submit">Masuk</button><button class="btn polos" type="button" data-aksi="ganti-server">Ganti server</button></div>
    </form>
    ${st.galat ? `<p class="status err">${esc(st.galat)}</p>` : ''}
  </div></div>`;
}

function pilihRombel() {
  return `<label>Kelas <select id="presRombel">${st.rombel.map(r => `<option value="${esc(r.id)}"${r.id === st.rombelId ? ' selected' : ''}>${esc(r.nama)}${r.wali_id === st.profil.id ? ' (perwalian)' : ''}</option>`).join('')}</select></label>`;
}

function tabHari() {
  const d = st.isi.kelas || [];
  const n = k => d.filter(x => x.keadaan === k).length;
  const ubah = bolehUbah();
  return `<div class="card clay">
    <div class="row">${pilihRombel()}<label>Tanggal <input type="date" id="presTanggal" value="${esc(st.tanggal)}" max="${esc(tglZona())}"></label>
      <button class="btn kecil polos" data-aksi="muat-ulang">Muat ulang</button></div>
    <div class="row ringkas">${['hadir', 'terlambat', 'sakit', 'izin', 'alpa', 'belum'].map(k => `${pill(k)} <b>${n(k)}</b>`).join(' ')}</div>
    ${st.tanggal === tglZona() ? '<p class="muted kecil">Diperbarui otomatis tiap 10 detik.</p>' : ''}
    ${d.length ? `<div class="tablebox"><table>
      <tr><th>No</th><th class="l">Nama</th><th>Masuk</th><th>Pulang</th><th class="l">Keadaan</th><th>Kartu</th>${ubah ? '<th></th>' : ''}</tr>
      ${d.map(x => `<tr><td>${x.no_absen}</td><td class="l">${esc(x.nama)}</td><td>${jamZona(x.masuk_at)}</td><td>${jamZona(x.pulang_at)}</td>
        <td class="l">${pill(x.keadaan)}${x.keadaan === 'terlambat' ? ` <span class="kecil">${x.terlambat_menit} mnt</span>` : ''}${x.alasan ? `<div class="kecil muted">${esc(x.alasan)}</div>` : ''}</td>
        <td>${x.punya_kartu ? '✔' : '<span class="muted">—</span>'}</td>
        ${ubah ? `<td><button class="btn kecil polos" data-aksi="ubah-presensi" data-siswa="${esc(x.siswa_id)}">Ubah</button></td>` : ''}</tr>`).join('')}
    </table></div>` : '<p class="muted">Belum ada siswa di kelas ini.</p>'}
    ${ubah ? '' : '<p class="muted kecil">Hanya wali kelas dan admin yang bisa mengisi Sakit, Izin, atau Alpa.</p>'}
  </div>`;
}

function tabRekap() {
  const d = st.isi.rekap || [];
  return `<div class="card clay">
    <div class="row">${pilihRombel()}<label>Bulan <input type="month" id="presBulan" value="${esc(st.bulan)}"></label>
      <button class="btn kecil hijau" data-aksi="unduh-rekap"${d.length ? '' : ' disabled'}>Unduh CSV</button></div>
    <p class="muted kecil">Hadir sudah termasuk terlambat. "Belum" = hari sekolah tanpa tap dan belum diisi wali kelas.</p>
    ${d.length ? `<div class="tablebox"><table>
      <tr><th>No</th><th class="l">Nama</th><th>Hari sekolah</th><th>Hadir</th><th>Terlambat</th><th>Menit</th><th>S</th><th>I</th><th>A</th><th>Belum</th></tr>
      ${d.map(x => `<tr><td>${x.no_absen}</td><td class="l">${esc(x.nama)}</td><td>${x.hari_sekolah}</td><td><b>${x.hadir}</b></td><td>${x.terlambat}</td><td>${x.menit_terlambat}</td><td>${x.sakit}</td><td>${x.izin}</td><td>${x.alpa}</td><td>${x.belum}</td></tr>`).join('')}
    </table></div>` : '<p class="muted">Tidak ada data.</p>'}
  </div>`;
}

function tabDisapa() {
  const d = st.isi.disapa || [];
  return `<div class="card clay">
    <div class="row">${pilihRombel()}</div>
    <p class="muted kecil">30 hari terakhir: siswa yang 3 kali atau lebih terlambat, atau 3 hari atau lebih tidak tercatat/alpa.
      Sapa dan tanyakan kabarnya lebih dulu. Bisa jadi ada kendala transportasi, kesehatan, atau keadaan di rumah.</p>
    ${d.length ? `<div class="kolom">${d.map(x => `<div class="sapa clay t-butter"><b>${esc(x.nama)}</b><span class="kecil">${esc(x.alasan)}</span></div>`).join('')}</div>`
      : '<p>Tidak ada siswa yang perlu disapa. 🌱</p>'}
  </div>`;
}

export function render(el, ctx) {
  if (!srv.terhubung()) { el.innerHTML = formServer(); return; }
  if (!srv.masukSebagai()) { el.innerHTML = formMasuk(); return; }
  if (!st.profil) {
    el.innerHTML = st.galat
      ? `<div class="card clay"><h3>Belum bisa membuka presensi</h3><p class="status err">${esc(st.galat)}</p><div class="row"><button class="btn polos" data-aksi="muat-ulang">Coba lagi</button><button class="btn polos" data-aksi="keluar">Keluar</button></div></div>`
      : '<div class="card clay"><p class="muted">Memuat…</p></div>';
    if (!st.memuat && !st.galat) muatTab(ctx);
    return;
  }
  if (st.profil.wajib_ganti_sandi) { el.innerHTML = formGantiSandi(); return; }
  if (st.profil.peran === 'tu' && !st.rombel.length) {
    el.innerHTML = `<div class="card clay"><h3>Halo, ${esc(st.profil.nama)}</h3>
      <p>${esc(['Tenaga TU', ...ringkasTugas(st.profil.tugas)].join(' · '))}</p>
      <p class="muted">Menu Keuangan (koperasi, tabungan siswa, kegiatan) dan Perpustakaan (peminjaman buku) sedang disiapkan.</p>
      <div class="row"><button class="btn polos" data-aksi="keluar">Keluar</button></div></div>`;
    return;
  }
  const tabs = tabTersedia();
  if (!tabs.some(([k]) => k === st.tab)) st.tab = 'hari';
  const isi = { hari: tabHari, rekap: tabRekap, disapa: tabDisapa, dasbor: () => demo.renderDasbor(st), demo: () => demo.renderDemo(st) }[st.tab];
  el.innerHTML = `
    <div class="card clay presensi-kepala">
      <div class="head"><div><h3>${esc(st.profil.sekolah?.nama || 'Sekolah')}</h3>
        <p>${esc(st.profil.nama)} · ${esc([JABATAN[st.profil.peran] || st.profil.peran, ...ringkasTugas(st.profil.tugas)].join(' · '))}</p>
        <p class="muted kecil">${esc(srv.idDariEmail(srv.masukSebagai().email || ''))}</p></div>
        <button class="btn kecil polos" data-aksi="keluar">Keluar</button></div>
      <div class="row tab-presensi" role="tablist">${tabs.map(([k, l]) => `<button class="btn kecil${k === st.tab ? ' hijau' : ' polos'}" role="tab" aria-selected="${k === st.tab}" data-tab="${k}">${l}</button>`).join('')}</div>
    </div>
    ${st.galat ? `<p class="status err">${esc(st.galat)}</p>` : ''}
    ${!st.rombel.length && ['hari', 'rekap', 'disapa', 'kartu'].includes(st.tab)
      ? kosong('Belum ada kelas', adalahAdmin() ? 'Tambahkan kelas dan siswa di tab Kelas & guru.' : 'Admin sekolah belum menambahkan kelas, atau Anda belum ditugaskan mengajar.')
      : isi ? isi() : admin.render(st, ctx)}
    ${st.memuat ? '<p class="muted kecil">Memuat…</p>' : ''}`;
}

function formGantiSandi() {
  return `<div class="cols"><div class="card clay"><h3>Buat sandi baru</h3>
    <p class="muted kecil">Ini masuk pertama Anda (atau sandi baru saja direset operator). Buat sandi pribadi yang hanya Anda ketahui.</p>
    <form id="formSandi" class="kolom">
      <label>Sandi baru <input id="sandiBaru" data-sementara type="password" autocomplete="new-password" minlength="8" required></label>
      <label>Ulangi sandi baru <input id="sandiUlang" data-sementara type="password" autocomplete="new-password" minlength="8" required></label>
      <label class="cek"><input type="checkbox" id="lihatSandi"> Tampilkan sandi</label>
      <div class="row"><button class="btn hijau" type="submit">Simpan sandi</button><button class="btn polos" type="button" data-aksi="keluar">Keluar</button></div>
    </form>${st.galat ? `<p class="status err">${esc(st.galat)}</p>` : ''}</div></div>`;
}

function bukaUbah(ctx, siswaId) {
  const x = (st.isi.kelas || []).find(s => s.siswa_id === siswaId);
  if (!x) return;
  const pilihan = [['', 'Ikuti tap kartu'], ['H', 'Hadir'], ['S', 'Sakit'], ['I', 'Izin'], ['A', 'Alpa']];
  const isi = ctx.buka(`<h2>${esc(x.nama)}</h2><p class="muted">${esc(st.tanggal)} · sekarang: ${KEADAAN[x.keadaan]?.[0] || x.keadaan}</p>
    <div class="kolom">${pilihan.map(([v, l]) => `<label class="cek"><input type="radio" name="stPres" value="${v}"${(x.status || '') === v ? ' checked' : ''}> ${l}</label>`).join('')}</div>
    <label>Alasan (wajib untuk Sakit, Izin, Alpa) <input id="alasanPres" maxlength="200" value="${esc(x.alasan || '')}" placeholder="mis. surat dari orang tua"></label>
    <div class="row"><button class="btn hijau" id="simpanPres">Simpan</button><button class="btn polos" data-tutup>Batal</button></div>`, { sempit: true });
  isi.querySelector('#simpanPres').onclick = async () => {
    const v = isi.querySelector('input[name=stPres]:checked')?.value || '';
    try {
      await srv.rpc('ubah_presensi', { p_siswa: siswaId, p_tanggal: st.tanggal, p_status: v || null, p_alasan: isi.querySelector('#alasanPres').value.trim() || null });
      ctx.tutup(); toast('Presensi diperbarui'); muatTab(ctx, { diam: true });
    } catch (e) { toast(e.message); }
  };
}

export function pasang(el, ctx) {
  el.addEventListener('submit', async e => {
    if (e.target.id === 'formSandi') {
      e.preventDefault();
      const a = el.querySelector('#sandiBaru').value, b = el.querySelector('#sandiUlang').value;
      try {
        if (a.length < 8) throw new Error('Sandi minimal 8 karakter');
        if (a !== b) throw new Error('Kedua sandi tidak sama');
        await srv.gantiSandi(a);
        await srv.rpc('sandi_sudah_diganti');
        st.galat = ''; st.profil = null; toast('Sandi tersimpan'); muatTab(ctx);
      } catch (err) { st.galat = err.message; ctx.render(); }
      return;
    }
    if (e.target.id !== 'formMasuk') return;
    e.preventDefault();
    try {
      st.galat = '';
      await srv.masuk(el.querySelector('#masukEmail').value, el.querySelector('#masukSandi').value);
      st.profil = null; st.tab = 'hari';
      muatTab(ctx);
    } catch (err) { st.galat = err.message; ctx.render(); }
  });
  el.addEventListener('change', e => {
    const id = e.target.id;
    if (id === 'presRombel') { st.rombelId = e.target.value; muatTab(ctx); }
    if (id === 'presTanggal' && e.target.value) { st.tanggal = e.target.value; muatTab(ctx); }
    if (id === 'presBulan' && e.target.value) { st.bulan = e.target.value; muatTab(ctx); }
    admin.ubahIsian(e, st, ctx);
    demo.ubahIsian(e, st, ctx, muatTab);
  });
  el.addEventListener('click', async e => {
    const t = e.target.closest('[data-tab]');
    if (t) { st.tab = t.dataset.tab; st.galat = ''; muatTab(ctx); return; }
    const b = e.target.closest('[data-aksi]');
    if (!b) return;
    const a = b.dataset.aksi;
    try {
      if (a === 'simpan-server') {
        srv.aturServer(el.querySelector('#srvUrl').value, el.querySelector('#srvAnon').value);
        st.profil = null; st.galat = ''; ctx.render(); toast('Server disimpan');
      } else if (a === 'ganti-server') { srv.lupakanServer(); st.profil = null; ctx.render(); }
      else if (a === 'keluar') { await srv.keluar(); Object.assign(st, { profil: null, rombel: [], isi: {}, galat: '', sim: { alat: '', kunci: '' } }); ctx.render(); }
      else if (a === 'muat-ulang') { st.galat = ''; muatTab(ctx); }
      else if (a === 'ubah-presensi') bukaUbah(ctx, b.dataset.siswa);
      else if (a === 'unduh-rekap') {
        const r = rombelAktif();
        const baris = [['no', 'nama', 'hari_sekolah', 'hadir', 'terlambat', 'menit_terlambat', 'sakit', 'izin', 'alpa', 'belum_tercatat'],
          ...(st.isi.rekap || []).map(x => [x.no_absen, x.nama, x.hari_sekolah, x.hadir, x.terlambat, x.menit_terlambat, x.sakit, x.izin, x.alpa, x.belum])];
        unduh(`presensi-${r?.nama || 'kelas'}-${st.bulan}.csv`, '﻿' + keCSV(baris), 'text/csv;charset=utf-8');
      } else if (!(await demo.aksi(a, b, st, ctx, muatTab))) await admin.aksi(a, b, st, ctx);
    } catch (err) { toast(err.message); }
  });
  // Segarkan daftar hadir tiap 10 detik, tetapi JANGAN saat pengguna sedang mengetik atau di layar sandi:
  // menggambar ulang di tengah ketikan membuat kolom kehilangan fokus dan keyboard HP tertutup.
  const mengetik = () => el.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  setInterval(() => {
    if (!el.hidden && st.tab === 'hari' && st.profil && !st.profil.wajib_ganti_sandi && st.rombelId && st.tanggal === tglZona()
        && !st.memuat && !mengetik() && !document.querySelector('#lapis:not([hidden])') && document.visibilityState === 'visible') muatTab(ctx, { diam: true });
  }, 10000);
  demo.pasang(el, st, ctx, () => !mengetik() && !document.querySelector('#lapis:not([hidden])'));
  // Sesi tersimpan: muat profil di awal agar nama & jabatan langsung tampil di kepala aplikasi.
  if (srv.terhubung() && srv.masukSebagai()) muatTab(ctx, { diam: true });
  el.addEventListener('change', e => {
    if (e.target.id !== 'lihatSandi') return;
    el.querySelectorAll('#sandiBaru, #sandiUlang').forEach(x => { x.type = e.target.checked ? 'text' : 'password'; });
  });
  el.addEventListener('input', e => {   // saring daftar pegawai tanpa menggambar ulang halaman
    if (e.target.id !== 'cariPegawai') return;
    const q = e.target.value.trim().toLowerCase();
    el.querySelectorAll('.pegawai').forEach(x => { x.hidden = !!q && !x.dataset.nama.includes(q); });
  });
}

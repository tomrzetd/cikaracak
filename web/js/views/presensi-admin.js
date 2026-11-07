// Bagian admin halaman Presensi: kartu siswa, alat, jadwal, kelas & guru, simulator alat.
import * as srv from '../server/supabase.js';
import { esc, toast, salin, konfirmasiDuaKetuk } from '../util.js';
import { tapBertanda, teksHasil, rapikanUid } from '../core/tanda.js';
import { muatTab, adalahAdmin, tglZona, detikDariLokal } from './presensi.js';

const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const TITIK = { gerbang: 'Gerbang', kantin: 'Kantin', perpustakaan: 'Perpustakaan' };
let hentikanDaftar = null;

export async function muat(st) {
  if (st.tab === 'jadwal') {
    st.isi.jadwal = await srv.daftar('jadwal', 'hari,jam_masuk,toleransi_menit,jam_pulang', { order: 'hari' });
    st.isi.libur = await srv.daftar('kalender_libur', 'tanggal,keterangan', { tanggal: 'gte.' + tglZona(new Date(Date.now() - 30 * 864e5)), order: 'tanggal' });
  }
  if (st.tab === 'sekolah') {
    st.isi.guru = await srv.daftar('pengguna', 'id,nama,peran,piket,aktif', { order: 'nama' });
    st.isi.kelasSiswa = await srv.daftar('rombel', 'id,nama,tingkat,tahun_ajaran,wali_id', { order: 'tingkat,nama' });
    const siswa = await srv.daftar('siswa', 'rombel_id', { aktif: 'is.true' });
    st.isi.jumlahSiswa = siswa.reduce((m, s) => ({ ...m, [s.rombel_id]: (m[s.rombel_id] || 0) + 1 }), {});
  }
  if (st.tab === 'simulator' && !st.sim.alat && st.alat[0]) st.sim.alat = st.alat[0].id;
}

const relatif = iso => {
  if (!iso) return 'belum pernah';
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 1 ? 'baru saja' : m < 60 ? `${m} menit lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`;
};
const pilihAlat = (st, id = 'pilihAlat') => st.alat.length
  ? `<label>Alat <select id="${id}">${st.alat.map(a => `<option value="${esc(a.id)}"${a.id === st.sim.alat ? ' selected' : ''}>${esc(a.nama)} (${esc(a.id)})</option>`).join('')}</select></label>`
  : '<p class="muted kecil">Belum ada alat. Tambahkan di tab Alat.</p>';

function tabKartu(st) {
  const d = st.isi.kelas || [];
  const r = st.rombel.find(x => x.id === st.rombelId);
  const punya = d.filter(x => x.punya_kartu).length;
  return `<div class="card clay">
    <div class="row"><label>Kelas <select id="presRombel">${st.rombel.map(x => `<option value="${esc(x.id)}"${x.id === st.rombelId ? ' selected' : ''}>${esc(x.nama)}</option>`).join('')}</select></label>${pilihAlat(st)}</div>
    <p class="muted kecil">${punya} dari ${d.length} siswa ${esc(r?.nama || '')} sudah punya kartu. <b>Daftar lewat alat</b>: pilih siswa, lalu tempelkan kartunya ke alat dalam 60 detik.
      Atau ketik UID yang tampil di firmware uji kartu. Server hanya menyimpan sidik (hash) UID.</p>
    <div class="tablebox"><table><tr><th>No</th><th class="l">Nama</th><th>Kartu</th><th class="l"></th></tr>
    ${d.map(x => `<tr><td>${x.no_absen}</td><td class="l">${esc(x.nama)}</td><td>${x.punya_kartu ? '<span class="pill tuntas">Ada</span>' : '<span class="pill kosong">Belum</span>'}</td>
      <td class="l"><div class="row" style="gap:6px">
        <button class="btn kecil hijau" data-aksi="daftar-alat" data-siswa="${esc(x.siswa_id)}"${st.alat.length ? '' : ' disabled'}>Daftar lewat alat</button>
        ${adalahAdmin() ? `<button class="btn kecil polos" data-aksi="ketik-uid" data-siswa="${esc(x.siswa_id)}">Ketik UID</button>` : ''}
        ${adalahAdmin() && x.punya_kartu ? `<button class="btn kecil bahaya" data-aksi="cabut-kartu" data-siswa="${esc(x.siswa_id)}">Nonaktifkan</button>` : ''}
      </div></td></tr>`).join('')}</table></div></div>`;
}

function tabAlat(st) {
  return `<div class="cols"><div class="card clay"><h3>Alat presensi</h3>
    ${st.alat.length ? `<div class="tablebox"><table><tr><th class="l">Nama</th><th>ID</th><th>Titik</th><th>Kontak terakhir</th><th>Antrean</th><th>Versi</th><th class="l"></th></tr>
    ${st.alat.map(a => `<tr><td class="l">${esc(a.nama)}</td><td><code>${esc(a.id)}</code></td><td>${esc(TITIK[a.titik] || a.titik)}</td>
      <td>${relatif(a.terakhir_kontak)}</td><td>${a.antrean ?? '—'}</td><td>${esc(a.versi || '—')}</td>
      <td class="l"><div class="row" style="gap:6px"><button class="btn kecil polos" data-aksi="ganti-kunci" data-alat="${esc(a.id)}">Ganti kunci</button>
        <button class="btn kecil ${a.aktif ? 'bahaya' : 'hijau'}" data-aksi="alat-aktif" data-alat="${esc(a.id)}" data-nilai="${a.aktif ? '0' : '1'}">${a.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button></div></td></tr>`).join('')}
    </table></div>` : '<p class="muted">Belum ada alat.</p>'}</div>
    <div class="card clay"><h3>Tambah alat</h3>
      <label>Nama <input id="alatNama" data-sementara maxlength="40" placeholder="mis. Gerbang utama"></label>
      <label>Titik <select id="alatTitik">${Object.entries(TITIK).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <div class="row"><button class="btn hijau" data-aksi="buat-alat">Buat alat</button></div>
      <p class="muted kecil">Kunci alat hanya tampil sekali. Isi ID dan kunci ke alat lewat mode pengaturan (tahan BOOT 3 detik).</p></div></div>`;
}

function tabJadwal(st) {
  const j = Object.fromEntries((st.isi.jadwal || []).map(x => [x.hari, x]));
  const jm = t => String(t || '').slice(0, 5);
  return `<div class="cols"><div class="card clay"><h3>Jam sekolah</h3>
    <p class="muted kecil">Tap pertama sampai jam masuk + toleransi = hadir; setelahnya terlambat (menit dihitung dari jam masuk). Tap setelah jam pulang = pulang.</p>
    <div class="tablebox"><table><tr><th class="l">Hari</th><th>Sekolah</th><th>Jam masuk</th><th>Toleransi (menit)</th><th>Jam pulang</th></tr>
    ${HARI.map((h, i) => { const x = j[i + 1]; return `<tr><td class="l">${h}</td><td><input type="checkbox" id="jdAda${i + 1}"${x ? ' checked' : ''} aria-label="${h} hari sekolah"></td>
      <td><input type="time" id="jdMasuk${i + 1}" value="${jm(x?.jam_masuk) || '07:00'}"></td>
      <td><input type="number" id="jdTol${i + 1}" min="0" max="120" value="${x?.toleransi_menit ?? 10}" style="width:80px"></td>
      <td><input type="time" id="jdPulang${i + 1}" value="${jm(x?.jam_pulang) || '14:00'}"></td></tr>`; }).join('')}
    </table></div><div class="row"><button class="btn hijau" data-aksi="simpan-jadwal">Simpan jadwal</button></div></div>
    <div class="card clay"><h3>Hari libur</h3>
      <div class="row"><input type="date" id="liburTgl" aria-label="Tanggal libur"><input id="liburKet" data-sementara maxlength="80" placeholder="Keterangan, mis. Maulid Nabi"><button class="btn kecil hijau" data-aksi="tambah-libur">Tambah</button></div>
      ${(st.isi.libur || []).map(l => `<div class="row"><b>${esc(l.tanggal)}</b> ${esc(l.keterangan)} <button class="btn kecil polos" data-aksi="hapus-libur" data-tgl="${esc(l.tanggal)}">Hapus</button></div>`).join('') || '<p class="muted kecil">Belum ada.</p>'}
    </div></div>`;
}

function tabSekolah(st, ctx) {
  const guru = st.isi.guru || [], kelas = st.isi.kelasSiswa || [];
  const lokal = ctx.store.data.rombel;
  return `<div class="cols"><div class="card clay"><h3>Kelas</h3>
    <div class="tablebox"><table><tr><th class="l">Kelas</th><th>Siswa</th><th class="l">Wali kelas</th></tr>
    ${kelas.map(r => `<tr><td class="l">${esc(r.nama)} <span class="muted kecil">${esc(r.tahun_ajaran)}</span></td><td>${st.isi.jumlahSiswa?.[r.id] || 0}</td>
      <td class="l"><select data-wali="${esc(r.id)}" aria-label="Wali ${esc(r.nama)}"><option value="">—</option>${guru.map(g => `<option value="${esc(g.id)}"${g.id === r.wali_id ? ' selected' : ''}>${esc(g.nama)}</option>`).join('')}</select></td></tr>`).join('')}
    </table></div>
    <h3>Tambah kelas / siswa</h3>
    <label>Kelas <select id="skKelas"><option value="">(kelas baru)</option>${kelas.map(r => `<option value="${esc(r.id)}">${esc(r.nama)}</option>`).join('')}</select></label>
    <div class="row"><label>Nama kelas baru <input id="skNama" data-sementara maxlength="40" placeholder="VII-B"></label>
      <label>Tingkat <input id="skTingkat" type="number" min="1" max="13" value="7" style="width:80px"></label>
      <label>Tahun ajaran <input id="skTahun" data-sementara value="2026/2027" style="width:120px"></label></div>
    <label>Siswa, satu per baris. Boleh "Nama lengkap | Panggilan" <textarea id="skSiswa" data-sementara rows="6" placeholder="Aditya Pratama | Adit"></textarea></label>
    <div class="row"><button class="btn hijau" data-aksi="simpan-kelas">Simpan ke server</button>
      ${lokal.length ? `<select id="skLokal" aria-label="Kelas di perangkat">${lokal.map(r => `<option value="${esc(r.id)}">${esc(r.nama)}</option>`).join('')}</select><button class="btn polos" data-aksi="isi-lokal">Isi dari kelas di perangkat</button>` : ''}</div>
    <p class="muted kecil">Hanya nama yang dikirim ke server. Foto siswa tetap di perangkat.</p></div>
    <div class="card clay"><h3>Guru & petugas</h3>
    ${guru.map(g => `<div class="row"><b>${esc(g.nama)}</b> <span class="pill ${g.peran === 'admin' ? 'sky' : 'kosong'}">${g.peran}</span>${g.piket ? '<span class="pill singkat">piket</span>' : ''}</div>`).join('')}
    <h3>Tambah guru</h3><p class="muted kecil">Guru membuat akun sendiri dulu (atau dibuatkan di Supabase → Authentication). Lalu masukkan emailnya di sini.</p>
    <label>Email <input id="ugEmail" data-sementara type="email"></label><label>Nama <input id="ugNama" data-sementara maxlength="80"></label>
    <div class="row"><label>Peran <select id="ugPeran"><option value="guru">Guru</option><option value="admin">Admin</option></select></label><label class="cek"><input type="checkbox" id="ugPiket"> Petugas piket</label></div>
    <div class="row"><button class="btn hijau" data-aksi="undang-guru">Tambahkan</button></div></div></div>`;
}

function tabSimulator(st) {
  const h = st.isi.sim;
  const t = h && teksHasil(h);
  return `<div class="cols"><div class="card clay"><h3>Simulator alat</h3>
    <p class="muted kecil">Meniru alat gerbang persis (tanda tangan HMAC yang sama), untuk demo tanpa perangkat keras. Kunci alat hanya disimpan di memori halaman ini.</p>
    ${pilihAlat(st, 'simAlat')}
    <label>Kunci alat (64 karakter) <input id="simKunci" type="password" autocomplete="off" value="${esc(st.sim.kunci)}" placeholder="dari saat alat dibuat atau supabase/demo.sql"></label>
    <div class="row"><label>UID kartu <input id="simUid" data-sementara value="A1B2C3D4" maxlength="29" style="width:160px"></label><button class="btn kecil polos" data-aksi="uid-acak">UID acak</button></div>
    <label class="cek"><input type="checkbox" id="simOffline"${st.sim.offline ? ' checked' : ''}> Tap dari antrean offline pada waktu tertentu</label>
    <label>Waktu (jam sekolah) <input type="datetime-local" id="simWaktu" data-sementara></label>
    <div class="row"><button class="btn utama" data-aksi="sim-tap">Tempelkan kartu</button></div></div>
    <div class="card clay sim-layar">${t ? `<div class="sim-wajah" aria-hidden="true">${t.wajah}</div><h3>${esc(t.judul)}</h3><p>${esc(t.sub)}</p>
      <pre class="kecil muted">${esc(JSON.stringify(h))}</pre>` : '<p class="muted">Hasil tap tampil di sini seperti di layar alat.</p>'}</div></div>`;
}

export function render(st, ctx) {
  return { kartu: tabKartu, alat: tabAlat, jadwal: tabJadwal, sekolah: tabSekolah, simulator: tabSimulator }[st.tab]?.(st, ctx) || '';
}

export function ubahIsian(e, st, ctx) {
  if (e.target.id === 'pilihAlat' || e.target.id === 'simAlat') st.sim.alat = e.target.value;
  if (e.target.id === 'simKunci') st.sim.kunci = e.target.value.trim();
  if (e.target.id === 'simOffline') st.sim.offline = e.target.checked;
  if (e.target.dataset.wali !== undefined) {
    srv.ubah('rombel', { id: 'eq.' + e.target.dataset.wali }, { wali_id: e.target.value || null })
      .then(() => { toast('Wali kelas disimpan'); st.profil = null; muatTab(ctx); }).catch(err => toast(err.message));
  }
}

function tampilKunci(ctx, st, j, judul) {
  st.sim = { alat: j.id, kunci: j.kunci };
  const isi = ctx.buka(`<h2>${esc(judul)}</h2>
    <p>ID alat: <b><code id="hasilId">${esc(j.id)}</code></b></p>
    <p>Kunci alat:</p><p><code id="hasilKunci" style="word-break:break-all">${esc(j.kunci)}</code></p>
    <p class="status err">Kunci ini hanya tampil sekali. Salin sekarang dan isi ke alat (tahan BOOT 3 detik → Configure WiFi).</p>
    <div class="row"><button class="btn polos" id="salinId">Salin ID</button><button class="btn polos" id="salinKunci">Salin kunci</button><button class="btn hijau" data-tutup>Selesai</button></div>`, { sempit: true });
  isi.querySelector('#salinId').onclick = () => salin(j.id, 'ID disalin');
  isi.querySelector('#salinKunci').onclick = () => salin(j.kunci, 'Kunci disalin');
}

function daftarLewatAlat(ctx, st, siswaId) {
  const siswa = (st.isi.kelas || []).find(x => x.siswa_id === siswaId);
  const alat = st.sim.alat || st.alat[0]?.id;
  const mulai = Date.now();
  return srv.rpc('mulai_daftar_kartu', { p_alat: alat, p_siswa: siswaId }).then(() => {
    const isi = ctx.buka(`<h2>Tempelkan kartu ${esc(siswa?.nama || '')}</h2>
      <p>di alat <b>${esc(st.alat.find(a => a.id === alat)?.nama || alat)}</b> dalam <b id="hitungDaftar">60</b> detik.</p>
      <p class="muted kecil" id="statusDaftar">Menunggu kartu…</p>
      ${st.sim.kunci && st.sim.alat === alat ? `<div class="row"><input id="daftarUid" value="${esc(rapikanUid(Math.random().toString(16).slice(2, 10)))}" maxlength="20" style="width:140px" aria-label="UID simulasi">
        <button class="btn kecil polos" id="daftarSim">Tempel lewat simulator</button></div>` : ''}
      <div class="row"><button class="btn polos" data-tutup>Tutup</button></div>`, { sempit: true, onTutup: () => hentikanDaftar?.() });
    const sim = isi.querySelector('#daftarSim');
    if (sim) sim.onclick = async () => {
      try { const j = await srv.rpc('catat_tap', await tapBertanda({ alat, kunciHex: st.sim.kunci, uid: isi.querySelector('#daftarUid').value }), { anon: true });
        isi.querySelector('#statusDaftar').textContent = 'Jawaban alat: ' + teksHasil(j).judul; } catch (e) { toast(e.message); }
    };
    let selesai = false;
    const t = setInterval(async () => {
      const sisa = 60 - Math.floor((Date.now() - mulai) / 1000);
      const el = isi.querySelector('#hitungDaftar');
      if (el) el.textContent = Math.max(0, sisa);
      try {
        const k = await srv.daftar('kartu', 'dibuat_at', { siswa_id: 'eq.' + siswaId, aktif: 'is.true' });
        if (!selesai && k[0] && new Date(k[0].dibuat_at).getTime() >= mulai - 5000) {
          selesai = true; hentikanDaftar(); ctx.tutup(); toast(`Kartu ${siswa?.nama || ''} terdaftar`); muatTab(ctx, { diam: true });
        }
      } catch { /* coba lagi */ }
      if (sisa <= 0 && !selesai) { hentikanDaftar(); const s = isi.querySelector('#statusDaftar'); if (s) s.textContent = 'Waktu habis. Kartu tidak terbaca, atau kartu sudah dipakai siswa lain.'; }
    }, 2000);
    hentikanDaftar = () => { clearInterval(t); hentikanDaftar = null; };
  });
}

export async function aksi(a, b, st, ctx) {
  const v = id => document.getElementById(id)?.value?.trim() || '';
  if (a === 'daftar-alat') return daftarLewatAlat(ctx, st, b.dataset.siswa);
  if (a === 'ketik-uid') {
    const siswa = (st.isi.kelas || []).find(x => x.siswa_id === b.dataset.siswa);
    const isi = ctx.buka(`<h2>UID kartu ${esc(siswa?.nama || '')}</h2>
      <label>UID (dari firmware uji kartu) <input id="uidManual" maxlength="29" placeholder="47DB1DE0" autofocus></label>
      <div class="row"><button class="btn hijau" id="simpanUid">Simpan</button><button class="btn polos" data-tutup>Batal</button></div>`, { sempit: true });
    isi.querySelector('#simpanUid').onclick = async () => {
      try { await srv.rpc('daftar_kartu_manual', { p_siswa: b.dataset.siswa, p_uid: isi.querySelector('#uidManual').value }); ctx.tutup(); toast('Kartu terdaftar'); muatTab(ctx, { diam: true }); }
      catch (e) { toast(e.message); }
    };
    return;
  }
  if (a === 'cabut-kartu') return konfirmasiDuaKetuk(b, async () => {
    try { await srv.ubah('kartu', { siswa_id: 'eq.' + b.dataset.siswa, aktif: 'is.true' }, { aktif: false }); toast('Kartu dinonaktifkan'); muatTab(ctx, { diam: true }); } catch (e) { toast(e.message); }
  }, 'Yakin?');
  if (a === 'buat-alat') {
    if (!v('alatNama')) throw new Error('Isi nama alat');
    const j = await srv.rpc('buat_alat', { p_nama: v('alatNama'), p_titik: v('alatTitik') || 'gerbang' });
    document.getElementById('alatNama').value = '';
    tampilKunci(ctx, st, j, 'Alat dibuat');
    return muatTab(ctx, { diam: true });
  }
  if (a === 'ganti-kunci') return konfirmasiDuaKetuk(b, async () => {
    try { const j = await srv.rpc('ganti_kunci_alat', { p_alat: b.dataset.alat }); tampilKunci(ctx, st, j, 'Kunci baru'); } catch (e) { toast(e.message); }
  }, 'Kunci lama tidak berlaku. Yakin?');
  if (a === 'alat-aktif') { await srv.ubah('alat', { id: 'eq.' + b.dataset.alat }, { aktif: b.dataset.nilai === '1' }); return muatTab(ctx, { diam: true }); }
  if (a === 'simpan-jadwal') {
    const ada = [], tidak = [];
    for (let h = 1; h <= 7; h++) {
      if (document.getElementById('jdAda' + h).checked) ada.push({ sekolah_id: st.profil.sekolah_id, hari: h, jam_masuk: v('jdMasuk' + h), toleransi_menit: Number(v('jdTol' + h)) || 0, jam_pulang: v('jdPulang' + h) });
      else tidak.push(h);
    }
    if (ada.some(x => x.jam_pulang <= x.jam_masuk)) throw new Error('Jam pulang harus setelah jam masuk');
    if (ada.length) await srv.tambah('jadwal', ada, { gabung: true });
    if (tidak.length) await srv.hapus('jadwal', { hari: `in.(${tidak.join(',')})` });
    toast('Jadwal disimpan'); return muatTab(ctx, { diam: true });
  }
  if (a === 'tambah-libur') {
    if (!v('liburTgl') || !v('liburKet')) throw new Error('Isi tanggal dan keterangan');
    await srv.tambah('kalender_libur', [{ sekolah_id: st.profil.sekolah_id, tanggal: v('liburTgl'), keterangan: v('liburKet') }], { gabung: true });
    document.getElementById('liburKet').value = '';
    return muatTab(ctx, { diam: true });
  }
  if (a === 'hapus-libur') { await srv.hapus('kalender_libur', { tanggal: 'eq.' + b.dataset.tgl }); return muatTab(ctx, { diam: true }); }
  if (a === 'isi-lokal') {
    const r = ctx.store.data.rombel.find(x => x.id === v('skLokal'));
    if (r) { document.getElementById('skSiswa').value = r.siswa.filter(s => s.aktif).map(s => s.nama).join('\n'); if (!v('skNama')) document.getElementById('skNama').value = r.nama.replace(/\s*\(contoh\)/, ''); }
    return;
  }
  if (a === 'simpan-kelas') {
    const baris = v('skSiswa').split('\n').map(x => x.trim()).filter(Boolean).map(x => { const [n, p] = x.split('|').map(y => y.trim()); return { nama: n.slice(0, 80), panggilan: (p || n.split(/\s+/)[0]).slice(0, 20) }; });
    let rombelId = v('skKelas');
    if (!rombelId) {
      if (!v('skNama')) throw new Error('Isi nama kelas baru');
      if (!/^\d{4}\/\d{4}$/.test(v('skTahun'))) throw new Error('Tahun ajaran seperti 2026/2027');
      const r = await srv.tambah('rombel', [{ sekolah_id: st.profil.sekolah_id, nama: v('skNama'), tingkat: Number(v('skTingkat')) || null, tahun_ajaran: v('skTahun') }]);
      rombelId = r[0].id;
    }
    if (baris.length) {
      const ada = await srv.daftar('siswa', 'no_absen', { rombel_id: 'eq.' + rombelId, order: 'no_absen.desc', limit: 1 });
      const mulai = (ada[0]?.no_absen || 0) + 1;
      if (mulai + baris.length - 1 > 99) throw new Error('Satu kelas maksimal 99 siswa');
      await srv.tambah('siswa', baris.map((s, i) => ({ sekolah_id: st.profil.sekolah_id, rombel_id: rombelId, no_absen: mulai + i, ...s })));
    }
    document.getElementById('skSiswa').value = ''; document.getElementById('skNama').value = '';
    toast(`Tersimpan: ${baris.length} siswa`); st.profil = null; return muatTab(ctx);
  }
  if (a === 'undang-guru') {
    if (!v('ugEmail') || !v('ugNama')) throw new Error('Isi email dan nama');
    await srv.rpc('undang_pengguna', { p_email: v('ugEmail'), p_nama: v('ugNama'), p_peran: v('ugPeran') || 'guru', p_piket: document.getElementById('ugPiket').checked });
    ['ugEmail', 'ugNama'].forEach(id => { document.getElementById(id).value = ''; });
    toast('Guru ditambahkan'); return muatTab(ctx, { diam: true });
  }
  if (a === 'uid-acak') { document.getElementById('simUid').value = [...crypto.getRandomValues(new Uint8Array(4))].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase(); return; }
  if (a === 'sim-tap') {
    st.sim.kunci = v('simKunci'); st.sim.alat = v('simAlat') || st.sim.alat;
    if (!st.sim.alat || !/^[0-9a-fA-F]{64}$/.test(st.sim.kunci)) throw new Error('Pilih alat dan isi kuncinya (64 karakter)');
    const offline = st.sim.offline = document.getElementById('simOffline').checked;
    const waktu = offline ? detikDariLokal(v('simWaktu')) : Math.floor(Date.now() / 1000);
    st.isi.sim = await srv.rpc('catat_tap', await tapBertanda({ alat: st.sim.alat, kunciHex: st.sim.kunci, uid: v('simUid'), waktu, offline }), { anon: true });
    ctx.render();
  }
}


// Halaman Kelas & Siswa: daftar rombel, daftar siswa (urutan = nomor absen), dan foto siswa berizin.
import { esc, toast, konfirmasiDuaKetuk } from '../util.js';
import { bacaDaftarSiswa } from '../core/impor.js';
import { cocokkanNama } from '../core/nama.js';
import { kecilkanFoto } from '../gambar.js';
import { avatar } from './bersama.js';

export function render(el, ctx) {
  const { store, foto } = ctx;
  const d = store.data, r = store.rombel();
  const siswa = store.siswaAktif();
  el.innerHTML = `
  <div class="cols">
    <div class="card clay">
      <h3>Daftar kelas</h3>
      ${d.rombel.length ? `<ul class="daftar">${d.rombel.map(x => `<li class="row" style="justify-content:space-between">
          <span><b>${esc(x.nama)}</b> <span class="muted kecil">${x.siswa.filter(s => s.aktif).length} siswa · ${d.kuis.filter(k => k.rombelId === x.id).length} kuis</span></span>
          <span class="row">${x.id === d.aktif.rombelId ? '<span class="pill mint">Aktif</span>' : `<button class="btn kecil" data-aksi="pilih" data-id="${esc(x.id)}">Pilih</button>`}
          <button class="btn kecil polos bahaya" data-aksi="hapus-rombel" data-id="${esc(x.id)}">Hapus</button></span></li>`).join('')}</ul>` : '<p class="muted">Belum ada kelas.</p>'}
      <div class="row" style="align-items:flex-end">
        <label style="flex:1;min-width:160px">Nama kelas baru <input id="namaRombel" data-sementara placeholder="mis. VIII-B" maxlength="40"></label>
        <button class="btn utama" data-aksi="tambah-rombel">Tambah kelas</button>
      </div>
    </div>
    ${r ? `<div class="card clay">
      <div class="head"><div><h3>Siswa ${esc(r.nama)}</h3><p>Satu nama per baris. Urutan baris = nomor absen di lembar jawaban.</p></div></div>
      <textarea id="daftarSiswa" style="min-height:220px" aria-label="Daftar siswa">${esc(siswa.map(s => s.nama).join('\n'))}</textarea>
      <div class="row">
        <button class="btn utama" data-aksi="simpan-siswa">Simpan daftar</button>
        <span class="btn file kecil">Impor CSV/TXT<input type="file" id="fileSiswa" accept=".csv,.txt,.tsv,text/plain,text/csv" aria-label="Impor daftar siswa"></span>
      </div>
      <p class="privasi">Dari Dapodik atau Excel: salin kolom nama lalu tempel di sini, atau simpan sebagai CSV. Hanya nama yang diambil; NISN, tanggal lahir, dan alamat tidak disimpan.</p>
    </div>` : ''}
  </div>
  ${r ? `<div class="card clay">
    <div class="head"><div><h3>Foto siswa</h3><p>Membantu mengenali siswa saat penilaian praktik atau presentasi. Ketuk nama siswa di tabel jawaban untuk melihat fotonya besar.</p></div></div>
    <label class="cek"><input type="checkbox" id="fotoIzin" ${d.fotoIzin ? 'checked' : ''}><span>Sekolah sudah mendapat izin orang tua/wali untuk memakai foto siswa di aplikasi ini.</span></label>
    ${d.fotoIzin ? `<div class="row">
        <span class="btn file kecil">Unggah banyak foto<input type="file" id="fotoBanyak" accept="image/*" multiple aria-label="Unggah banyak foto"></span>
        <span class="muted kecil">Nama file = nama siswa, mis. Adit.jpg</span>
        <button class="btn kecil polos bahaya" data-aksi="hapus-semua-foto">Hapus semua foto</button></div>
      <div class="gallery">${siswa.length ? siswa.map((s, i) => `<div class="tile">${avatar(s, ctx)}<b>${esc(s.nama)}</b><span class="muted" style="font-size:.75rem">No. ${i + 1}</span>
        <div class="row" style="justify-content:center;gap:4px"><span class="btn file kecil">${foto.url[s.id] ? 'Ganti' : 'Ambil foto'}<input type="file" accept="image/*" capture="environment" data-foto="${esc(s.id)}" aria-label="Foto ${esc(s.nama)}"></span>
        ${foto.url[s.id] ? `<button class="btn kecil polos" data-aksi="hapus-foto" data-id="${esc(s.id)}">Hapus</button>` : ''}</div></div>`).join('') : '<p class="muted">Simpan daftar siswa dulu.</p>'}</div>` : ''}
    <p class="privasi">Foto dipotong persegi 200×200 piksel dan hanya disimpan di perangkat ini. Foto tidak ikut ekspor CSV, tidak dikirim ke server mana pun, dan tidak dipakai untuk pengenalan wajah otomatis.</p>
  </div>` : ''}`;
}

export function pasang(el, ctx) {
  const { store, foto } = ctx;
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-aksi]'); if (!b) return;
    const id = b.dataset.id;
    switch (b.dataset.aksi) {
      case 'tambah-rombel': {
        const n = el.querySelector('#namaRombel').value.trim();
        if (!n) { toast('Isi nama kelas dulu'); return; }
        el.querySelector('#namaRombel').value = '';
        store.tambahRombel(n); toast(`Kelas ${n} ditambahkan`); break;
      }
      case 'pilih': { const ks = store.kuisRombel(id); store.pilih(id, ks[0]?.id || null); break; }
      case 'hapus-rombel': konfirmasiDuaKetuk(b, () => { store.hapusRombel(id); toast('Kelas dan kuisnya dihapus'); }, 'Hapus kelas & kuisnya?'); break;
      case 'simpan-siswa': {
        const nama = el.querySelector('#daftarSiswa').value.split('\n').map(x => x.trim()).filter(Boolean);
        store.aturSiswa(store.data.aktif.rombelId, nama); toast(`${nama.length} siswa disimpan`); break;
      }
      case 'hapus-foto': foto.hapus(id).then(() => ctx.render()); break;
      case 'hapus-semua-foto': konfirmasiDuaKetuk(b, async () => { await foto.hapusSemua(); toast('Semua foto dihapus dari perangkat ini'); ctx.render(); }, 'Yakin hapus semua?'); break;
    }
  });
  el.addEventListener('change', async e => {
    const t = e.target;
    if (t.id === 'fotoIzin') { store.ubah(d => { d.fotoIzin = t.checked; }); toast(t.checked ? 'Foto siswa diaktifkan' : 'Foto disembunyikan. Hapus lewat "Hapus semua foto" bila perlu.'); return; }
    if (t.id === 'fileSiswa' && t.files[0]) {
      const nama = bacaDaftarSiswa(await t.files[0].text());
      el.querySelector('#daftarSiswa').value = nama.join('\n');
      toast(`${nama.length} nama terbaca. Periksa lalu ketuk Simpan daftar.`); return;
    }
    if (t.dataset.foto && t.files[0]) {
      try { await foto.simpan(t.dataset.foto, await kecilkanFoto(t.files[0])); toast('Foto disimpan'); }
      catch { toast('Foto tidak bisa disimpan di perangkat ini'); }
      ctx.render(); return;
    }
    if (t.id === 'fotoBanyak') {
      const siswa = store.siswaAktif(); let ok = 0; const gagal = [];
      for (const f of t.files) {
        const i = cocokkanNama(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), siswa);
        if (i < 0) { gagal.push(f.name); continue; }
        try { await foto.simpan(siswa[i].id, await kecilkanFoto(f)); ok++; } catch { gagal.push(f.name); }
      }
      toast(`${ok} foto dipasang${gagal.length ? `; ${gagal.length} tidak cocok: ${gagal.slice(0, 3).join(', ')}${gagal.length > 3 ? '…' : ''}` : ''}`);
      ctx.render();
    }
  });
}

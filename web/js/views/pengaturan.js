// Halaman Pengaturan: nama guru, cadangan data, pemulihan, penghapusan, dan informasi aplikasi.
import { esc, toast, unduh, hariIni, konfirmasiDuaKetuk } from '../util.js';
import { dataKosong, dataContoh } from '../state.js';

export const VERSI_APP = '0.4.0';

export function render(el, ctx) {
  const { store } = ctx;
  const d = store.data;
  const nSiswa = d.rombel.reduce((a, r) => a + r.siswa.filter(s => s.aktif).length, 0);
  el.innerHTML = `
  <div class="cols">
    <div class="card clay">
      <h3>Profil</h3>
      <label>Nama yang ditampilkan <input id="namaGuruInput" value="${esc(d.guru.nama)}" maxlength="40" placeholder="mis. Bu Nur"></label>
      <p class="muted kecil">${d.rombel.length} kelas · ${nSiswa} siswa · ${d.kuis.length} kuis tersimpan di perangkat ini.</p>
    </div>
    <div class="card clay">
      <h3>Cadangan data</h3>
      <p class="muted kecil">Data hanya ada di perangkat ini. Unduh cadangan secara rutin, misalnya tiap akhir bulan, dan simpan di tempat aman. Cadangan tidak memuat foto siswa.</p>
      <div class="row">
        <button class="btn hijau" data-aksi="cadangkan">Unduh cadangan (.json)</button>
        <span class="btn file">Pulihkan dari cadangan<input type="file" id="filePulih" accept=".json,application/json" aria-label="Pulihkan cadangan"></span>
      </div>
    </div>
  </div>
  <div class="cols">
    <div class="card clay">
      <h3>Mulai ulang</h3>
      <p class="muted kecil">Menghapus semua kelas, siswa, dan kuis dari perangkat ini. Unduh cadangan dulu bila masih diperlukan.</p>
      <div class="row">
        <button class="btn bahaya" data-aksi="hapus-semua">Hapus semua data</button>
        <button class="btn polos" data-aksi="muat-contoh">Muat data contoh</button>
      </div>
    </div>
    <div class="card clay">
      <h3>Tentang</h3>
      <p class="kecil">Cikaracak ${VERSI_APP} (Cara Inovatif Kelola Asesmen Rutin, Analisis Cepat, Aksi Konsisten) — aplikasi open source (lisensi MIT) untuk asesmen formatif. Saran bersifat usulan; keputusan tetap di tangan guru. Bukan untuk nilai rapor.</p>
      <p class="kecil muted">Data CP: Keputusan Kepala BSKAP Kemendikdasmen Nomor 046/H/KR/2025, Lampiran II.</p>
      <p class="kecil">Kode sumber, panduan kontribusi, dan laporan masalah: lihat README di repositori GitHub proyek ini.</p>
    </div>
  </div>`;
}

export function pasang(el, ctx) {
  const { store } = ctx;
  el.addEventListener('change', async e => {
    if (e.target.id === 'namaGuruInput') store.ubah(d => { d.guru.nama = e.target.value.trim(); });
    if (e.target.id === 'filePulih' && e.target.files[0]) {
      try {
        const j = JSON.parse(await e.target.files[0].text());
        if (j.aplikasi !== 'cikaracak' || !j.data) throw new Error('Bukan file cadangan aplikasi ini');
        await store.ganti(j.data);
        toast(`Data dipulihkan: ${store.data.rombel.length} kelas, ${store.data.kuis.length} kuis`);
      } catch (err) { toast('Gagal memulihkan: ' + err.message); }
      e.target.value = '';
    }
  });
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-aksi]'); if (!b) return;
    if (b.dataset.aksi === 'cadangkan') {
      const isi = { aplikasi: 'cikaracak', versiApp: VERSI_APP, dibuat: new Date().toISOString(), data: store.data };
      unduh(`cadangan-cikaracak-${hariIni()}.json`, JSON.stringify(isi, null, 1), 'application/json');
    }
    if (b.dataset.aksi === 'hapus-semua') konfirmasiDuaKetuk(b, async () => { await store.ganti(dataKosong()); toast('Semua data dihapus'); }, 'Yakin hapus semua?');
    if (b.dataset.aksi === 'muat-contoh') konfirmasiDuaKetuk(b, async () => { await store.ganti(dataContoh()); toast('Data contoh dimuat'); }, 'Ganti data dengan contoh?');
  });
}

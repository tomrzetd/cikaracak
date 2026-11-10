// Pusat layanan: katalog modul berdasarkan kapabilitas NYATA.
// Akses server tetap ditegakkan oleh PostgreSQL/RLS, bukan oleh menu frontend.
// Modul yang belum punya backend selalu diberi label rencana dan tidak bisa dibuka.
import { esc } from '../util.js';
import { st as presensi } from './presensi.js';

const MODUL = [
  { id: 'asesmen', nama: 'Asesmen', ikon: '✎', tema: 'peach',
    deskripsi: 'CP resmi, kuis formatif, cetak dan pindai LJK, analisis serta tindak lanjut.',
    keterangan: 'Bekerja offline. Data kuis tetap di perangkat guru.', tujuan: 'kuis' },
  { id: 'hadir', nama: 'Presensi & MIFARE', ikon: '▣', tema: 'mint',
    deskripsi: 'Kartu siswa, ESP32, presensi masuk/pulang, izin dan rekap kelas.',
    keterangan: 'Perlu server sekolah dan akun berwenang.', tujuan: 'presensi' },
  { id: 'pustaka', nama: 'Perpustakaan', ikon: '▤', tema: 'sky',
    deskripsi: 'Katalog buku, eksemplar, peminjaman dan pengembalian oleh petugas.',
    keterangan: 'Demo offline dengan data fiktif: katalog, pinjam-kembali, jatuh tempo, laporan.', tujuan: 'pustaka' },
  { id: 'keuangan', nama: 'Administrasi Keuangan', ikon: '◈', tema: 'butter',
    deskripsi: 'Koperasi, tabungan siswa, dan kegiatan resmi dengan pembukuan terpisah.',
    keterangan: 'Masih rancangan. Belum ada pencatatan pembayaran.', tujuan: null },
  { id: 'keluarga', nama: 'Portal Keluarga', ikon: '♡', tema: 'lilac',
    deskripsi: 'Informasi anak, kehadiran, pengumuman dan notifikasi untuk wali terverifikasi.',
    keterangan: 'Belum ada login orang tua atau notifikasi aktif.', tujuan: null },
  { id: 'kantin', nama: 'Kantin Digital', ikon: '◉', tema: 'sky',
    deskripsi: 'Rencana pembayaran kantin menggunakan kartu siswa dengan otorisasi tambahan.',
    keterangan: 'Ditunda. Kartu RFID bukan otorisasi pembayaran.', tujuan: null },
];

function keadaan(m, profil) {
  if (m.id === 'asesmen') return { label: 'Siap • Offline', kelas: 'siap' };
  if (m.id === 'pustaka') return { label: 'Demo • Offline', kelas: 'siap' };
  if (m.id === 'hadir') return profil
    ? { label: 'Masuk ke server', kelas: 'siap' }
    : { label: 'Perlu akun sekolah', kelas: 'perlu' };
  return { label: m.id === 'kantin' ? 'Ditunda' : 'Dalam perencanaan', kelas: 'rencana' };
}

function kartu(m, profil, ringkas = false) {
  const status = keadaan(m, profil);
  return `<article class="modul-card modul-${m.tema}" data-modul="${m.id}">
    <div class="modul-atas">
      <span class="modul-ikon" aria-hidden="true">${m.ikon}</span>
      <span class="modul-status ${status.kelas}">${status.label}</span>
    </div>
    <h3>${m.nama}</h3>
    <p>${m.deskripsi}</p>
    ${ringkas ? '' : `<p class="modul-catatan">${m.keterangan}</p>`}
    ${m.tujuan
      ? `<button type="button" class="btn kecil modul-buka" data-go="${m.tujuan}">Buka ${m.id === 'asesmen' ? 'Asesmen' : m.id === 'pustaka' ? 'Demo Pustaka' : 'Presensi'} <span aria-hidden="true">→</span></button>`
      : `<span class="modul-belum" aria-label="Modul belum tersedia">Belum tersedia untuk transaksi</span>`}
    ${m.id === 'hadir' ? '<button type="button" class="btn kecil polos" data-go="dasborPublik">Pratinjau dasbor sekolah →</button>' : ''}
  </article>`;
}

/** Ringkasan modul di Beranda: jangan menggantikan statistik asesmen yang sudah ada. */
export function ringkasanModul() {
  const profil = presensi.profil;
  return `<section class="modul-beranda" aria-labelledby="judulModulBeranda">
    <div class="modul-judul">
      <div><span class="modul-eyebrow">EKOSISTEM CIKARACAK</span>
        <h2 id="judulModulBeranda">Satu sekolah, layanan yang saling terhubung</h2>
        <p class="muted kecil">Tiga layanan sudah dapat dicoba (termasuk Pustaka Demo). Modul lainnya disiapkan bertahap, tanpa mengganggu asesmen offline.</p></div>
      <button type="button" class="btn kecil" data-go="layanan">Jelajahi modul <span aria-hidden="true">→</span></button>
    </div>
    <div class="modul-grid modul-ringkas">${MODUL.slice(0, 4).map(m => kartu(m, profil, true)).join('')}</div>
  </section>`;
}

export function render(el) {
  const profil = presensi.profil;
  const statusLogin = profil
    ? `Akun sekolah: <b>${esc(profil.nama)}</b> · ${esc(profil.sekolah?.nama || 'Sekolah terhubung')}`
    : 'Belum masuk ke server sekolah. Asesmen tetap bisa digunakan secara offline.';
  const tugas = (profil?.tugas || []).map(t => t.jenis).filter(Boolean);
  el.innerHTML = `
    <div class="hero clay modul-hero">
      <div class="copy">
        <span class="pill mint" style="align-self:flex-start">CIKARACAK • ROADMAP MODULAR</span>
        <h2>Setiap langkah kecil untuk layanan sekolah yang lebih baik.</h2>
        <p>Asesmen adalah inti. Presensi, perpustakaan, administrasi dan layanan keluarga dibangun mengelilinginya — dengan satu identitas siswa dan akses yang tetap dipisahkan.</p>
        <div class="row"><button class="btn utama" data-go="kuis">Mulai asesmen</button>
          <button class="btn" data-go="presensi">Buka presensi</button></div>
      </div>
    </div>
    <div class="card clay modul-konteks">
      <h3>Lingkungan yang sedang digunakan</h3>
      <p class="kecil">${statusLogin}</p>
      ${tugas.length ? `<p class="kecil muted">Penugasan server: ${tugas.map(esc).join(', ')}</p>` : ''}
      <p class="privasi">Hak baca/tulis setiap modul diperiksa oleh server, bukan oleh pilihan tampilan. Belum ada akun keluarga atau akses data keuangan aktif.</p>
    </div>
    <div class="modul-judul">
      <div><span class="modul-eyebrow">PETA MODUL</span>
        <h2>Layanan Cikaracak</h2>
        <p class="muted kecil">Status di bawah menunjukkan apakah suatu fitur benar-benar bisa digunakan saat ini.</p></div>
    </div>
    <div class="modul-grid">${MODUL.map(m => kartu(m, profil)).join('')}</div>
    <div class="note clay">
      <h3>Perlindungan data siswa</h3>
      <p>Foto siswa masih tersimpan di perangkat guru. Integrasi foto privat dan akses orang tua akan memerlukan persetujuan, verifikasi hubungan keluarga, serta pengujian keamanan sebelum dibuka.</p>
    </div>`;
}

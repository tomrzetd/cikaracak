// Cetak LJK: lembar kosong, atau satu lembar per siswa (nama & nomor absen sudah tercetak).
import { tataLetak, renderSVG, kodeKuis } from '../core/ljk.js';
import { $, esc, toast } from '../util.js';

export function bukaCetak(ctx) {
  const { store } = ctx;
  const k = store.kuis(), r = store.rombel(), siswa = store.siswaAktif();
  let L;
  try { L = tataLetak(k.soal); } catch (e) { toast(e.message); return; }
  const isi = ctx.buka(`<div class="row" style="justify-content:space-between"><h2>Cetak lembar jawaban</h2><button class="btn kecil polos" data-tutup>Tutup</button></div>
    <p class="muted kecil">A4, hitam-putih, skala 100% (jangan "sesuaikan dengan halaman"). Kode kuis ${kodeKuis(k.id)} tercetak di lembar agar pemindai tahu lembar ini milik kuis "${esc(k.topik)}".</p>
    <label class="cek"><input type="radio" name="mode" value="siswa" checked style="width:20px;height:20px"><span><b>Satu lembar per siswa</b> — nama dan nomor absen sudah tercetak (${siswa.length} lembar). Paling aman: siswa tidak salah mengisi absen.</span></label>
    <label class="cek"><input type="radio" name="mode" value="kosong" style="width:20px;height:20px"><span><b>Lembar kosong</b> — siswa mengisi nama dan mengarsir nomor absennya sendiri.</span></label>
    <label style="width:160px">Jumlah lembar kosong <input type="number" id="ctJumlah" min="1" max="60" value="${Math.max(1, siswa.length)}"></label>
    <div class="pratinjau">${renderSVG(L, { topik: k.topik, kelas: r.nama, kode: kodeKuis(k.id), tanggal: k.tanggal, ...(siswa[0] ? { nama: siswa[0].nama, absen: 1 } : {}) })}</div>
    <div class="row"><button class="btn utama" id="ctCetak">Cetak</button><span class="muted kecil">Pratinjau: lembar pertama.</span></div>`);
  isi.querySelector('#ctCetak').onclick = () => {
    const mode = isi.querySelector('input[name=mode]:checked').value;
    const info = { topik: k.topik, kelas: r.nama, kode: kodeKuis(k.id), tanggal: k.tanggal };
    const halaman = mode === 'siswa'
      ? siswa.map((s, i) => renderSVG(L, { ...info, nama: s.nama, absen: i + 1 }))
      : Array.from({ length: Math.max(1, Math.min(60, Number(isi.querySelector('#ctJumlah').value) || 1)) }, () => renderSVG(L, info));
    if (!halaman.length) { toast('Belum ada siswa di kelas ini'); return; }
    $('#cetak').innerHTML = halaman.map(svg => `<div class="halaman">${svg}</div>`).join('');
    ctx.tutup();
    // Aplikasi Android menyediakan jembatan cetak sendiri karena WebView tidak mendukung window.print().
    if (window.AndroidJembatan?.cetak) window.AndroidJembatan.cetak(`LJK ${k.topik}`);
    else setTimeout(() => window.print(), 50);
  };
}

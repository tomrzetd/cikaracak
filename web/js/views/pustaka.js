// Perpustakaan demonstrasi (offline-only). Tidak mengakses identitas siswa/Supabase asli.
import { penyimpananIDB } from '../db.js';
import { esc, toast, unduh, konfirmasiDuaKetuk } from '../util.js';
import { uid } from '../state.js';
import { keCSV } from '../core/impor.js';
import { dataDemoPustaka, ringkasanPustaka, sedangDipinjam, pinjamBuku,
         kembalikanBuku, tambahJudul, tglLokal, tambahHari } from '../core/pustaka-demo.js';
const KUNCI='pustaka-demo-fiktif-v1';
let data=null, galat='', tab='sirkulasi', cari='';

const bukuDari = id => data.buku.find(b=>b.id===id);
const siswaDari = id => data.siswa.find(s=>s.id===id);
const namaEksemplar = id => {
  const e=data.eksemplar.find(e=>e.id===id);
  return e ? e.id+' · '+(bukuDari(e.bukuId)?.judul || 'Judul hilang') : id;
};
async function muat(ctx) {
  try {
    const tersimpan=await penyimpananIDB.ambil(KUNCI);
    data=tersimpan?.jenis==='DEMO_FIKTIF' ? tersimpan : dataDemoPustaka();
    galat='';
  } catch (e) {
    data=dataDemoPustaka(); galat='Penyimpanan browser tidak tersedia: perubahan demo hanya berlaku sampai halaman ditutup.';
  }
  ctx.render();
}
async function simpan(baru,ctx,pesan) {
  const lama=data; data=baru;
  try { await penyimpananIDB.simpan(KUNCI,data); }
  catch (e) {
    data=lama; toast('Gagal menyimpan. Periksa ruang penyimpanan browser.');
    ctx.render(); return;
  }
  toast(pesan);ctx.render();
}
function statistik(k) {
  return '<div class="pustaka-stats">'+
    [['Judul buku',k.judul],['Eksemplar',k.eksemplar],['Tersedia',k.tersedia],['Dipinjam',k.dipinjam],['Terlambat',k.terlambat]]
      .map(([n,v])=>'<div class="card clay pustaka-stat"><span>'+n+'</span><strong>'+v+'</strong></div>').join('')+
  '</div>';
}
function sirkulasi() {
  const tersedia=data.eksemplar.filter(x=>!sedangDipinjam(data,x.id));
  const peminjaman=[...data.peminjaman].sort((a,b)=>b.pinjam.localeCompare(a.pinjam)||b.id.localeCompare(a.id));
  const hariIni=tglLokal();
  return '<div class="cols">'+
    '<form class="card clay" id="puFormPinjam"><h3>Catat peminjaman</h3>'+
    '<p class="muted kecil">Simulasi scan barcode eksemplar dan kartu siswa. Tidak berhubungan dengan kartu MIFARE asli.</p>'+
    '<label>Kode eksemplar <select id="puEksemplar" required>'+tersedia.map(e=>'<option value="'+esc(e.id)+'">'+esc(namaEksemplar(e.id))+'</option>').join('')+'</select></label>'+
    '<label>Peminjam (fiktif) <select id="puSiswa" required>'+data.siswa.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.nama+' · '+x.kelas)+'</option>').join('')+'</select></label>'+
    '<label>Jatuh tempo <input id="puJatuh" type="date" required min="'+hariIni+'" value="'+tambahHari(hariIni,7)+'"></label>'+
    '<button class="btn utama" type="submit" '+(!tersedia.length?'disabled':'')+'>Catat peminjaman</button></form>'+
    '<div class="card clay"><h3>Langkah operasional TU</h3>'+
    '<p class="muted kecil">1. Temukan eksemplar dan siswa. 2. Catat pinjam. 3. Pantau jatuh tempo. 4. Terima pengembalian dan lihat laporan.</p>'+
    '<p class="muted kecil">Pustaka production nanti menggunakan kode unik per buku fisik, akun petugas dan catatan audit di server sekolah.</p>'+
    '<button class="btn kecil" type="button" data-pu-tab="katalog">Lihat katalog & stok →</button></div></div>'+
    '<div class="card clay"><div class="head"><h3>Riwayat sirkulasi</h3><button class="btn kecil" type="button" data-pu-aksi="unduh">Ekspor CSV demo</button></div>'+
    '<div class="tablebox"><table><thead><tr><th class="l">Buku / Eksemplar</th><th class="l">Siswa</th><th>Pinjam</th><th>Jatuh tempo</th><th>Status</th><th>Aksi</th></tr></thead><tbody>'+
    peminjaman.map(p=>'<tr><td class="l">'+esc(namaEksemplar(p.eksemplarId))+'</td><td class="l">'+esc(siswaDari(p.siswaId)?.nama||'—')+'</td><td>'+esc(p.pinjam)+'</td><td>'+esc(p.jatuhTempo)+'</td><td>'+
      (p.kembali ? '<span class="pill tuntas">Kembali</span>' : p.jatuhTempo<hariIni ? '<span class="pill ulang">Lewat tempo</span>' : '<span class="pill sky">Dipinjam</span>')+'</td><td>'+
      (p.kembali?'—':'<button class="btn kecil hijau" data-pu-kembali="'+esc(p.id)+'">Kembalikan</button>')+'</td></tr>').join('')+
    '</tbody></table></div></div>';
}
function katalog() {
  const c=cari.trim().toLowerCase();
  const buku=data.buku.filter(b=>!c||[b.judul,b.penulis,b.kategori,b.id].some(v=>String(v).toLowerCase().includes(c)));
  return '<div class="card clay"><div class="head"><div><h3>Katalog & inventaris</h3><p class="muted kecil">Satu judul dapat memiliki banyak eksemplar fisik, masing-masing dengan kode.</p></div>'+
    '<label class="pustaka-cari">Cari judul/penulis <input id="puCari" data-sementara placeholder="Cari buku..." value="'+esc(cari)+'"></label></div>'+
    '<div class="tablebox"><table><thead><tr><th class="l">Judul</th><th class="l">Penulis</th><th>Kategori</th><th>Eksemplar</th><th>Tersedia</th></tr></thead><tbody>'+
    buku.map(b=>{const ex=data.eksemplar.filter(e=>e.bukuId===b.id);return '<tr><td class="l"><b>'+esc(b.judul)+'</b><div class="muted kecil">'+esc(ex.map(e=>e.id).join(' · '))+'</div></td><td class="l">'+esc(b.penulis)+'</td><td>'+esc(b.kategori)+'</td><td>'+ex.length+'</td><td>'+ex.filter(e=>!sedangDipinjam(data,e.id)).length+'</td></tr>'}).join('')+
    '</tbody></table></div></div>'+
    '<form id="puFormJudul" class="card clay"><h3>Tambahkan judul demo</h3><div class="grid2">'+
    '<label>Judul buku <input id="puJudul" maxlength="140" required placeholder="Misalnya Atlas Geografi"></label>'+
    '<label>Penulis <input id="puPenulis" maxlength="90" required></label>'+
    '<label>Kategori <select id="puKategori"><option>Pelajaran</option><option>Referensi</option><option>Cerita</option><option>Umum</option></select></label></div>'+
    '<p class="muted kecil">Membuat satu eksemplar baru. Perubahan hanya tersimpan di IndexedDB browser ini.</p>'+
    '<button type="submit" class="btn utama" style="align-self:flex-start">Tambahkan buku demo</button></form>';
}
function laporan() {
  const k=ringkasanPustaka(data), hariIni=tglLokal();
  const lewat=data.peminjaman.filter(p=>!p.kembali&&p.jatuhTempo<hariIni);
  return '<div class="card clay"><h3>Ringkasan operasional pustaka</h3><p class="muted">Seluruh angka berasal dari data simulasi lokal, bukan perpustakaan sekolah.</p>'+
    '<p>Persediaan: <b>'+k.tersedia+'</b> dari <b>'+k.eksemplar+'</b> eksemplar. Peminjaman berjalan: <b>'+k.dipinjam+'</b>. Terlambat: <b>'+k.terlambat+'</b>.</p>'+
    '<button type="button" class="btn kecil" data-pu-aksi="unduh" style="align-self:flex-start">Unduh laporan CSV (demo)</button></div>'+
    '<div class="card clay"><h3>Perlu diingatkan</h3>'+
    (lewat.length?lewat.map(p=>'<div class="pustaka-terlambat"><b>'+esc(siswaDari(p.siswaId)?.nama||'—')+'</b><span>'+esc(namaEksemplar(p.eksemplarId))+'</span><span class="pill ulang">Sejak '+esc(p.jatuhTempo)+'</span></div>').join(''):'<p class="muted">Tidak ada pinjaman lewat jatuh tempo.</p>')+
    '</div>';
}
export function render(el) {
  if(!data){el.innerHTML='<div class="card clay"><p>Memuat Pustaka Demo…</p></div>';return;}
  const k=ringkasanPustaka(data);
  el.innerHTML='<div class="hero clay pustaka-hero"><div class="copy"><span class="pill peach" style="align-self:flex-start">SIMULASI LOKAL • SEMUA DATA FIKTIF</span>'+
    '<h2>Cikaracak Pustaka</h2><p>Coba alur kerja perpustakaan sekolah: katalog, barcode eksemplar, peminjaman, pengembalian, dan laporan. Tidak menggunakan data sekolah asli.</p>'+
    '<div class="row"><button type="button" class="btn utama" data-pu-tab="sirkulasi">Simulasikan peminjaman</button><button type="button" class="btn" data-pu-tab="laporan">Lihat laporan</button></div></div></div>'+
    (galat?'<p class="status err">'+esc(galat)+'</p>':'')+statistik(k)+
    '<div class="row pustaka-tabs" role="tablist" aria-label="Menu pustaka">'+
    [['sirkulasi','Sirkulasi'],['katalog','Katalog & Stok'],['laporan','Laporan']].map(([id,n])=>
    '<button type="button" class="btn kecil '+(tab===id?'hijau':'polos')+'" data-pu-tab="'+id+'" role="tab" aria-selected="'+(tab===id)+'">'+n+'</button>').join('')+
    '<button type="button" class="btn kecil polos bahaya" data-pu-aksi="reset" style="margin-left:auto">Reset data demo</button></div>'+
    (tab==='katalog'?katalog():tab==='laporan'?laporan():sirkulasi())+
    '<p class="privasi">Mode demonstrasi: tidak mengubah data Asesmen, Presensi, akun sekolah, atau kartu MIFARE. Semua transaksi ini hanyalah contoh untuk rancangan production.</p>';
}
export function pasang(el,ctx) {
  muat(ctx);
  el.addEventListener('click',async e=>{
    const pilih=e.target.closest('[data-pu-tab]');
    if(pilih){tab=pilih.dataset.puTab;ctx.render();return;}
    const kembali=e.target.closest('[data-pu-kembali]');
    if(kembali){try{await simpan(kembalikanBuku(data,kembali.dataset.puKembali),ctx,'Buku demo berhasil dikembalikan');}catch(err){toast(err.message);}return;}
    const aksi=e.target.closest('[data-pu-aksi]');
    if(!aksi)return;
    if(aksi.dataset.puAksi==='reset')konfirmasiDuaKetuk(aksi,async()=>{await simpan(dataDemoPustaka(),ctx,'Data demo dikembalikan ke awal');},'Reset simulasi?');
    if(aksi.dataset.puAksi==='unduh'){
      const baris=[['id','kode_eksemplar','judul','siswa_fiktif','tanggal_pinjam','jatuh_tempo','tanggal_kembali','status']];
      for(const p of data.peminjaman)baris.push([p.id,p.eksemplarId,bukuDari(data.eksemplar.find(e=>e.id===p.eksemplarId)?.bukuId)?.judul||'',siswaDari(p.siswaId)?.nama||'',p.pinjam,p.jatuhTempo,p.kembali||'',p.kembali?'Kembali':p.jatuhTempo<tglLokal()?'Terlambat':'Dipinjam']);
      unduh('cikaracak-pustaka-DATA-DEMO.csv','\ufeff'+keCSV(baris),'text/csv;charset=utf-8');toast('CSV simulasi diunduh');
    }
  });
  el.addEventListener('submit',async e=>{
    if(!['puFormPinjam','puFormJudul'].includes(e.target.id))return;
    e.preventDefault();
    try {
      if(e.target.id==='puFormPinjam'){
        const baru=pinjamBuku(data,{
          id:uid('P-'),eksemplarId:el.querySelector('#puEksemplar').value,siswaId:el.querySelector('#puSiswa').value,
          jatuhTempo:el.querySelector('#puJatuh').value
        });
        await simpan(baru,ctx,'Peminjaman demo berhasil dicatat');
      } else {
        const kode='EX-'+uid('').toUpperCase().slice(0,8);
        const baru=tambahJudul(data,{id:uid('b-'),judul:el.querySelector('#puJudul').value,
          penulis:el.querySelector('#puPenulis').value,kategori:el.querySelector('#puKategori').value,kodeEksemplar:kode});
        await simpan(baru,ctx,'Judul baru ditambahkan ke katalog demo');
      }
    }catch(err){toast(err.message);}
  });
  el.addEventListener('input',e=>{
    if(e.target.id!=='puCari')return;
    cari=e.target.value;ctx.render();
  });
}

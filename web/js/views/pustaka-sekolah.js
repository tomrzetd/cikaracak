// Pustaka Production P1: pendataan bibliografi + label eksemplar.
// TERPISAH dari pustaka.js yang hanya menyimpan simulasi fiktif di IndexedDB.
// Semua tulis lewat RPC Supabase dengan penugasan pustakawan & RLS server.
import * as srv from '../server/supabase.js';
import { esc, toast } from '../util.js';
import { barcodeCode39, labelBuku, kodeValid } from '../core/pustaka-label.js';
import { jpegDariGambar, ocrBuku, petunjukDariOcr, cariMetadata, normalisasiIsbn, validIsbn } from '../core/pustaka-ocr.js';

const baruDraft=()=>({judul:'',penulis:'',penerbit:'',isbn:'',sumber:'manual'});
const st={profil:null,galat:'',pesan:'',memuat:false,judul:[],eksemplar:[],draft:baruDraft(),
  saran:[],teksOcr:'',usulanOcr:null,foto:null,sedangOcr:false,mode:'daftar',kamera:null,baru:null,hasilKode:'',statusOcr:'',akses:false};
const tugasBoleh=p=>p?.peran==='admin'||(p?.tugas||[]).some(t=>t.jenis==='pustakawan');
const asal='https://github.com/tomrzetd/cikaracak/blob/hadir-uji-kartu/supabase/migrations/20261111000001_pustaka_katalog.sql';
const txt=v=>esc(String(v||''));
function pesan(e){return e?.kode==='PGRST202'||e?.status===404
  ? 'Modul katalog belum dipasang pada server sekolah. Operator database perlu menjalankan migrasi pustaka.'
  : e?.message||'Operasi gagal';}
async function muat(ctx,{profil=true}={}) {
  if(!srv.terhubung()||!srv.masukSebagai()){st.akses=false;st.profil=null;ctx.render();return;}
  st.memuat=true;st.galat='';ctx.render();
  try{
    if(profil||!st.profil) {
      const r=await srv.daftar('pengguna','id,nama,peran,sekolah_id,sekolah(nama),tugas(jenis)',{
        akun_id:'eq.'+srv.masukSebagai().id});
      st.profil=r?.[0]||null;
    }
    st.akses=tugasBoleh(st.profil);
    if(st.akses){
      st.judul=await srv.daftar('pustaka_judul','id,judul,penulis,penerbit,isbn,dibuat_at',{order:'judul',limit:'100'});
      st.eksemplar=await srv.daftar('pustaka_eksemplar','id,judul_id,kode,status,kondisi,aktif,dibuat_at',{order:'dibuat_at.desc',limit:'500'});
    }
  }catch(e){st.galat=pesan(e);}
  st.memuat=false;ctx.render();
}
function ringkasan(){
  const bebas=st.eksemplar.filter(x=>x.status==='tersedia'&&x.aktif).length;
  return '<div class="pustaka-stats">'+[['Judul',st.judul.length],['Eksemplar',st.eksemplar.length],
   ['Tersedia',bebas],['Terdaftar hari ini',st.eksemplar.filter(x=>x.dibuat_at?.slice(0,10)===new Date().toISOString().slice(0,10)).length]]
   .map(([a,b])=>'<div class="card clay pustaka-stat"><span>'+a+'</span><strong>'+b+'</strong></div>').join('')+'</div>';
}
const pilih=(id,value,placeholder='')=>'<input id="'+id+'" value="'+txt(value)+'" placeholder="'+txt(placeholder)+'" data-sementara>';
function formInput(){
 const d=st.draft;
 return '<div class="card clay"><div class="head"><div><h3>1 · Ambil foto sampul buku</h3>'+
  '<p class="muted kecil">Foto dekat dan sejajar, hindari pantulan cahaya; utamakan tulisan judul memenuhi bingkai. Tekan Baca Tulisan (OCR), lalu periksa usulan sebelum menggunakan data.</p></div>'+
  '<span class="pill sky">FOTO TETAP DI PERANGKAT</span></div>'+
  '<div class="row pustaka-ocr-actions" style="flex-wrap:wrap">'+
    '<label class="btn kecil hijau">📷 Kamera HP / pilih foto <input id="pbFoto" type="file" accept="image/*" capture="environment" hidden></label>'+
    '<label class="btn kecil">▥ Foto barcode ISBN (belakang buku) <input id="pbIsbnFoto" type="file" accept="image/*" capture="environment" hidden></label>'+
    '<button type="button" class="btn kecil" data-pb="kamera">'+(st.kamera?'Tutup webcam':'Aktifkan webcam')+'</button>'+
    (st.kamera?'<button type="button" class="btn utama" data-pb="jepret">📸 Cekrek Foto</button>':'')+
  '</div>'+
  (st.kamera?'<video id="pbVideo" autoplay muted playsinline class="pustaka-video" aria-label="Pratinjau kamera sampul buku"></video>':'')+
  (st.foto?'<div class="pustaka-ocr-preview"><img src="'+st.foto+'" alt="Hasil foto sampul yang siap dibaca OCR">'+
    '<div class="row" style="flex-wrap:wrap">'+
      '<button type="button" class="btn utama" data-pb="ocr" '+(st.sedangOcr?'disabled':'')+'>'+
      (st.sedangOcr?'⏳ Membaca tulisan…':'🔍 Baca Tulisan (OCR)')+'</button>'+
      '<button type="button" class="btn kecil" data-pb="ulang-foto" '+(st.sedangOcr?'disabled':'')+'>↻ Ulangi Foto</button>'+
    '</div></div>':
    '<p class="muted kecil">Belum ada foto. Gunakan kamera HP/pilih foto, atau aktifkan webcam lalu tekan <b>Cekrek Foto</b>.</p>')+
  (st.statusOcr?'<p id="pbOcrStatus" class="status" role="status" aria-live="polite">'+txt(st.statusOcr)+'</p>':'')+
  (st.usulanOcr?'<div class="pustaka-ocr-hasil">'+
    '<h4>Usulan hasil OCR — belum dimasukkan ke formulir</h4>'+
    '<p><b>Kualitas:</b> '+(st.usulanOcr.mutu==='baik'?'Judul cukup terbaca, tetap periksa.':st.usulanOcr.mutu==='periksa'?'Perlu pemeriksaan petugas.':'Belum yakin — jangan gunakan tanpa koreksi.')+'</p>'+
    '<p><b>Judul:</b> '+txt(st.usulanOcr.judul||'(belum dapat ditentukan dengan yakin)')+'</p>'+
    '<p><b>Penerbit:</b> '+txt(st.usulanOcr.penerbit||'(belum terdeteksi)')+'</p>'+
    '<p><b>ISBN:</b> '+txt(st.usulanOcr.isbn||'(belum terdeteksi)')+'</p>'+
    (st.usulanOcr.kandidat?.length?'<div class="pustaka-kandidat-ocr"><b>Alternatif teks yang terbaca — pilih jika cocok:</b>'+
      st.usulanOcr.kandidat.slice(0,5).map((k,i)=>'<button type="button" class="btn kecil" data-pb-kandidat="'+i+'">'+txt(k)+'</button>').join('')+'</div>':'')+
    (st.usulanOcr.judul||st.usulanOcr.penerbit||st.usulanOcr.isbn?'<button type="button" class="btn utama" data-pb="terapkan-ocr">✓ Gunakan Data Hasil OCR</button>':
      '<p class="muted kecil">Foto ulang dengan judul memenuhi sebagian besar bingkai, atau isi judul secara manual.</p>')+
  '</div>':'')+
  (st.teksOcr?'<details class="pustaka-ocr-mentah"><summary>Lihat teks lengkap yang terbaca</summary><pre>'+txt(st.teksOcr.slice(0,3500))+'</pre></details>':'')+
  '</div>'+
  '<form id="pbForm" class="card clay"><h3>2 · Periksa judul dan penerbit</h3>'+
  '<p class="muted kecil">Petugas wajib mengoreksi ejaan, cetakan dan ISBN sebelum disimpan. ISBN membantu mencegah judul ganda.</p>'+
  '<div class="grid2"><label>Judul buku * '+pilih('pbJudul',d.judul,'Judul lengkap pada sampul')+'</label>'+
  '<label>Penulis '+pilih('pbPenulis',d.penulis,'Nama penulis (opsional)')+'</label>'+
  '<label>Penerbit '+pilih('pbPenerbit',d.penerbit,'Penerbit / lembaga')+'</label>'+
  '<label>ISBN '+pilih('pbIsbn',d.isbn,'ISBN 10 atau 13 digit')+'</label></div>'+
  '<div class="row" style="flex-wrap:wrap"><button type="button" class="btn kecil" data-pb="rekomendasi">Cari rekomendasi judul & penerbit (online)</button>'+
  '<button class="btn utama" type="submit" '+(st.memuat?'disabled':'')+'>Simpan judul + 1 eksemplar</button></div>'+
  (st.saran.length?'<div class="pustaka-saran"><h4>Rekomendasi metadata — pilih setelah memeriksa sampul</h4>'+
    st.saran.map((x,i)=>'<button type="button" class="pustaka-saran-item" data-pb-saran="'+i+'">'+
      '<b>'+txt(x.judul)+'</b><small>'+txt(x.penulis)+' · '+txt(x.penerbit)+' · '+txt(x.isbn)+'</small>'+
      '<span>Pakai usulan ini</span></button>').join('')+'</div>':'')+
  '</form>';
}
function daftarBuku(){
 const copiesBy=new Map(st.judul.map(j=>[j.id,st.eksemplar.filter(e=>e.judul_id===j.id)]));
 const keywords=st.draft.cari?.toLowerCase()||'';
 const terpilih=st.judul.filter(b=>!keywords||[b.judul,b.penulis,b.penerbit,b.isbn].some(x=>String(x||'').toLowerCase().includes(keywords)));
 return '<div class="card clay"><div class="head"><div><h3>Katalog sekolah</h3><p class="muted kecil">Barcode ditempel pada sisi/punggung setiap eksemplar fisik. Dua buku dengan judul sama memiliki kode berbeda.</p></div>'+
    '<div class="row" style="flex-wrap:wrap"><button type="button" class="btn kecil" data-pb="muat">Muat ulang</button>'+
    '<button type="button" class="btn kecil hijau" data-pb="cetak-batch">Cetak label unik (maks 24)</button></div></div>'+
    '<label>Cari buku <input id="pbCari" data-sementara placeholder="Judul, penerbit, ISBN" value="'+txt(st.draft.cari||'')+'"></label>'+
    (terpilih.length?'<div class="tablebox"><table><thead><tr><th class="l">Judul</th><th class="l">Penerbit / ISBN</th><th>Eksemplar</th><th>Aksi</th></tr></thead><tbody>'+
    terpilih.map(b=>{const copies=copiesBy.get(b.id)||[];
    return '<tr><td class="l"><b>'+txt(b.judul)+'</b><div class="kecil muted">'+txt(b.penulis)+'</div></td>'+
      '<td class="l">'+txt(b.penerbit)+'<div class="kecil muted">'+txt(b.isbn)+'</div></td>'+
      '<td>'+copies.length+'<div class="kecil muted">'+copies.map(x=>txt(x.kode)).join(', ')+'</div></td>'+
      '<td><div class="row" style="flex-wrap:wrap"><button type="button" class="btn kecil hijau" data-pb-copy="'+txt(b.id)+'">+ Eksemplar</button>'+
      (copies.length?'<button type="button" class="btn kecil" data-pb-print="'+txt(copies[0].kode)+'">Cetak label</button>':'')+'</div></td></tr>';}).join('')+
    '</tbody></table></div>':'<p class="muted">Belum ada buku yang cocok dalam daftar 100 judul terbaru. Cari dari hasil scan label jika sudah memiliki kode.</p>')+'</div>';
}
function panelLabel(){
 const last=st.baru;
 return '<div class="card clay"><h3>Label inventaris</h3>'+
  '<p class="muted kecil">Satu kode unik untuk setiap buku fisik. Barcode Code 39 dapat dicetak pada kertas label A4 dan dipindai ulang ketika buku dipinjam atau dikembalikan.</p>'+
  (last?'<div class="pustaka-label-preview">'+labelBuku({kode:last.kode,judul:last.judul,sekolah:st.profil?.sekolah?.nama})+'</div>'+
   '<button type="button" class="btn hijau kecil" data-pb-print="'+txt(last.kode)+'">Cetak barcode eksemplar '+txt(last.kode)+'</button>':
   '<p class="muted kecil">Simpan sebuah eksemplar atau pilih label dari katalog untuk melihat pratinjau.</p>')+
  '</div>';
}
function pembacaLabel(){
 const p=st.hasilKode?st.eksemplar.find(x=>x.kode===st.hasilKode):null;
 const buku=p&&st.judul.find(x=>x.id===p.judul_id);
 return '<div class="card clay"><h3>3 · Deteksi kembali buku dari label</h3>'+
  '<p class="muted kecil">Pindai label ditempel atau ketik kode. Kode hanya identitas buku fisik, bukan kartu siswa atau QR transaksi uang.</p>'+
  '<div class="row" style="flex-wrap:wrap"><label class="btn kecil">📷 Foto label <input id="pbScanFile" type="file" accept="image/*" capture="environment" hidden></label>'+
  '<button type="button" class="btn kecil" data-pb="scan-video">Baca label dari webcam</button></div>'+
  '<div class="row"><label style="flex:1">Kode inventaris <input id="pbKode" value="'+txt(st.hasilKode)+'" placeholder="CKR..." autocomplete="off"></label>'+
    '<button type="button" class="btn kecil hijau" data-pb="cari-kode">Cari buku</button></div>'+
  (p?'<div class="note clay"><b>'+txt(buku?.judul||'Buku')+'</b><p>Kode: '+txt(p.kode)+' · Status: '+txt(p.status)+'</p>'+
    '<button class="btn kecil" data-pb-print="'+txt(p.kode)+'">Cetak ulang label</button></div>':
    st.hasilKode?'<p class="muted">Kode belum ada di 500 eksemplar yang dimuat. Gunakan Muat ulang atau cek kembali kode.</p>':'')+
  '</div>';
}
function butuhMasuk(){
 return '<div class="hero clay"><div class="copy"><h2>Katalog perpustakaan sekolah</h2>'+
  '<p>Modul production menyimpan data judul, penerbit dan kode eksemplar pada Supabase. Masuk menggunakan akun sekolah dengan penugasan Pustakawan atau Operator.</p>'+
  '<div class="row"><button type="button" class="btn utama" data-go="presensi">Sambungkan / masuk melalui Presensi</button>'+
  '<button class="btn" data-go="pustaka">Coba pustaka fiktif</button></div></div></div>';
}
export function render(el){
 if(!srv.terhubung()||!srv.masukSebagai()){el.innerHTML=butuhMasuk();return;}
 if(!st.profil&&!st.galat){el.innerHTML='<div class="card clay">Memeriksa penugasan perpustakaan…</div>';return;}
 if(!st.akses){
   el.innerHTML='<div class="card clay"><h3>Hak akses Perpustakaan</h3>'+
    '<p>Hanya Operator atau TU/Guru dengan tugas pustakawan aktif yang boleh mengelola katalog sekolah.</p>'+
    (st.galat?'<p class="status err">'+txt(st.galat)+'</p>':'')+
    '<button class="btn kecil" data-pb="muat">Periksa ulang akun</button></div>';return;
 }
 el.innerHTML='<div class="hero clay pustaka-hero"><div class="copy"><span class="pill mint">KATALOG SEKOLAH · TAHAP PRODUCTION 1</span>'+
  '<h2>Terima buku lebih cepat dengan kamera dan barcode</h2>'+
  '<p>Foto sampul → OCR → periksa rekomendasi penerbit → simpan inventaris → cetak label. Data disimpan ke server sekolah oleh petugas berwenang.</p></div></div>'+
  (st.galat?'<div class="note clay"><p class="status err">'+txt(st.galat)+'</p><p class="kecil">Jika migrasi belum dipasang: <a href="'+asal+'" target="_blank" rel="noopener noreferrer">SQL katalog Pustaka P1</a>. Jangan menjalankan SQL lewat browser publik.</p></div>':'')+
  (st.pesan?'<div class="note clay">'+txt(st.pesan)+'</div>':'')+
  ringkasan()+formInput()+panelLabel()+pembacaLabel()+daftarBuku()+
  '<div class="note clay"><b>Batas fase ini:</b> data yang disimpan hanya judul, penerbit, penulis, ISBN dan kode eksemplar. Transaksi peminjaman siswa, rekap keterlambatan serta sinkronisasi offline masih harus melalui fase sirkulasi berikutnya.</div>';
 if(st.kamera){
   const video=el.querySelector('#pbVideo');
   if(video&&video.srcObject!==st.kamera){video.srcObject=st.kamera;video.play().catch(()=>{});}
 }
}
// Router Cikaracak mempertahankan nilai input saat render ulang. Sinkronkan DOM
// secara eksplisit setelah operator memilih saran OCR supaya nilai lama tidak
// dikembalikan di atas draft baru oleh mekanisme preservasi input global.
function selaraskanForm(el){
 const fields={pbJudul:'judul',pbPenulis:'penulis',pbPenerbit:'penerbit',pbIsbn:'isbn'};
 for(const [id,k] of Object.entries(fields)){
   const input=el.querySelector('#'+id);
   if(input) input.value=st.draft[k]||'';
 }
}
function hentikanKamera(){
 if(st.kamera){st.kamera.getTracks().forEach(t=>t.stop());st.kamera=null;}
}
async function siapFoto(file,ctx){
 if(!file)return;
 st.foto=null;st.usulanOcr=null;st.teksOcr='';st.statusOcr='Menyiapkan foto…';
 ctx.render();
 try {
   st.foto=await jpegDariGambar(file);
   st.statusOcr='Foto berhasil diambil. Tekan "Baca Tulisan (OCR)" untuk mengenali judul buku.';
 }catch(e){st.statusOcr='Foto tidak dapat dibaca: '+pesan(e);}
 ctx.render();
}
async function prosesOcr(ctx){
 if(!st.foto){toast('Ambil foto sampul dulu');return;}
 if(st.sedangOcr)return;
 st.sedangOcr=true;
 st.usulanOcr=null;
 st.statusOcr='Mengenali tulisan pada sampul…';
 ctx.render();
 const kemajuan=(keterangan)=>{
   st.statusOcr=keterangan;
   const status=document.getElementById('pbOcrStatus');
   if(status)status.textContent=keterangan;
 };
 try{
   const teks=await ocrBuku(st.foto,kemajuan);
   st.teksOcr=teks;
   if(!teks.trim())throw new Error('Tidak ada tulisan yang terbaca. Coba foto tanpa bayangan atau mendekatkan buku.');
   const usulan=petunjukDariOcr(teks);
   st.usulanOcr=usulan;
   st.statusOcr='OCR selesai. Klik "Gunakan Data Hasil OCR" untuk memindahkan usulan ke formulir.';
 }catch(e){
   st.statusOcr='OCR belum berhasil: '+pesan(e)+' Anda tetap bisa mengisi formulir secara manual atau mencoba foto lain.';
 }finally{
   st.sedangOcr=false;
   ctx.render();
 }
}
async function barcodeFoto(file,ctx){
 if(!file)return;
 try {
   const data=await jpegDariGambar(file,1200);
   let kode='';
   if(window.AndroidJembatan?.pindaiKodeBuku){
     kode=await new Promise((resolve,reject)=>{
       const id='bar-'+Date.now()+'-'+Math.random().toString(36).slice(2);
       const limit=setTimeout(()=>{window.removeEventListener('cikaracak:barcode',h);reject(new Error('Pemindaian terlalu lama'))},30000);
       const h=e=>{if(e.detail?.id!==id)return;clearTimeout(limit);window.removeEventListener('cikaracak:barcode',h);
         e.detail?.error?reject(new Error(e.detail.error)):resolve(e.detail?.text||'');};
       window.addEventListener('cikaracak:barcode',h);
       try{window.AndroidJembatan.pindaiKodeBuku(id,data.split(',')[1]);}catch(e){clearTimeout(limit);window.removeEventListener('cikaracak:barcode',h);reject(e);}
     });
   }else if('BarcodeDetector' in window){
     const bitmap=await createImageBitmap(file);
     try{const det=new BarcodeDetector({formats:['code_39','qr_code','ean_13']});
       kode=(await det.detect(bitmap))?.[0]?.rawValue||'';}finally{bitmap.close();}
   }else throw new Error('Browser ini belum mendukung pembaca barcode kamera. Gunakan Android atau ketik kode secara manual');
   if(kodeValid(kode)){st.hasilKode=kode;toast('Barcode buku ditemukan');}
   else if(validIsbn(kode)){st.draft.isbn=normalisasiIsbn(kode);selaraskanForm(document.getElementById('v-pustakaSekolah'));toast('ISBN terdeteksi; klik Cari rekomendasi judul & penerbit');}
   else throw new Error('Barcode tidak dikenali sebagai kode Cikaracak atau ISBN');
 }catch(e){toast(pesan(e));}
 ctx.render();
}
function cetakLabel(kode){
 const x=st.eksemplar.find(e=>e.kode===kode);
 const b=x&&st.judul.find(v=>v.id===x.judul_id);
 const item=b||(st.baru?.kode===kode?st.baru:null);
 if(!item||!kodeValid(kode))throw new Error('Label belum terdaftar');
 const area=document.getElementById('cetak');
 if(!area)throw new Error('Area cetak tidak ada');
 area.innerHTML='<div class="pustaka-kertas-label">'+labelBuku({
   kode,judul:item.judul,sekolah:st.profil?.sekolah?.nama||'Cikaracak Pustaka'
 })+'</div>';
 if(window.AndroidJembatan?.cetak)window.AndroidJembatan.cetak('Label buku '+kode);
 else window.print();
}
export function pasang(el,ctx){
 el.addEventListener('input',e=>{
   const t=e.target;
   const map={pbJudul:'judul',pbPenulis:'penulis',pbPenerbit:'penerbit',pbIsbn:'isbn',pbCari:'cari'};
   if(map[t.id])st.draft[map[t.id]]=t.value;
 });
 el.addEventListener('change',async e=>{
   if(e.target.id==='pbFoto'){const foto=e.target.files?.[0];e.target.value='';hentikanKamera();await siapFoto(foto,ctx);}
   if(e.target.id==='pbScanFile'){await barcodeFoto(e.target.files?.[0],ctx);e.target.value='';}
   if(e.target.id==='pbIsbnFoto'){await barcodeFoto(e.target.files?.[0],ctx);e.target.value='';}
 });
 el.addEventListener('submit',async e=>{
   if(e.target.id!=='pbForm')return;
   e.preventDefault();
   if(st.memuat)return;
   const d={...st.draft};d.judul=d.judul.trim();d.penulis=d.penulis.trim();d.penerbit=d.penerbit.trim();
   d.isbn=normalisasiIsbn(d.isbn);
   if(d.judul.length<2){toast('Judul wajib diisi minimal 2 karakter');return;}
   if(d.isbn&&!validIsbn(d.isbn)){toast('Checksum ISBN tidak valid; periksa angka pada buku');return;}
   st.memuat=true;st.galat='';ctx.render();
   try{
     const j=await srv.rpc('pustaka_terima_buku',{p_judul:d.judul,p_penulis:d.penulis,
       p_penerbit:d.penerbit,p_isbn:d.isbn||null,p_sumber:d.sumber||'manual'});
     st.baru={kode:j.kode,judul:d.judul};st.draft=baruDraft();st.saran=[];st.teksOcr='';st.usulanOcr=null;st.foto=null;st.statusOcr='';
     selaraskanForm(el);
     st.pesan='Buku tercatat. '+(j.judul_baru?'Judul baru dan satu eksemplar dibuat.':'ISBN sudah ada; satu eksemplar baru ditambahkan tanpa mengubah metadata sebelumnya.')+
       ' Cetak barcode dan tempel pada buku fisik.';
     await muat(ctx,{profil:false});
   }catch(err){st.galat=pesan(err);}
   st.memuat=false;ctx.render();
 });
 el.addEventListener('click',async e=>{
   const m=e.target.closest('[data-pb-saran]');
   if(m){const a=st.saran[Number(m.dataset.pbSaran)];if(!a)return;
     st.draft={...st.draft,...a,sumber:'openlibrary'};
     selaraskanForm(el);ctx.render();return;}
   const kandidat=e.target.closest('[data-pb-kandidat]');
   if(kandidat){
     const pilihan=st.usulanOcr?.kandidat?.[Number(kandidat.dataset.pbKandidat)];
     if(!pilihan)return;
     st.usulanOcr={...st.usulanOcr,judul:pilihan,mutu:'periksa'};
     st.statusOcr='Judul dipilih dari hasil OCR. Bandingkan dengan sampul sebelum digunakan.';
     ctx.render();return;
   }
   const copy=e.target.closest('[data-pb-copy]');
   if(copy){
     try{
       const r=await srv.rpc('pustaka_tambah_eksemplar',{p_judul:copy.dataset.pbCopy});
       const item=st.judul.find(x=>x.id===copy.dataset.pbCopy);
       st.baru={kode:r.kode,judul:item?.judul||''};
       await muat(ctx,{profil:false});toast('Eksemplar baru tersimpan; cetak label fisik');
     }catch(err){st.galat=pesan(err);ctx.render();}
     return;
   }
   const print=e.target.closest('[data-pb-print]');
   if(print){try{cetakLabel(print.dataset.pbPrint);}catch(err){toast(err.message);}return;}
   const b=e.target.closest('[data-pb]');
   if(!b)return;
   try{
     switch(b.dataset.pb){
       case 'ocr': await prosesOcr(ctx);break;
       case 'terapkan-ocr':{
         const h=st.usulanOcr;
         if(!h){toast('Belum ada hasil OCR. Tekan Baca Tulisan dulu.');break;}
         st.draft={...st.draft,
           judul:h.judul||st.draft.judul,
           penerbit:h.penerbit||st.draft.penerbit,
           isbn:h.isbn||st.draft.isbn,
           sumber:'ocr'};
         st.statusOcr='Data OCR sudah dipindahkan. Periksa kembali judul dan penerbit sebelum menyimpan.';
         selaraskanForm(el);
         ctx.render();
         document.getElementById('pbJudul')?.focus();
         break;
       }
       case 'ulang-foto':
         st.foto=null;st.usulanOcr=null;st.teksOcr='';st.statusOcr='';
         ctx.render();break;
       case 'cetak-batch':{
         const labels=st.eksemplar.filter(x=>x.aktif).slice(0,24).map(x=>{
           const book=st.judul.find(b=>b.id===x.judul_id);
           return book&&kodeValid(x.kode)?labelBuku({kode:x.kode,judul:book.judul,sekolah:st.profil?.sekolah?.nama}):'';
         }).filter(Boolean);
         if(!labels.length)throw new Error('Belum ada label untuk dicetak');
         document.getElementById('cetak').innerHTML='<div class="pustaka-kertas-label">'+labels.join('')+'</div>';
         window.AndroidJembatan?.cetak?window.AndroidJembatan.cetak('Label inventaris Cikaracak'):window.print();
         break;
       }
       case 'muat': await muat(ctx);break;
       case 'kamera':
         if(st.kamera){hentikanKamera();ctx.render();break;}
         if(window.AndroidJembatan){toast('Gunakan tombol Kamera / pilih foto pada Android');break;}
         if(!navigator.mediaDevices?.getUserMedia)throw new Error('Webcam membutuhkan HTTPS dan izin kamera');
         st.kamera=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
         ctx.render();break;
       case 'jepret':{
         const video=el.querySelector('#pbVideo');
         if(!video?.videoWidth)throw new Error('Kamera belum siap');
         const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
         canvas.getContext('2d').drawImage(video,0,0);
         const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.86));
         hentikanKamera();await siapFoto(new File([blob],'sampul.jpg',{type:'image/jpeg'}),ctx);break;
       }
       case 'rekomendasi':
         if(st.memuat)return;st.statusOcr='Mencari metadata publik…';ctx.render();
         try{st.saran=await cariMetadata(st.draft);st.statusOcr=st.saran.length?'Pilih rekomendasi yang cocok dengan buku fisik.':'Tidak ditemukan metadata; isi manual.';}
         catch(err){st.statusOcr='Pencarian metadata tidak tersedia: '+pesan(err);}
         ctx.render();break;
       case 'cari-kode':{
         const value=el.querySelector('#pbKode')?.value.trim().toUpperCase();
         st.hasilKode=kodeValid(value)?value:'';
         if(!st.hasilKode)toast('Kode label harus diawali CKR dan 12 karakter heksadesimal');
         ctx.render();break;
       }
       case 'scan-video':{
         if(!('BarcodeDetector' in window))throw new Error('Webcam barcode memerlukan BarcodeDetector; pakai Foto label atau ketik kode.');
         if(!navigator.mediaDevices?.getUserMedia)throw new Error('Browser tidak memberi akses kamera');
         const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});
         try{
           const video=document.createElement('video');video.playsInline=true;video.muted=true;video.srcObject=stream;
           await video.play();
           await new Promise(resolve=>setTimeout(resolve,700));
           const det=new BarcodeDetector({formats:['code_39','qr_code','ean_13']});
           const list=await det.detect(video);
           if(!list.length)throw new Error('Label belum terbaca; dekatkan kamera atau gunakan foto');
           const hasil=list[0].rawValue;
           if(kodeValid(hasil))st.hasilKode=hasil;
           else if(validIsbn(hasil))st.draft.isbn=normalisasiIsbn(hasil);
           else throw new Error('Kode bukan label inventaris CKR/ISBN');
         }finally{stream.getTracks().forEach(t=>t.stop());}
         ctx.render();break;
       }
     }
   }catch(err){toast(pesan(err));}
 });
 // Jika pengguna meninggalkan halaman, tutup stream kamera agar tidak menyala diam-diam.
 window.addEventListener('hashchange',()=>{if(location.hash.slice(1)!=='pustakaSekolah')hentikanKamera();});
}

/** Dipanggil setiap kali halaman katalog dibuka agar sesi login/penugasan terbaru terbaca. */
export function saatBuka(ctx) { return muat(ctx); }

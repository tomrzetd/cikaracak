// Pratinjau dasbor sekolah yang dapat dibuka publik tanpa akun Supabase.
// SELURUH angka fiktif. Tidak memanggil RPC atau membaca presensi sekolah.
import { dasborFiktif } from '../core/dasbor-fiktif.js';
import { renderDasbor } from './presensi-demo.js';
let hari=14;
export function render(el) {
  const st={db:{hari,lokal:true,publik:true,kesalahan:''},
    isi:{dasbor:dasborFiktif({hari})}};
  el.innerHTML='<div class="hero clay modul-hero"><div class="copy">'+
    '<span class="pill peach" style="align-self:flex-start">DATA FIKTIF • SIMULASI</span>'+
    '<h2>Pratinjau Dasbor Sekolah</h2>'+
    '<p>Presentasi kemampuan analitik presensi Cikaracak: kehadiran harian, keterlambatan, per kelas dan jam kedatangan. Ini bukan data sekolah atau tap kartu sebenarnya.</p>'+
    '<div class="row"><button class="btn utama" data-go="presensi">Buka Presensi Sekolah</button>'+
    '<button class="btn" data-go="pustaka">Coba Perpustakaan Demo</button></div></div></div>'+renderDasbor(st);
}
export function pasang(el,ctx) {
  el.addEventListener('change',e=>{
    if(e.target.id!=='dbHari')return;
    const pilihan=Number(e.target.value);
    if(![7,14,30].includes(pilihan))return;
    hari=pilihan;ctx.render();
  });
}

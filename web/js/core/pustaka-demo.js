// Logika murni pustaka demo — semua tokoh, judul, dan transaksi bersifat FIKTIF.
// Tidak terhubung ke siswa sekolah, kartu RFID, Supabase, atau pembayaran.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const tglLokal = (d = new Date()) =>
  [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
export function tambahHari(tanggal, n) {
  if (!DATE_RE.test(tanggal)) throw new Error('Tanggal tidak sah');
  const d = new Date(tanggal + 'T12:00:00');
  if (Number.isNaN(d.getTime())) throw new Error('Tanggal tidak sah');
  d.setDate(d.getDate() + n);
  return tglLokal(d);
}
export function dataDemoPustaka(hariIni = tglLokal()) {
  const buku = [
    { id:'b01', judul:'Atlas Nusantara untuk Pelajar', penulis:'Tim Pustaka Sekolah', kategori:'Referensi' },
    { id:'b02', judul:'Cerita dari Lereng Ciremai', penulis:'Penulis Lokal (demo)', kategori:'Cerita' },
    { id:'b03', judul:'Sains di Sekitar Kita', penulis:'Tim IPA (demo)', kategori:'Sains' },
    { id:'b04', judul:'Belajar Matematika Kontekstual', penulis:'Tim Numerasi (demo)', kategori:'Pelajaran' },
    { id:'b05', judul:'Ensiklopedia Tumbuhan', penulis:'Tim Pustaka Sekolah', kategori:'Referensi' },
    { id:'b06', judul:'Panduan Literasi Digital', penulis:'Tim Literasi (demo)', kategori:'Teknologi' },
  ];
  const eksemplar = [
    ['EX-001','b01'],['EX-002','b01'],['EX-003','b02'],['EX-004','b02'],
    ['EX-005','b03'],['EX-006','b03'],['EX-007','b04'],['EX-008','b05'],['EX-009','b06']
  ].map(([id,bukuId])=>({id,bukuId}));
  const siswa = [
    { id:'d01',nama:'Adit Pratama (fiktif)',kelas:'VIII-A' },
    { id:'d02',nama:'Bella Lestari (fiktif)',kelas:'VIII-A' },
    { id:'d03',nama:'Cahya Nugraha (fiktif)',kelas:'VII-B' },
    { id:'d04',nama:'Dimas Saputra (fiktif)',kelas:'IX-A' },
    { id:'d05',nama:'Gita Maharani (fiktif)',kelas:'VIII-B' },
  ];
  const peminjaman = [
    { id:'P-001', eksemplarId:'EX-001', siswaId:'d01', pinjam:tambahHari(hariIni,-5), jatuhTempo:tambahHari(hariIni,2), kembali:null },
    { id:'P-002', eksemplarId:'EX-005', siswaId:'d02', pinjam:tambahHari(hariIni,-10), jatuhTempo:tambahHari(hariIni,-3), kembali:null }
  ];
  return { versi:1, jenis:'DEMO_FIKTIF', buku, eksemplar, siswa, peminjaman };
}
export const sedangDipinjam = (d,id) => d.peminjaman.some(p=>p.eksemplarId===id&&!p.kembali);
export function ringkasanPustaka(d,hariIni=tglLokal()) {
  const aktif=d.peminjaman.filter(p=>!p.kembali);
  return {
    judul:d.buku.length, eksemplar:d.eksemplar.length, tersedia:d.eksemplar.length-aktif.length,
    dipinjam:aktif.length, terlambat:aktif.filter(p=>p.jatuhTempo<hariIni).length,
    transaksi:d.peminjaman.length,
  };
}
export function pinjamBuku(d,{eksemplarId,siswaId,tanggal=tglLokal(),jatuhTempo=tambahHari(tanggal,7),id}) {
  if(d.jenis!=='DEMO_FIKTIF')throw new Error('Bukan data demo pustaka');
  if(!d.eksemplar.some(x=>x.id===eksemplarId))throw new Error('Kode eksemplar tidak ditemukan');
  if(!d.siswa.some(x=>x.id===siswaId))throw new Error('Peminjam tidak ada dalam data demo');
  if(sedangDipinjam(d,eksemplarId))throw new Error('Eksemplar masih dipinjam');
  if(!DATE_RE.test(tanggal)||!DATE_RE.test(jatuhTempo)||jatuhTempo<tanggal)throw new Error('Jatuh tempo harus sama atau setelah tanggal pinjam');
  if(!id||d.peminjaman.some(p=>p.id===id))throw new Error('Nomor transaksi harus unik');
  return {...d,peminjaman:[...d.peminjaman,{id,eksemplarId,siswaId,pinjam:tanggal,jatuhTempo,kembali:null}]};
}
export function kembalikanBuku(d,id,tanggal=tglLokal()) {
  const p=d.peminjaman.find(x=>x.id===id);
  if(!p||p.kembali)throw new Error('Pinjaman aktif tidak ditemukan');
  if(!DATE_RE.test(tanggal)||tanggal<p.pinjam)throw new Error('Tanggal kembali tidak sah');
  return {...d,peminjaman:d.peminjaman.map(x=>x.id===id?{...x,kembali:tanggal}:x)};
}
export function tambahJudul(d,{id,judul,penulis,kategori='Umum',kodeEksemplar}) {
  judul=String(judul||'').trim();penulis=String(penulis||'').trim();
  if(!judul||!penulis||judul.length>140||penulis.length>90)throw new Error('Judul dan penulis wajib diisi');
  if(!id||!kodeEksemplar||d.buku.some(b=>b.id===id)||d.eksemplar.some(e=>e.id===kodeEksemplar))throw new Error('Kode buku atau eksemplar sudah ada');
  return {...d,buku:[...d.buku,{id,judul,penulis,kategori}],eksemplar:[...d.eksemplar,{id:kodeEksemplar,bukuId:id}]};
}

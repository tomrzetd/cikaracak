// Data pratinjau yang DIBUAT LOKAL untuk menunjukkan kemampuan dasbor saat
// fungsi dasbor_sekolah belum diterapkan ke Supabase. BUKAN laporan presensi nyata.
const tgl = d => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const mundur = (tanggal, n) => {
  const d=new Date(tanggal+'T12:00:00');d.setDate(d.getDate()-n);return d;
};
const stat = (tanggal,n) => {
  const seed=(Number(tanggal.replace(/-/g,''))+n*37)%31;
  const terlambat=3+(seed%8);
  const izin_sakit=1+(seed%5);
  const tidak_tercatat=1+(seed%4);
  return {hadir:90-terlambat-izin_sakit-tidak_tercatat,terlambat,izin_sakit,tidak_tercatat};
};
export function dasborFiktif({hari=14,hariIni}={}) {
  const now=hariIni||tgl(new Date());
  const n=Math.min(30,Math.max(1,Number(hari)||14));
  const harian=[];
  for(let i=n-1;i>=0;i--){
    const d=mundur(now,i);
    if([0,6].includes(d.getDay()))continue;
    const tanggal=tgl(d);
    harian.push({tanggal,...stat(tanggal,i)});
  }
  const acuan=harian.at(-1)?.tanggal||null;
  const c=[
    {kelas:'VII-A (simulasi)',siswa:30},
    {kelas:'VIII-A (simulasi)',siswa:30},
    {kelas:'IX-A (simulasi)',siswa:30},
  ];
  const kelas=c.map((x,i)=>{
    const v=acuan?stat(acuan,i):{hadir:0,terlambat:0,izin_sakit:0,tidak_tercatat:30};
    const kurang=30-Math.floor(v.terlambat/3)-Math.floor(v.izin_sakit/3)-Math.floor(v.tidak_tercatat/3);
    const t=Math.floor(v.terlambat/3),s=Math.floor(v.izin_sakit/3);
    return {...x,hadir:kurang-t-s,terlambat:t,izin_sakit:s,tidak_tercatat:30-(kurang-t-s)-t-s};
  });
  const kedatangan=['06:35','06:40','06:45','06:50','06:55','07:00','07:05','07:10','07:15','07:20']
    .map((jam,i)=>({jam,jumlah:[3,5,8,13,17,19,11,7,4,2][i]}));
  return {hari_ini:now,acuan,siswa:90,kelas_jumlah:3,harian,kelas,kedatangan,jam_masuk:'07:00',toleransi:10,simulasi_lokal:true};
}

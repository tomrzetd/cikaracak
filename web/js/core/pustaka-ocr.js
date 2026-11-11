// OCR sampul pada perangkat: Android menggunakan ML Kit, PWA memakai Tesseract.js
// (pertama kali perlu internet untuk mengunduh engine+bahasa).
// Tidak pernah mengunggah foto/scan buku ke server. Lookup metadata ONLINE atas tindakan petugas.
const CDN='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
let persiapan=null;
const bersih=s=>String(s||'').replace(/\s+/g,' ').trim();
export const normalisasiIsbn=s=>String(s||'').replace(/[^0-9Xx]/g,'').toUpperCase();
export function validIsbn(s) {
  s=normalisasiIsbn(s);
  if(/^\d{13}$/.test(s))return [...s].reduce((sum,ch,i)=>sum+(i%2?3:1)*Number(ch),0)%10===0;
  if(/^\d{9}[\dX]$/.test(s)){
    const k=[...s].reduce((sum,ch,i)=>sum+(10-i)*(ch==='X'?10:Number(ch)),0);
    return k%11===0;
  }
  return false;
}
// Peringkat kandidat dari tulisan yang BENAR-BENAR dikenali OCR;
// kosakata mata pelajaran hanya meningkatkan peringkat, bukan membuat teks baru.
const KATA_BUKU = new Set([
  'pendidikan','pancasila','kewarganegaraan','ilmu','pengetahuan','alam',
  'sosial','matematika','bahasa','indonesia','inggris','sunda','informatika',
  'fisika','kimia','biologi','geografi','sejarah','ekonomi','sosiologi',
  'seni','budaya','prakarya','agama','atlas','panduan','ensiklopedia',
  'tematik','komputer','teknologi','sains','literasi','kelas','pelajaran'
]);
const BUKAN_JUDUL = /^(isbn|penerbit|publisher|penulis|pengarang|editor|disusun|cetakan|edisi|copyright|buku\s+pendamping|nama|kelas|subject|sekolah|mts|smp|sma|smk|www\.|https?:|hak cipta|kementerian|kemendikbud|dicetak|all rights|oleh\s*:)/i;
export function nilaiKandidatJudul(teks) {
  const t=bersih(teks);
  if(t.length<6 || t.length>125 || BUKAN_JUDUL.test(t))return -100;
  const words=t.match(/[A-Za-zÀ-ÿ]{2,}/g)||[];
  const huruf=(t.match(/[A-Za-zÀ-ÿ]/g)||[]).length;
  const angka=(t.match(/\d/g)||[]).length;
  if(words.length<2 || huruf/Math.max(1,t.length)<.58 || angka>huruf/3)return -50;
  let score=Math.min(22, t.length*.45)+Math.min(15,words.length*3);
  const dikenal=words.filter(w=>KATA_BUKU.has(w.toLowerCase())).length;
  score+=Math.min(55, dikenal*24);
  if(words.length>=2 && words.length<=8)score+=9;
  if(/[|{}~\\_<>=]/.test(t))score-=25;
  if(/([a-z])\1{3,}/i.test(t))score-=20;
  // Satu kalimat yang tidak memuat satu pun kata umum berisiko
  // menjadi nama pengarang/teks dekorasi pada sampul.
  if(!dikenal)score-=27;
  return Math.round(score);
}
export function petunjukDariOcr(teks) {
  const raw=String(teks||'').slice(0,30000);
  const isbn=Array.from(raw.matchAll(/(?:ISBN(?:-1[03])?[:\s]*)?((?:97[89][\s-]?)[\d\s-]{10,20}|[\dXx][\dXx\s-]{8,18})/gi))
    .map(x=>normalisasiIsbn(x[1])).find(validIsbn)||'';
  const lines=raw.split(/\r?\n/).map(bersih).filter(t=>t.length>3&&t.length<180);
  const unik=[...new Set(lines)];
  const kandidat=unik.map(teks=>({teks,skor:nilaiKandidatJudul(teks)}))
    .filter(x=>x.skor>-40).sort((a,b)=>b.skor-a.skor).slice(0,8);
  const pilihan=kandidat[0];
  const judul=pilihan && pilihan.skor>=30 ? pilihan.teks : '';
  const penerbitBaris=lines.find(t=>/\b(penerbit|publisher)\s*[:\-]/i.test(t))||'';
  const penerbit=penerbitBaris.replace(/.*?\b(penerbit|publisher)\s*[:\-]\s*/i,'').slice(0,160);
  const mutu=pilihan?.skor>=60?'baik':pilihan?.skor>=30?'periksa':'rendah';
  return {isbn,judul,penerbit,kandidat:kandidat.map(x=>x.teks),mutu,skor:pilihan?.skor||0};
}
function pasangPustakaScript(){
  if(window.Tesseract?.createWorker)return Promise.resolve();
  if(persiapan)return persiapan;
  persiapan=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    let selesai=false;
    const timer=setTimeout(()=>akhir(new Error('Memuat mesin OCR terlalu lama. Periksa sambungan internet atau pemblokir CDN.')),20000);
    const akhir=(error)=>{
      if(selesai)return;
      selesai=true;clearTimeout(timer);
      if(error){script.remove();reject(error);}
      else resolve();
    };
    script.src=CDN;
    script.crossOrigin='anonymous';
    script.onload=()=>window.Tesseract?.createWorker
      ? akhir() : akhir(new Error('Pustaka OCR gagal diinisialisasi; muat ulang dan coba lagi.'));
    script.onerror=()=>akhir(new Error('Mesin OCR tidak dapat dimuat dari CDN. Pastikan online dan tidak ada pemblokir skrip. Pengisian manual tetap tersedia.'));
    document.head.appendChild(script);
  }).catch(e=>{persiapan=null;throw e;});
  return persiapan;
}
export async function jpegDariGambar(file,maximum=2100){
  if(!file || !file.type?.startsWith('image/')) throw new Error('Pilih foto sampul dalam format gambar');
  if(file.size>18*1024*1024)throw new Error('Foto terlalu besar (maksimal 18 MB)');
  const bitmap=await createImageBitmap(file);
  try{
    const scale=Math.min(1,maximum/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d',{willReadFrequently:true}).drawImage(bitmap,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.90);
  }finally{bitmap.close();}
}
// Foto ponsel sering miring/gelap, dengan judul di bawah logo dan label nama.
// Buat varian fokus area tengah-bawah + kontras tanpa mengunggah foto ke server.
export async function siapkanVarianOcr(dataURL){
  const image=new Image(); image.src=dataURL; await image.decode();
  const buat=(focus=false)=>{
    const sw=image.naturalWidth,sh=image.naturalHeight;
    const sx=focus?Math.round(sw*.04):0, sy=focus?Math.round(sh*.24):0;
    const cw=focus?Math.round(sw*.92):sw, ch=focus?Math.round(sh*.69):sh;
    const target=focus?2000:1800;
    const scale=Math.min(2.4,target/cw);
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(cw*scale));
    canvas.height=Math.max(1,Math.round(ch*scale));
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';
    ctx.drawImage(image,sx,sy,cw,ch,0,0,canvas.width,canvas.height);
    const pix=ctx.getImageData(0,0,canvas.width,canvas.height);
    const v=pix.data;
    const hist=new Uint32Array(256);
    for(let i=0;i<v.length;i+=4){
      const g=Math.round(v[i]*.299+v[i+1]*.587+v[i+2]*.114);
      hist[g]++;
    }
    const pixels=canvas.width*canvas.height;
    const pct=(ratio)=>{
      let sum=0;
      for(let i=0;i<256;i++){sum+=hist[i];if(sum>=pixels*ratio)return i;}
      return 255;
    };
    const low=pct(.05), high=Math.max(low+25,pct(.95));
    for(let i=0;i<v.length;i+=4){
      let g=v[i]*.299+v[i+1]*.587+v[i+2]*.114;
      g=Math.max(0,Math.min(255,(g-low)*255/(high-low)));
      // Warna sampul diubah ke abu-abu agar bentuk huruf dominan.
      v[i]=v[i+1]=v[i+2]=g;
    }
    ctx.putImageData(pix,0,0);
    return canvas.toDataURL('image/jpeg',.92);
  };
  return [
    {nama:'Foto asli',foto:dataURL,psm:'11'},
    {nama:'Fokus judul (kontras)',foto:buat(true),psm:'6'},
    {nama:'Sampul kontras',foto:buat(false),psm:'11'}
  ];
}
export async function ocrBuku(dataURL,kemajuan=()=>{}){
  if(window.AndroidJembatan?.ocrBuku){
    return await new Promise((resolve,reject)=>{
      const id='ocr-'+Date.now()+'-'+Math.random().toString(36).slice(2);
      const batas=setTimeout(()=>{window.removeEventListener('cikaracak:ocr',onHasil);reject(new Error('OCR Android terlalu lama'))},60000);
      const onHasil=e=>{
        if(e.detail?.id!==id)return;
        clearTimeout(batas);window.removeEventListener('cikaracak:ocr',onHasil);
        e.detail?.error?reject(new Error(e.detail.error)):resolve(e.detail?.text||'');
      };
      window.addEventListener('cikaracak:ocr',onHasil);
      kemajuan('Memproses teks pada Android (ML Kit)…');
      try{window.AndroidJembatan.ocrBuku(id,dataURL.split(',')[1]);}
      catch(e){clearTimeout(batas);window.removeEventListener('cikaracak:ocr',onHasil);reject(e);}
    });
  }
  // Di PWA, TextDetector percobaan pertama agar cepat. Bila tidak menghasilkan
  // judul berkualitas, gunakan Tesseract dua bahasa dan beberapa area foto.
  const laporan=[];
  if(typeof window.TextDetector==='function'){
    try{
      const img=new Image();img.src=dataURL;await img.decode();
      const blocks=await new window.TextDetector().detect(img);
      const teks=blocks.map(x=>x.rawValue).join('\n');
      if(teks.trim())laporan.push(teks);
      if(petunjukDariOcr(teks).mutu==='baik')return teks;
    }catch{/* fallback OCR */}
  }
  kemajuan('Memuat model OCR Bahasa Indonesia + Inggris (pertama kali perlu internet)…');
  await pasangPustakaScript();
  let worker;
  try{
    worker=await window.Tesseract.createWorker(['ind','eng'],1,{
      logger:m=>m?.status&&kemajuan('OCR: '+m.status+' '+Math.round((m.progress||0)*100)+'%')
    });
  }catch(e){
    kemajuan('Model Indonesia belum tersedia, mencoba model Inggris…');
    worker=await window.Tesseract.createWorker('eng',1,{
      logger:m=>m?.status&&kemajuan('OCR: '+m.status+' '+Math.round((m.progress||0)*100)+'%')
    });
  }
  try{
    const varian=await siapkanVarianOcr(dataURL);
    for(let i=0;i<varian.length;i++){
      const v=varian[i];
      kemajuan('Membaca '+v.nama+' ('+(i+1)+'/'+varian.length+')…');
      if(worker.setParameters)await worker.setParameters({tessedit_pageseg_mode:v.psm,user_defined_dpi:'300'});
      const result=await worker.recognize(v.foto);
      const text=String(result?.data?.text||'').trim();
      if(text)laporan.push(text);
      // Cukup dua percobaan jika hasil judul sudah meyakinkan.
      if(i>=1 && petunjukDariOcr(laporan.join('\n')).mutu==='baik')break;
    }
    if(!laporan.length)throw new Error('Tulisan tidak dikenali. Foto ulang lebih dekat pada judul, tanpa pantulan lampu.');
    return laporan.join('\n');
  }finally{await worker.terminate();}
}
const potong=s=>bersih(s).slice(0,200);
// Open Library dipanggil HANYA atas tombol pengguna, mengirim judul/ISBN (bukan foto/siswa).
export async function cariMetadata({isbn='',judul=''}) {
  isbn=normalisasiIsbn(isbn);
  const hasil=[];
  const ambil=async url=>{
    const controller=new AbortController();
    const tm=setTimeout(()=>controller.abort(),8000);
    try{
      const r=await fetch(url,{signal:controller.signal});
      if(!r.ok)throw new Error('HTTP '+r.status);
      return await r.json();
    }finally{clearTimeout(tm);}
  };
  if(isbn&&validIsbn(isbn)) {
    try {
      const buku=await ambil('https://openlibrary.org/isbn/'+encodeURIComponent(isbn)+'.json');
      hasil.push({judul:potong(buku.title),penulis:potong((buku.by_statement||'')),penerbit:potong(buku.publishers?.[0]||''),isbn,sumber:'openlibrary'});
    }catch{/* lanjut pencarian judul bila tidak ditemukan */}
  }
  if(!hasil.length&&bersih(judul).length>=3){
    const url='https://openlibrary.org/search.json?title='+encodeURIComponent(bersih(judul).slice(0,100))+
      '&fields=title,author_name,publisher,isbn&limit=5';
    const data=await ambil(url);
    for(const x of data.docs||[]) {
      hasil.push({judul:potong(x.title),penulis:potong(x.author_name?.[0]||''),
        penerbit:potong(x.publisher?.[0]||''),isbn:(x.isbn||[]).find(validIsbn)||'',sumber:'openlibrary'});
    }
  }
  return hasil.filter(x=>x.judul).slice(0,5);
}

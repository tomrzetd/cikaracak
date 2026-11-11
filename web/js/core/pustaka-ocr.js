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
export function petunjukDariOcr(teks) {
  const raw=String(teks||'').slice(0,20000);
  const isbn=Array.from(raw.matchAll(/(?:ISBN(?:-1[03])?[:\s]*)?((?:97[89][\s-]?)[\d\s-]{10,20}|[\dXx][\dXx\s-]{8,18})/gi))
    .map(x=>normalisasiIsbn(x[1])).find(validIsbn)||'';
  const lines=raw.split(/\r?\n/).map(bersih).filter(t=>t.length>3&&t.length<180)
    .filter(t=>!/^(isbn|copyright|edisi|cetakan|www\.|http|dicetak oleh|all rights|hak cipta)\b/i.test(t));
  const kandidat=lines.filter(t=>/[A-Za-z]{3}/.test(t))
    .filter(t=>t.replace(/[^A-Za-z]/g,'').length/t.length > .4)
    .slice(0,8);
  const penerbitBaris=lines.find(t=>/\b(penerbit|publisher|press|publishing)\b/i.test(t))||'';
  const penerbit=penerbitBaris.replace(/.*?\b(penerbit|publisher)\s*[:\-]?\s*/i,'').slice(0,160);
  return {isbn,judul:kandidat[0]||'',penerbit:penerbit===penerbitBaris&&!/press|publishing/i.test(penerbitBaris)?'':penerbit,kandidat};
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
export async function jpegDariGambar(file,maximum=1400){
  if(!file || !file.type?.startsWith('image/')) throw new Error('Pilih foto sampul dalam format gambar');
  if(file.size>18*1024*1024)throw new Error('Foto terlalu besar (maksimal 18 MB)');
  const bitmap=await createImageBitmap(file);
  try{
    const scale=Math.min(1,maximum/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d',{willReadFrequently:true}).drawImage(bitmap,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.82);
  }finally{bitmap.close();}
}
export async function ocrBuku(dataURL,kemajuan=()=>{}){
  // Android native menangani OCR sepenuhnya on-device. JS bridge menerima JPEG
  // yang diperkecil dan hanya mengembalikan teks, bukan foto ke server.
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
  if(typeof window.TextDetector==='function'){
    try{
      const img=new Image();img.src=dataURL;await img.decode();
      const blocks=await new window.TextDetector().detect(img);
      if(blocks.length)return blocks.map(x=>x.rawValue).join('\n');
    }catch{/* gunakan Tesseract */}
  }
  kemajuan('Memuat OCR PWA; pertama kali memerlukan internet…');
  await pasangPustakaScript();
  const worker=await window.Tesseract.createWorker('eng',1,{
    logger:m=>m?.status&&kemajuan('OCR: '+m.status+' '+Math.round((m.progress||0)*100)+'%')
  });
  try{
    const hasil=await worker.recognize(dataURL);
    return hasil?.data?.text||'';
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

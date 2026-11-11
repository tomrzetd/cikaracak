// Barcode CODE39 untuk eksemplar fisik. Data yang dikodekan BUKAN ID siswa / NISN.
// Setiap karakter: 9 elemen bar/space (n = sempit, w = lebar), start/stop '*'.
const PAT = {
  '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn',
  '4':'nnnwwnnnw','5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw',
  '8':'wnnwnnwnn','9':'nnwwnnwnn',
  'A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn',
  'D':'nnnnwwnnw','E':'wnnnwwnnn','F':'nnwnwwnnn',
  'K':'wnnnnnnww','R':'wnnnnnwwn','*':'nwnnwnwnn'
};
export const kodeValid = code => /^CKR[0-9A-F]{12}$/.test(String(code||''));
const escapeXml = s => String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function barcodeCode39(kode) {
  if (!kodeValid(kode)) throw new Error('Kode eksemplar tidak sah');
  let x=16; const bars=[];
  for(const ch of '*'+kode+'*') {
    const p=PAT[ch];
    if(!p)throw new Error('Karakter Code39 tak tersedia: '+ch);
    for(let i=0;i<9;i++){
      const w=p[i]==='w'?3:1;
      if(i%2===0)bars.push('<rect x="'+x+'" y="4" width="'+w+'" height="64"/>');
      x+=w;
    }
    x+=1; // ruang antar karakter
  }
  const width=x+16;
  return '<svg class="pustaka-barcode" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' 92" role="img" aria-label="Barcode '+kode+'">'+
    '<rect width="'+width+'" height="92" fill="#fff"/><g fill="#000">'+bars.join('')+'</g>'+
    '<text x="'+width/2+'" y="85" font-family="monospace" font-weight="bold" font-size="12" text-anchor="middle" fill="#000">'+kode+'</text></svg>';
}
export function labelBuku({kode,judul,sekolah}) {
  if(!kodeValid(kode))throw new Error('Kode eksemplar tidak sah');
  return '<article class="label-pustaka"><strong>'+escapeXml(sekolah || 'CIKARACAK PUSTAKA')+
    '</strong><span>'+escapeXml(judul).slice(0,140)+'</span>'+barcodeCode39(kode)+'</article>';
}

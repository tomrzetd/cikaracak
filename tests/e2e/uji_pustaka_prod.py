"""Smoke Pustaka P1: autentikasi petugas, OCR dari kamera via bridge, simpan RPC,
barcode unik/cetak; backend tiruan tetap tunduk pada test RLS SQL yang terpisah."""
import io, json, os, subprocess, time
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[2]
URL="http://127.0.0.1:8791/"
GATE="https://pustaka.test"

def jalan(page):
    buku=[]
    eksemplar=[]
    kode=["CKR0123456789AB","CKR0123456789AC"]
    akun={'id':'00000000-0000-0000-0000-0000000000a1','nama':'Operator Uji',
      'peran':'admin','sekolah_id':'10000000-0000-0000-0000-000000000001',
      'sekolah':{'nama':'SMP Uji'},'tugas':[]}

    def route(r):
        req=r.request
        parsed=req.url.split('/rest/v1/')[-1]
        data=None
        if parsed.startswith('pengguna?'): data=[akun]
        elif parsed.startswith('pustaka_judul?'): data=buku
        elif parsed.startswith('pustaka_eksemplar?'): data=eksemplar
        elif parsed.startswith('rpc/pustaka_terima_buku'):
            payload=req.post_data_json
            assert payload['p_judul']
            assert payload['p_sumber']=='ocr'
            data={'judul_id':'11111111-1111-1111-1111-111111111111',
                  'eksemplar_id':'22222222-2222-2222-2222-222222222222',
                  'kode':kode[0],'judul_baru':True}
            buku.append({'id':data['judul_id'],'judul':payload['p_judul'],
               'penulis':payload['p_penulis'],'penerbit':payload['p_penerbit'],
               'isbn':payload['p_isbn'],'dibuat_at':'2026-11-11T06:00:00Z'})
            eksemplar.append({'id':data['eksemplar_id'],'judul_id':data['judul_id'],
              'kode':data['kode'],'status':'tersedia','kondisi':'baik','aktif':True,
              'dibuat_at':'2026-11-11T06:00:00Z'})
        elif parsed.startswith('rpc/pustaka_tambah_eksemplar'):
            data={'judul_id':buku[0]['id'],
              'eksemplar_id':'33333333-3333-3333-3333-333333333333','kode':kode[1]}
            eksemplar.append({'id':data['eksemplar_id'],'judul_id':data['judul_id'],
              'kode':data['kode'],'status':'tersedia','kondisi':'baik','aktif':True,
              'dibuat_at':'2026-11-11T06:01:00Z'})
        else: raise AssertionError('RPC tidak dikenal: '+parsed)
        r.fulfill(status=200,content_type="application/json",
          headers={'access-control-allow-origin':'*'},body=json.dumps(data))
    page.route(GATE+'/**',route)
    page.add_init_script("""() => {
      localStorage.setItem('cikaracak.server',JSON.stringify({url:'https://pustaka.test',anon:'sb_publishable_test'}));
      localStorage.setItem('cikaracak.sesi',JSON.stringify({akses:'eyJ.fake',segar:'fake',sampai:Date.now()+3600000,
        pengguna:{id:'00000000-0000-0000-0000-0000000000a1',email:'operator@tes.sch.id'}}));
      window.AndroidJembatan={
        ocrBuku:(id,jpeg)=>setTimeout(()=>window.dispatchEvent(new CustomEvent('cikaracak:ocr',{
          detail:{id,text:'ATLAS GEOGRAFI NUSANTARA\\nPenerbit: Uji Press\\nISBN 9780140328721'}})),20),
        pindaiKodeBuku:(id,jpeg)=>setTimeout(()=>window.dispatchEvent(new CustomEvent('cikaracak:barcode',{
          detail:{id,text:'CKR0123456789AB'}})),20),
        cetak:(judul)=>{window.__cetak=(window.__cetak||0)+1;}
      };
    }""")
    page.goto(URL+'#pustakaSekolah')
    expect(page.locator('#pbForm')).to_be_visible(timeout=12000)
    assert page.locator('#v-pustakaSekolah').is_visible()
    expect(page.locator('#pbJudul')).to_have_value('')
    f=io.BytesIO();Image.new('RGB',(160,100),'white').save(f,format='JPEG')
    page.locator('#pbFoto').set_input_files({'name':'sampul.jpg','mimeType':'image/jpeg','buffer':f.getvalue()})
    expect(page.locator('#pbJudul')).to_have_value('ATLAS GEOGRAFI NUSANTARA',timeout=12000)
    expect(page.locator('#pbPenerbit')).to_have_value('Uji Press')
    expect(page.locator('#pbIsbn')).to_have_value('9780140328721')
    page.locator('#pbForm button[type=submit]').click()
    expect(page.locator('.pustaka-label-preview')).to_contain_text('ATLAS GEOGRAFI NUSANTARA')
    assert len(buku)==1 and len(eksemplar)==1
    page.locator('[data-pb-print="CKR0123456789AB"]').first.click()
    assert page.evaluate("window.__cetak")==1
    assert page.locator('#cetak .label-pustaka').count()==1,'Cetak satu label, bukan 12 kode sama'
    page.locator('[data-pb-copy]').first.click()
    expect(page.locator('#v-pustakaSekolah .pustaka-stat').nth(1)).to_contain_text('2')
    page.locator('[data-pb=cetak-batch]').click()
    assert page.locator('#cetak .label-pustaka').count()==2
    text=page.locator('#cetak').inner_text()
    assert kode[0] in text and kode[1] in text
    page.locator('#pbScanFile').set_input_files({'name':'label.jpg','mimeType':'image/jpeg','buffer':f.getvalue()})
    expect(page.locator('#pbKode')).to_have_value(kode[0],timeout=10000)
    print('Pustaka P1 E2E: katalog, OCR Android bridge, CODE39, label unik, lookup lulus')

if __name__=='__main__':
    server=subprocess.Popen(['node',str(ROOT/'tools'/'serve.js'),'8791'],cwd=ROOT,
      stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
    time.sleep(.7)
    try:
      with sync_playwright() as p:
        browser=p.chromium.launch()
        for width in [1280,390]:
          ctx=browser.new_context(viewport={'width':width,'height':920})
          try: jalan(ctx.new_page())
          finally: ctx.close()
        browser.close()
    finally: server.terminate()

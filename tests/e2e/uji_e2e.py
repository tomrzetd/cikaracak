"""Uji ujung-ke-ujung di browser sungguhan (Chromium headless via Playwright).

Menjalankan alur guru: data contoh → saran → kelas & siswa baru → kuis baru → pilih CP →
kunci → cetak LJK → pindai foto LJK sintetis → saran → riwayat → cadangan.

Pakai:
  pip install playwright && python -m playwright install chromium
  python3 tests/e2e/uji_e2e.py            # menjalankan server sendiri di port 8765
Variabel PLAYWRIGHT_BROWSERS_PATH bisa diarahkan ke folder browser yang sudah ada.
"""
import gzip, io, json, os, subprocess, sys, time
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
PORT = 8765
URL = f'http://localhost:{PORT}/'
SHOT = Path(os.environ.get('E2E_SHOT', '/tmp/e2e-shots'))


def pgm_ke_jpg(pgm_gz, jpg):
    raw = gzip.decompress(Path(pgm_gz).read_bytes())
    parts = raw.split(b'\n', 3)
    w, h = map(int, parts[1].split())
    Image.frombytes('L', (w, h), parts[3][: w * h]).save(jpg, quality=88)


def main():
    SHOT.mkdir(parents=True, exist_ok=True)
    server = subprocess.Popen(['node', str(ROOT / 'tools' / 'serve.js'), str(PORT)], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(0.8)
    galat = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            for lebar, nama in ((1280, 'desktop'), (390, 'hp')):
                ctx = b.new_context(viewport={'width': lebar, 'height': 900}, accept_downloads=True)
                page = ctx.new_page()
                page.on('console', lambda m: m.type == 'error' and galat.append(f'console: {m.text}'))
                page.on('pageerror', lambda e: galat.append(f'pageerror: {e}'))
                jalan(page, nama)
                ctx.close()
            b.close()
    finally:
        server.terminate()
    if galat:
        print('GALAT:\n' + '\n'.join(galat)); sys.exit(1)
    print('E2E lulus. Tangkapan layar:', SHOT)


def jalan(page, nama):
    page.goto(URL)
    expect(page.locator('#pillContoh')).to_be_visible()
    expect(page.locator('#v-beranda .stat')).to_have_count(4)
    expect(page.locator('#v-beranda h2').first).to_have_text('Selamat datang di Cikaracak!')
    expect(page.locator('#v-beranda')).not_to_contain_text('Selamat mengajar, Bu Guru IPA')
    expect(page.locator('.nav[data-v=kuis]')).to_contain_text('Asesmen')
    expect(page.locator('#v-beranda .modul-card')).to_have_count(4)
    expect(page.locator('#statusAkses')).to_contain_text('Data lokal')
    # Dashboard baru harus memisahkan fitur nyata dari roadmap yang belum dapat digunakan.
    page.click('.nav[data-v=layanan]')
    expect(page.locator('#v-layanan .modul-card')).to_have_count(6)
    expect(page.locator('#v-layanan [data-modul=asesmen] .modul-buka')).to_be_visible()
    expect(page.locator('#v-layanan [data-modul=hadir] .modul-buka')).to_be_visible()
    expect(page.locator('#v-layanan [data-modul=keuangan] .modul-belum')).to_be_visible()
    expect(page.locator('#v-layanan [data-modul=keluarga] .modul-belum')).to_be_visible()
    assert page.locator('#v-layanan [data-modul=keuangan] [data-go]').count() == 0
    page.screenshot(path=SHOT / f'{nama}-0-layanan.png', full_page=True)
    page.click('#v-layanan [data-modul=asesmen] [data-go=kuis]')
    expect(page.locator('#v-kuis')).to_be_visible()
    # Pustaka Demo (offline, fiktif): katalog, pinjam-kembali, inventaris dan laporan.
    page.click('.nav[data-v=pustaka]')
    expect(page.locator('#v-pustaka')).to_contain_text('SIMULASI LOKAL')
    expect(page.locator('#v-pustaka .pustaka-stat')).to_have_count(5)
    expect(page.locator('#puEksemplar')).to_be_visible()
    page.select_option('#puEksemplar', 'EX-002')
    page.select_option('#puSiswa', 'd03')
    page.click('#puFormPinjam button[type=submit]')
    expect(page.locator('#v-pustaka .pustaka-stat').nth(3)).to_contain_text('3')
    page.locator('#v-pustaka tr', has=page.locator('td:text-is("EX-002 · Atlas Nusantara untuk Pelajar")')).locator('[data-pu-kembali]').click()
    expect(page.locator('#v-pustaka .pustaka-stat').nth(3)).to_contain_text('2')
    page.locator('.pustaka-tabs [data-pu-tab=katalog]').click()
    expect(page.locator('#v-pustaka')).to_contain_text('Atlas Nusantara')
    page.fill('#puJudul', 'Buku Demo Tambahan')
    page.fill('#puPenulis', 'Penulis Fiktif')
    page.click('#puFormJudul button[type=submit]')
    expect(page.locator('#v-pustaka')).to_contain_text('Buku Demo Tambahan')
    page.locator('.pustaka-tabs [data-pu-tab=laporan]').click()
    expect(page.locator('#v-pustaka')).to_contain_text('Perlu diingatkan')
    with page.expect_download() as dl:
        page.click('[data-pu-aksi=unduh]')
    assert 'DATA-DEMO' in dl.value.suggested_filename
    page.screenshot(path=SHOT / f'{nama}-0-pustaka-demo.png', full_page=True)
    page.reload()
    page.click('.nav[data-v=pustaka]')
    page.locator('.pustaka-tabs [data-pu-tab=katalog]').click()
    expect(page.locator('#v-pustaka')).to_contain_text('Buku Demo Tambahan')
    page.click('.nav[data-v=beranda]')
    page.screenshot(path=SHOT / f'{nama}-1-beranda.png', full_page=True)

    # Saran dari data contoh
    page.click('.nav[data-v=saran]')
    expect(page.locator('#v-saran')).to_contain_text('Mekanisme inspirasi–ekspirasi')
    expect(page.locator('#v-saran')).to_contain_text('Jajang')
    page.screenshot(path=SHOT / f'{nama}-2-saran.png', full_page=True)

    # Kelas baru + siswa
    page.click('.nav[data-v=kelas]')
    page.fill('#namaRombel', 'VII-A')
    page.click('[data-aksi=tambah-rombel]')
    expect(page.locator('#pilihRombel')).to_contain_text('VII-A')
    nama_siswa = '\n'.join(f'Siswa {i:02d}' for i in range(1, 41))
    page.fill('#daftarSiswa', nama_siswa)
    page.click('[data-aksi=simpan-siswa]')
    expect(page.locator('#v-kelas')).to_contain_text('40 siswa')
    page.check('#fotoIzin')
    expect(page.locator('.gallery .tile')).to_have_count(40)
    page.screenshot(path=SHOT / f'{nama}-3-kelas.png', full_page=True)

    # Kuis baru, pilih konsep dari CP
    page.click('.nav[data-v=kuis]')
    page.click('[data-aksi=kuis-baru]')
    page.click('[data-aksi=pilih-cp]')
    expect(page.locator('#cpMapel')).to_be_visible()
    page.select_option('#cpMapel', 'ipa')
    page.fill('#cpCari', 'organ')
    page.locator('#cpDaftar input[type=checkbox]').first.check()
    page.fill('#cpCari', 'gaya')
    page.locator('#cpDaftar input[type=checkbox]').first.check()
    page.fill('#cpN', '40')
    page.screenshot(path=SHOT / f'{nama}-4-pilih-cp.png', full_page=True)
    page.click('#cpPakai')
    expect(page.locator('#lapis')).to_be_hidden()
    expect(page.locator('#jumlahSoal')).to_have_value('40')

    # Kunci jawaban: sama dengan fixture 02-miring-40soal
    fx = json.loads((ROOT / 'tests/fixtures/omr/02-miring-40soal.json').read_text())
    kunci = ''.join(h['jawaban'] or 'A' for h in fx['harap'])
    # samakan jenis soal (fixture: 40 PG 5 pilihan)
    for j in range(40):
        page.select_option(f'select[data-s="{j}"][data-sf=opsi]', '5')
    page.fill('#kunciCepat', kunci)  # sengaja langsung mengetik: isian tidak boleh hilang walau halaman digambar ulang
    page.click('[data-aksi=kunci-cepat]')
    expect(page.locator('select[data-s="39"][data-sf=kunci]')).to_have_value(kunci[39])

    # Cetak: pratinjau lalu isi halaman cetak (print dialog dimatikan)
    page.evaluate('window.print = () => { window.__dicetak = true; }')
    page.click('[data-aksi=cetak]')
    expect(page.locator('.pratinjau svg')).to_have_count(1)
    page.screenshot(path=SHOT / f'{nama}-5-cetak.png', full_page=True)
    page.click('#ctCetak')
    page.wait_for_function('window.__dicetak === true')
    assert page.locator('#cetak .halaman').count() == 40, 'harus 40 lembar per siswa'

    # Pindai foto sintetis. Kode kuis di foto berbeda dari kuis ini → harus muncul peringatan, tapi tetap bisa disimpan.
    jpg = SHOT / 'ljk.jpg'
    pgm_ke_jpg(ROOT / 'tests/fixtures/omr/02-miring-40soal.pgm.gz', jpg)
    page.set_input_files('#filePindai', str(jpg))
    expect(page.locator('#pdSimpan')).to_be_visible(timeout=20000)
    expect(page.locator('#lapisIsi')).to_contain_text('kode kuis ini')
    page.screenshot(path=SHOT / f'{nama}-6-pindai.png', full_page=True)
    page.click('#pdSimpan')
    expect(page.locator('#lapis')).to_be_hidden()
    # Absen 23 → "Siswa 23": 38 jawaban benar dari 38 yang terisi (1 kosong, 1 ganda)
    baris = page.locator('tr', has=page.locator('text=Siswa 23'))
    expect(baris.locator('td').last).to_have_text('100%')

    # Saran & riwayat
    page.click('.nav[data-v=saran]')
    expect(page.locator('#v-saran .konsep')).to_have_count(2)
    page.select_option('#dijalankan', 'Ya')
    page.click('.nav[data-v=riwayat]')
    expect(page.locator('#v-riwayat')).to_contain_text('Ya')
    with page.expect_download() as dl:
        page.click('[data-aksi=unduh-csv]')
    csv = Path(dl.value.path()).read_text(encoding='utf-8-sig')
    assert 'konsep,persen_benar' in csv and 'Siswa 23' not in csv, 'CSV tanpa nama siswa'
    page.screenshot(path=SHOT / f'{nama}-7-riwayat.png', full_page=True)

    # Muat ulang: data bertahan (IndexedDB)
    page.click('.nav[data-v=pengaturan]')
    page.fill('#namaGuruInput', 'Bu Nur'); page.press('#namaGuruInput', 'Tab')
    page.wait_for_timeout(500)
    page.reload()
    expect(page.locator('#namaGuru')).to_have_text('Bu Nur')
    expect(page.locator('#pilihRombel')).to_contain_text('VII-A')
    with page.expect_download() as dl:
        page.click('[data-aksi=cadangkan]')
    j = json.loads(Path(dl.value.path()).read_text())
    assert j['aplikasi'] == 'cikaracak' and len(j['data']['rombel']) == 2

    # Lebar halaman tidak boleh melebihi layar (HP)
    lebar = page.evaluate('document.documentElement.scrollWidth')
    vw = page.evaluate('window.innerWidth')
    assert lebar <= vw + 1, f'halaman melebar {lebar} > {vw}'
    for v in ('beranda', 'kelas', 'kuis', 'saran', 'riwayat'):
        page.click(f'.nav[data-v={v}]')
        page.wait_for_timeout(150)
        assert page.evaluate('document.documentElement.scrollWidth') <= vw + 1, f'{v} melebar di {nama}'


if __name__ == '__main__':
    main()

"""Uji ujung-ke-ujung halaman Presensi melawan server sungguhan (PostgreSQL + PostgREST + gerbang login tiruan).

Dijalankan lewat tools/supabase/server-demo.sh, yang menyiapkan server dan mengekspor SERVER_URL, ANON_KEY:
  POSTGREST=/jalur/postgrest bash tools/supabase/server-demo.sh python3 tests/e2e/uji_presensi.py

Alur: sambungkan server -> masuk sebagai operator -> daftar kartu (ketik UID & lewat alat) -> buat alat ->
simulator alat (hadir, terlambat, kartu asing, tanda palsu) -> daftar hadir -> wali mengisi Sakit -> rekap ->
perlu disapa -> jadwal -> tambah kelas -> keluar -> masuk sebagai wali kelas (hak terbatas).
"""
import os, subprocess, sys, time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
PORT = 8766
URL = f'http://localhost:{PORT}/'
SHOT = Path(os.environ.get('E2E_SHOT', '/tmp/e2e-shots'))
SERVER, ANON = os.environ['SERVER_URL'], os.environ['ANON_KEY']


def hari_kerja_lalu():
    d = datetime.now(ZoneInfo('Asia/Jakarta')).date() - timedelta(days=1)
    while d.isoweekday() > 5:
        d -= timedelta(days=1)
    return d.isoformat()


def baris(page, no):
    return page.locator('#v-presensi table tr').filter(has=page.locator(f'td:first-child:text-is("{no}")'))


def main():
    SHOT.mkdir(parents=True, exist_ok=True)
    web = subprocess.Popen(['node', str(ROOT / 'tools' / 'serve.js'), str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    time.sleep(0.8)
    galat = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            ctx = b.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
            page = ctx.new_page()
            page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and galat.append(f'console: {m.text}'))
            page.on('pageerror', lambda e: galat.append(f'pageerror: {e}'))
            jalan(page)
            ctx.close()
            hp = b.new_context(viewport={'width': 390, 'height': 860})
            ponsel(hp.new_page())
            b.close()
    finally:
        web.terminate()
    if galat:
        print('GALAT:\n' + '\n'.join(galat)); sys.exit(1)
    print('E2E presensi lulus. Tangkapan layar:', SHOT)


def sambung(page):
    """Isi alamat server. Aplikasi bisa menggambar ulang saat data foto selesai dimuat, jadi klik diulang bila perlu."""
    page.goto(URL + '#presensi')
    page.wait_for_load_state('networkidle')
    for _ in range(3):
        page.fill('#srvUrl', SERVER)
        page.fill('#srvAnon', ANON)
        page.click('[data-aksi=simpan-server]')
        try:
            page.wait_for_selector('#masukEmail', timeout=4000)
            return
        except Exception:
            pass
    raise AssertionError('Form masuk tidak muncul setelah server disimpan')


def masuk(page, email):
    page.fill('#masukEmail', email)
    page.fill('#masukSandi', 'demo12345')
    page.click('#formMasuk button[type=submit]')
    expect(page.locator('.presensi-kepala')).to_contain_text('SMPN 2 Jalaksana')
    expect(page.locator('#v-presensi')).not_to_contain_text('Memuat…')


def tab(page, nama):
    page.click(f'[data-tab={nama}]')
    expect(page.locator(f'[data-tab={nama}]')).to_have_attribute('aria-selected', 'true')
    expect(page.locator('#v-presensi')).not_to_contain_text('Memuat…')   # tunggu data tab selesai dimuat


def jalan(page):
    tgl = hari_kerja_lalu()
    sambung(page)

    # kata sandi salah
    page.fill('#masukEmail', 'operator@contoh.sch.id')
    page.fill('#masukSandi', 'salah')
    page.click('#formMasuk button[type=submit]')
    expect(page.locator('#v-presensi')).to_contain_text('kata sandi salah')
    masuk(page, 'operator@contoh.sch.id')
    expect(page.locator('#v-presensi table tr')).to_have_count(11)   # VII-A: 10 siswa + kepala
    page.screenshot(path=SHOT / 'presensi-1-hari-ini.png', full_page=True)

    # kartu: ketik UID untuk siswa 1
    tab(page, 'kartu')
    baris(page, 1).locator('[data-aksi=ketik-uid]').click()
    page.fill('#uidManual', 'a1 b2 c3 d4')
    page.click('#simpanUid')
    expect(baris(page, 1)).to_contain_text('Ada')

    # alat baru: kunci tampil sekali
    tab(page, 'alat')
    page.fill('#alatNama', 'Gerbang uji')
    page.click('[data-aksi=buat-alat]')
    expect(page.locator('#hasilKunci')).to_be_visible()
    kunci = page.locator('#hasilKunci').inner_text().strip()
    assert len(kunci) == 64, kunci
    page.screenshot(path=SHOT / 'presensi-2-alat-baru.png')
    page.click('#lapis [data-tutup]')
    expect(page.locator('#v-presensi')).to_contain_text('Gerbang uji')

    # kartu siswa 2 lewat mode daftar + simulator
    tab(page, 'kartu')
    page.select_option('#pilihAlat', label=page.locator('#pilihAlat option', has_text='Gerbang uji').inner_text())
    baris(page, 2).locator('[data-aksi=daftar-alat]').click()
    page.fill('#daftarUid', 'CAFEBABE')
    page.click('#daftarSim')
    expect(page.locator('#toast')).to_contain_text('terdaftar', timeout=8000)
    expect(baris(page, 2)).to_contain_text('Ada')

    # simulator: hadir, terlambat, kartu asing
    tab(page, 'simulator')
    expect(page.locator('#simKunci')).to_have_value(kunci)
    page.check('#simOffline')
    for uid, jam, harap in (('A1B2C3D4', '06:50', 'Selamat datang, Adit!'), ('CAFEBABE', '07:25', 'telat 25 menit'), ('DEADBEEF', '07:00', 'Kartu belum terdaftar')):
        page.fill('#simUid', uid)
        page.fill('#simWaktu', f'{tgl}T{jam}')
        page.click('[data-aksi=sim-tap]')
        expect(page.locator('.sim-layar')).to_contain_text(harap)
    page.screenshot(path=SHOT / 'presensi-3-simulator.png', full_page=True)
    page.fill('#simKunci', '0' * 64)
    page.dispatch_event('#simKunci', 'change')
    page.click('[data-aksi=sim-tap]')
    expect(page.locator('.sim-layar')).to_contain_text('Kunci alat salah')

    # daftar hadir tanggal itu + isi Sakit
    tab(page, 'hari')
    page.fill('#presTanggal', tgl)
    page.dispatch_event('#presTanggal', 'change')
    expect(baris(page, 1)).to_contain_text('06:50')
    expect(baris(page, 1)).to_contain_text('Hadir')
    expect(baris(page, 2)).to_contain_text('Terlambat')
    expect(baris(page, 3)).to_contain_text('Belum tercatat')
    baris(page, 3).locator('[data-aksi=ubah-presensi]').click()
    page.check('input[name=stPres][value=S]')
    page.click('#simpanPres')
    expect(page.locator('#toast')).to_contain_text('Alasan wajib')
    page.fill('#alasanPres', 'Demam, surat dari orang tua')
    page.click('#simpanPres')
    expect(baris(page, 3)).to_contain_text('Sakit')
    expect(baris(page, 3)).to_contain_text('Demam')
    page.screenshot(path=SHOT / 'presensi-4-daftar-hadir.png', full_page=True)

    # rekap & perlu disapa
    tab(page, 'rekap')
    page.fill('#presBulan', tgl[:7])
    page.dispatch_event('#presBulan', 'change')
    expect(baris(page, 2).locator('td').nth(4)).to_have_text('1')   # terlambat 1x
    with page.expect_download() as dl:
        page.click('[data-aksi=unduh-rekap]')
    assert dl.value.suggested_filename.startswith('presensi-VII-A')
    tab(page, 'disapa')
    expect(page.locator('#v-presensi')).to_contain_text('30 hari terakhir')

    # jadwal & kelas baru
    tab(page, 'jadwal')
    expect(page.locator('#jdAda1')).to_be_checked()
    expect(page.locator('#jdAda6')).not_to_be_checked()
    page.fill('#jdPulang5', '11:30')
    page.click('[data-aksi=simpan-jadwal]')
    expect(page.locator('#toast')).to_contain_text('Jadwal disimpan')
    tab(page, 'sekolah')
    page.fill('#skNama', 'VII-B')
    page.fill('#skSiswa', 'Raka Mahendra | Raka\nSalsa Bila\nTegar Wibowo')
    page.click('[data-aksi=simpan-kelas]')
    expect(page.locator('#toast')).to_contain_text('3 siswa')
    expect(page.locator('#v-presensi')).to_contain_text('VII-B')
    page.screenshot(path=SHOT / 'presensi-5-kelas-guru.png', full_page=True)

    # pegawai tanpa akun -> wali IX-A -> akun NIP -> masuk -> wajib ganti sandi
    page.fill('#pgNama', 'Bu Uji Pegawai, S.Pd.')
    page.click('[data-aksi=tambah-pegawai]')
    expect(page.locator('#toast')).to_contain_text('Pegawai ditambahkan')
    pg = page.locator('#v-presensi tr:has([data-aksi=akun-pegawai])', has_text='Bu Uji Pegawai')
    expect(pg).to_contain_text('belum')
    idp = pg.locator('[data-aksi=akun-pegawai]').get_attribute('data-pegawai')
    page.locator('#v-presensi tr:has(select[data-wali])', has_text='IX-A').locator('select[data-wali]').select_option(value=idp)
    expect(page.locator('#toast')).to_contain_text('Wali kelas disimpan')
    expect(page.locator('#v-presensi')).not_to_contain_text('Memuat…')
    page.locator('#v-presensi tr:has([data-aksi=akun-pegawai])', has_text='Bu Uji Pegawai').locator('[data-aksi=akun-pegawai]').click()
    page.fill('#akunKode', '198001012005012001')
    page.click('#simpanAkun')
    expect(page.locator('#hasilSandi')).to_be_visible()
    sandi_awal = page.locator('#hasilSandi').inner_text().strip()
    page.screenshot(path=SHOT / 'presensi-6-akun-pegawai.png')
    page.click('#lapis [data-tutup]')
    expect(page.locator('#v-presensi tr:has([data-aksi=akun-pegawai])', has_text='Bu Uji Pegawai')).to_contain_text('198001012005012001')
    page.click('[data-aksi=keluar]')
    page.fill('#masukEmail', '198001012005012001')
    page.fill('#masukSandi', sandi_awal)
    page.click('#formMasuk button[type=submit]')
    expect(page.locator('#formSandi')).to_be_visible()
    page.fill('#sandiBaru', 'SandiSaya2026')
    page.fill('#sandiUlang', 'SandiBeda2026')
    page.click('#formSandi button[type=submit]')
    expect(page.locator('#v-presensi')).to_contain_text('tidak sama')
    page.fill('#sandiUlang', 'SandiSaya2026')
    page.click('#formSandi button[type=submit]')
    expect(page.locator('.presensi-kepala')).to_contain_text('Bu Uji Pegawai')
    expect(page.locator('#presRombel')).to_contain_text('IX-A (perwalian)')
    page.click('[data-aksi=keluar]')
    page.fill('#masukEmail', '198001012005012001')
    page.fill('#masukSandi', sandi_awal)
    page.click('#formMasuk button[type=submit]')
    expect(page.locator('#v-presensi')).to_contain_text('kata sandi salah')   # sandi awal tidak berlaku lagi
    masuk(page, 'operator@contoh.sch.id')

    # wali kelas: hanya kelasnya, tanpa menu admin
    page.click('[data-aksi=keluar]')
    masuk(page, 'wali@contoh.sch.id')
    expect(page.locator('[data-tab]')).to_have_count(3)
    expect(page.locator('#presRombel option')).to_have_count(1)
    expect(page.locator('#presRombel')).to_contain_text('VIII-A (perwalian)')
    expect(page.locator('[data-aksi=ubah-presensi]').first).to_be_visible()
    page.screenshot(path=SHOT / 'presensi-7-wali.png', full_page=True)


def ponsel(page):
    sambung(page)
    masuk(page, 'operator@contoh.sch.id')
    page.screenshot(path=SHOT / 'presensi-hp-1.png', full_page=True)
    tab(page, 'simulator')
    page.screenshot(path=SHOT / 'presensi-hp-2-simulator.png', full_page=True)


if __name__ == '__main__':
    main()

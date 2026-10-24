"""Pembuat foto LJK sintetis untuk menguji pemindai (web/js/core/omr.js).

Menggambar lembar sesuai tata letak dari ljk.js, mengisinya seperti siswa
(arsiran pensil/pulpen, arsiran tidak penuh, coretan keluar garis, bekas hapusan,
jawaban ganda, soal kosong), lalu "memotretnya": miring, perspektif, bayangan,
buram, noise, dan kompresi JPEG. Hasil: tests/fixtures/omr/*.pgm.gz + *.json (jawaban harapan).

Pakai:  python3 tools/omr/buat_sintetis.py
Butuh:  Python 3, Pillow, numpy. Node untuk mengekspor tata letak.
"""
import gzip, io, json, math, random, subprocess, sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tests' / 'fixtures' / 'omr'
PX = 6.0  # piksel per mm saat menggambar lembar


def tata_letak(soal):
    js = ROOT / 'tools' / 'omr' / 'ekspor-tata-letak.mjs'
    return json.loads(subprocess.check_output(['node', str(js), json.dumps(soal)], cwd=ROOT))


def gambar_lembar(L, isian, rnd):
    W, H = int(L['lebar'] * PX), int(L['tinggi'] * PX)
    im = Image.new('L', (W, H), 250)
    d = ImageDraw.Draw(im)
    font = ImageFont.load_default()
    mm = lambda v: v * PX
    for p in L['penanda']:
        d.rectangle([mm(p['x']), mm(p['y']), mm(p['x'] + p['sisi']), mm(p['y'] + p['sisi'])], fill=0)
    # teks kepala (tiruan)
    for i, y in enumerate([16, 21.5, 30, 38, 42, 51]):
        x = 22
        while x < 180 - rnd.random() * 40:
            w = rnd.uniform(4, 14)
            d.rectangle([mm(x), mm(y - 2.4), mm(x + w), mm(y)], fill=40 if i == 0 else 90)
            x += w + rnd.uniform(1.2, 2.5)
    r = L['r']

    def bulatan(b):
        x, y = mm(b['x']), mm(b['y'])
        d.ellipse([x - mm(r), y - mm(r), x + mm(r), y + mm(r)], outline=138, width=2)
        d.text((x - 3, y - 5), b['nilai'], fill=181, font=font)

    for blok in (L['kode'], L['absen']):
        for kol in blok:
            x = mm(kol['bulatan'][0]['x'])
            d.rectangle([x - mm(3.2), mm(53.5), x + mm(3.2), mm(59.9)], outline=0, width=2)
            for b in kol['bulatan']:
                bulatan(b)
    for s in L['soal']:
        d.text((mm(s['xLabel'] - 2), mm(s['y'] - 1.5)), f"{s['no']}.", fill=20, font=font)
        for b in s['bulatan']:
            bulatan(b)

    def arsir(b, gaya):
        x, y = mm(b['x']), mm(b['y'])
        if gaya == 'hapus':  # bekas hapusan: abu-abu sangat muda, tidak boleh terbaca
            g = rnd.randint(205, 225); rr = mm(r) * 0.85
            d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=g)
            return
        g = rnd.randint(25, 95) if gaya != 'tipis' else rnd.randint(105, 130)
        if gaya == 'sebagian':
            rr = mm(r) * 0.7; ox, oy = rnd.uniform(-1, 1) * mm(0.6), rnd.uniform(-1, 1) * mm(0.6)
            d.ellipse([x - rr + ox, y - rr + oy, x + rr + ox, y + rr + oy], fill=g)
        elif gaya == 'keluar':
            rr = mm(r) * 1.12
            d.ellipse([x - rr, y - rr * 0.95, x + rr * 1.05, y + rr], fill=g)
        else:
            rr = mm(r) * rnd.uniform(0.82, 0.98)
            d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=g)
        # guratan pensil
        for _ in range(6):
            a = rnd.uniform(0, math.pi)
            d.line([x - math.cos(a) * mm(r) * 0.8, y - math.sin(a) * mm(r) * 0.8,
                    x + math.cos(a) * mm(r) * 0.8, y + math.sin(a) * mm(r) * 0.8], fill=max(0, g - 20), width=1)

    for (blok, nilai) in ((L['kode'], isian['kode']), (L['absen'], f"{isian['absen']:02d}")):
        for kol, ch in zip(blok, nilai):
            arsir(next(b for b in kol['bulatan'] if b['nilai'] == ch), 'penuh')
    for s, item in zip(L['soal'], isian['soal']):
        for (huruf, gaya) in item:
            arsir(next(b for b in s['bulatan'] if b['nilai'] == huruf), gaya)
    return im


def potret(im, rnd, kesulitan):
    W, H = im.size
    pad = int(W * 0.18)
    bg = Image.new('L', (W + 2 * pad, H + 2 * pad), rnd.randint(55, 120))
    bga = np.array(bg, dtype=np.float32) + np.random.default_rng(rnd.randint(0, 9999)).normal(0, 8, (bg.size[1], bg.size[0]))
    bg = Image.fromarray(np.clip(bga, 0, 255).astype(np.uint8))
    bg.paste(im, (pad, pad))
    big = bg
    BW, BH = big.size
    # perspektif: geser keempat sudut lembar secara acak
    j = 0.05 * kesulitan
    src = [(pad, pad), (pad + W, pad), (pad + W, pad + H), (pad, pad + H)]
    dst = [(x + rnd.uniform(-j, j) * W, y + rnd.uniform(-j, j) * H) for x, y in src]
    ang = math.radians(rnd.uniform(-6, 6) * kesulitan)
    cx, cy = BW / 2, BH / 2
    dst = [(cx + (x - cx) * math.cos(ang) - (y - cy) * math.sin(ang), cy + (x - cx) * math.sin(ang) + (y - cy) * math.cos(ang)) for x, y in dst]
    coeffs = koefisien_perspektif(dst, src)
    foto = big.transform((BW, BH), Image.PERSPECTIVE, coeffs, Image.BICUBIC, fillcolor=90)
    a = np.array(foto, dtype=np.float32)
    # bayangan/gradasi cahaya
    yy, xx = np.mgrid[0:BH, 0:BW]
    gx, gy = rnd.uniform(-1, 1), rnd.uniform(-1, 1)
    grad = 1 - 0.32 * kesulitan * (0.5 + 0.5 * ((xx / BW - 0.5) * gx + (yy / BH - 0.5) * gy) * 2)
    a = a * np.clip(grad, 0.45, 1.05)
    foto = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    foto = foto.filter(ImageFilter.GaussianBlur(0.4 + 0.9 * kesulitan))
    a = np.array(foto, dtype=np.float32) + np.random.default_rng(rnd.randint(0, 9999)).normal(0, 3 + 4 * kesulitan, (BH, BW))
    foto = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    lebar = rnd.randint(1000, 1500)
    foto = foto.resize((lebar, int(BH * lebar / BW)), Image.LANCZOS)
    buf = io.BytesIO(); foto.save(buf, 'JPEG', quality=rnd.randint(55, 80)); buf.seek(0)
    return Image.open(buf).convert('L')


def koefisien_perspektif(pa, pb):
    """Koefisien PIL PERSPECTIVE yang memetakan titik keluaran pa ke titik masukan pb."""
    M = []
    for (x, y), (u, v) in zip(pa, pb):
        M.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        M.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    A = np.array(M, dtype=np.float64); B = np.array([c for p in pb for c in p], dtype=np.float64)
    return np.linalg.solve(A, B).tolist()


def simpan_pgm_gz(im, path):
    a = np.array(im, dtype=np.uint8)
    h, w = a.shape
    with gzip.open(path, 'wb', compresslevel=9) as f:
        f.write(f'P5\n{w} {h}\n255\n'.encode()); f.write(a.tobytes())


def kasus(nama, soal_def, n_absen, kesulitan, seed, khusus=None):
    rnd = random.Random(seed)
    L = tata_letak(soal_def)
    kode = f'{rnd.randint(0, 999):03d}'
    isian, harap = [], []
    gaya_pilih = ['penuh', 'penuh', 'penuh', 'sebagian', 'keluar', 'tipis']
    for i, s in enumerate(L['soal']):
        hurufs = [b['nilai'] for b in s['bulatan']]
        h = rnd.choice(hurufs)
        item, exp = [(h, rnd.choice(gaya_pilih))], {'jawaban': h}
        k = (khusus or {}).get(i + 1)
        if k == 'kosong':
            item, exp = [], {'jawaban': None, 'status': 'kosong'}
        elif k == 'ganda':
            h2 = rnd.choice([x for x in hurufs if x != h])
            item, exp = [(h, 'penuh'), (h2, 'penuh')], {'jawaban': None, 'status': 'ganda'}
        elif k == 'hapus':
            h2 = rnd.choice([x for x in hurufs if x != h])
            item = [(h2, 'hapus'), (h, 'penuh')]
        isian.append(item); harap.append(exp)
    im = gambar_lembar(L, {'kode': kode, 'absen': n_absen, 'soal': isian}, rnd)
    foto = potret(im, rnd, kesulitan)
    OUT.mkdir(parents=True, exist_ok=True)
    simpan_pgm_gz(foto, OUT / f'{nama}.pgm.gz')
    (OUT / f'{nama}.json').write_text(json.dumps({'soal': soal_def, 'kode': kode, 'absen': n_absen, 'harap': harap,
                                                   'kesulitan': kesulitan, 'ukuran': foto.size}, indent=1))
    print(nama, foto.size, 'kode', kode)


def uji_massal(n, keluar):
    """Buat n foto acak (tidak disimpan di repo) untuk mengukur akurasi: python3 buat_sintetis.py --acak 40 /tmp/omr"""
    global OUT
    OUT = Path(keluar)
    r = random.Random(2026)
    for k in range(n):
        jumlah = r.choice([10, 15, 20, 25, 30, 40])
        jenis = r.choice(['pg5', 'pg4', 'pg3', 'campur'])
        if jenis == 'campur':
            soal = [{'jenis': 'pg', 'opsi': 4}] * (jumlah // 2) + [{'jenis': 'bs'}] * (jumlah - jumlah // 2)
        else:
            soal = [{'jenis': 'pg', 'opsi': int(jenis[2])}] * jumlah
        khusus = {r.randint(1, jumlah): r.choice(['kosong', 'ganda', 'hapus']) for _ in range(3)}
        kasus(f'acak-{k:02d}', soal, r.randint(1, 40), r.uniform(0.2, 1.8), 1000 + k, khusus)


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--acak':
        uji_massal(int(sys.argv[2]), sys.argv[3] if len(sys.argv) > 3 else '/tmp/omr-acak')
        sys.exit(0)
    pg10 = [{'jenis': 'pg', 'opsi': 4}] * 10
    pg40 = [{'jenis': 'pg', 'opsi': 5}] * 40
    campur = [{'jenis': 'pg', 'opsi': 4}] * 15 + [{'jenis': 'bs'}] * 10
    sd = [{'jenis': 'pg', 'opsi': 3}] * 12
    kasus('01-rapi-10soal', pg10, 7, 0.3, 11)
    kasus('02-miring-40soal', pg40, 23, 1.0, 22, {5: 'kosong', 17: 'ganda', 33: 'hapus'})
    kasus('03-bayangan-campur-bs', campur, 31, 1.3, 33, {2: 'hapus', 20: 'kosong'})
    kasus('04-sd-3opsi', sd, 4, 0.8, 44, {9: 'ganda'})
    kasus('05-sulit-40soal', pg40, 12, 1.6, 55, {1: 'kosong', 40: 'hapus'})

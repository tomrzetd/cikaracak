"""Build database seed files from parsed.json (CP Lampiran II, Keputusan BSKAP 046/H/KR/2025)."""
import json, re, csv, collections, os

d = json.load(open('parsed.json', encoding='utf-8'))
rows = d['rows']
OUT = 'out'
os.makedirs(OUT, exist_ok=True)

FASE_INFO = {
    'A': ('SD/MI', 'I–II'), 'B': ('SD/MI', 'III–IV'), 'C': ('SD/MI', 'V–VI'),
    'D': ('SMP/MTs', 'VII–IX'), 'E': ('SMA/MA', 'X'), 'F': ('SMA/MA', 'XI–XII'),
}

MAPEL_ID = {
    'Pendidikan Agama Islam dan Budi Pekerti': 'pai',
    'Pendidikan Agama Kristen dan Budi Pekerti': 'pak',
    'Pendidikan Agama Katolik dan Budi Pekerti': 'pakat',
    'Pendidikan Agama Hindu dan Budi Pekerti': 'pah',
    'Pendidikan Agama Buddha dan Budi Pekerti': 'pab',
    'Pendidikan Agama Khonghucu dan Budi Pekerti': 'pakh',
    'Pendidikan Pancasila': 'ppkn',
    'Bahasa Indonesia': 'bindo',
    'Bahasa Indonesia Tingkat Lanjut': 'bindo-tl',
    'Matematika': 'mtk',
    'Matematika Tingkat Lanjut': 'mtk-tl',
    'Bahasa Inggris': 'bing',
    'Bahasa Inggris Tingkat Lanjut': 'bing-tl',
    'Ilmu Pengetahuan Alam dan Sosial': 'ipas',
    'Ilmu Pengetahuan Alam (IPA)': 'ipa',
    'Fisika': 'fis', 'Kimia': 'kim', 'Biologi': 'bio',
    'Informatika': 'inf',
    'Ilmu Pengetahuan Sosial': 'ips',
    'Sejarah': 'sej', 'Sejarah Tingkat Lanjut': 'sej-tl',
    'Geografi': 'geo', 'Ekonomi': 'eko', 'Sosiologi': 'sos', 'Antropologi': 'ant',
    'Seni Musik': 'musik', 'Seni Rupa': 'rupa', 'Seni Tari': 'tari', 'Seni Teater': 'teater',
    'Prakarya Budi Daya': 'pkr-bd', 'Prakarya Kerajinan': 'pkr-kj',
    'Prakarya Pengolahan': 'pkr-ol', 'Prakarya Rekayasa': 'pkr-rk',
    'Prakarya dan Kewirausahaan Budi Daya': 'pkwu-bd',
    'Prakarya dan Kewirausahaan Kerajinan': 'pkwu-kj',
    'Prakarya dan Kewirausahaan Pengolahan': 'pkwu-ol',
    'Prakarya dan Kewirausahaan Rekayasa': 'pkwu-rk',
    'Pendidikan Jasmani, Olahraga, dan Kesehatan': 'pjok',
    'Bahasa Arab': 'arab', 'Bahasa Jepang': 'jepang', 'Bahasa Jerman': 'jerman',
    'Bahasa Korea': 'korea', 'Bahasa Mandarin': 'mandarin', 'Bahasa Prancis': 'prancis',
    'Koding dan Kecerdasan Artifisial': 'kka',
}
MAPEL_SINGKAT = {
    'pai': 'PAI', 'pak': 'PAK Kristen', 'pakat': 'PAK Katolik', 'pah': 'Agama Hindu', 'pab': 'Agama Buddha',
    'pakh': 'Agama Khonghucu', 'ppkn': 'Pend. Pancasila', 'bindo': 'B. Indonesia', 'bindo-tl': 'B. Indonesia TL',
    'mtk': 'Matematika', 'mtk-tl': 'Matematika TL', 'bing': 'B. Inggris', 'bing-tl': 'B. Inggris TL',
    'ipas': 'IPAS', 'ipa': 'IPA', 'fis': 'Fisika', 'kim': 'Kimia', 'bio': 'Biologi', 'inf': 'Informatika',
    'ips': 'IPS', 'sej': 'Sejarah', 'sej-tl': 'Sejarah TL', 'geo': 'Geografi', 'eko': 'Ekonomi', 'sos': 'Sosiologi',
    'ant': 'Antropologi', 'musik': 'Seni Musik', 'rupa': 'Seni Rupa', 'tari': 'Seni Tari', 'teater': 'Seni Teater',
    'pkr-bd': 'Prakarya Budi Daya', 'pkr-kj': 'Prakarya Kerajinan', 'pkr-ol': 'Prakarya Pengolahan',
    'pkr-rk': 'Prakarya Rekayasa', 'pkwu-bd': 'PKWU Budi Daya', 'pkwu-kj': 'PKWU Kerajinan',
    'pkwu-ol': 'PKWU Pengolahan', 'pkwu-rk': 'PKWU Rekayasa', 'pjok': 'PJOK', 'arab': 'B. Arab',
    'jepang': 'B. Jepang', 'jerman': 'B. Jerman', 'korea': 'B. Korea', 'mandarin': 'B. Mandarin',
    'prancis': 'B. Prancis', 'kka': 'Koding & KA',
}

ELEM_FIX = {
    ('bing', 'Menyimak - Berbicara (Listening - Speaking)'): 'Menyimak-Berbicara (Listening-Speaking)',
    ('bing', 'Menyimak - Berbicara (Listening - Writing)'): 'Menyimak-Berbicara (Listening-Speaking)',
    ('bing', 'Membaca - Memirsa (Reading - Viewing)'): 'Membaca-Memirsa (Reading-Viewing)',
    ('bing', 'Menulis - Mempresentasikan (Writing - Presenting)'): 'Menulis-Mempresentasikan (Writing-Presenting)',
    ('bing', 'Menulis-Mempresentasikan (Writing - Presenting)'): 'Menulis-Mempresentasikan (Writing-Presenting)',
    ('bing-tl', 'Menyimak - Berbicara (Listening - Speaking)'): 'Menyimak-Berbicara (Listening-Speaking)',
    ('teater', 'Bekerja Secara Artistik (Thinking and Working Artistically)'): 'Berpikir dan Bekerja Artistik (Thinking and Working Artistically)',
    ('teater', 'Merefleksikan (Reflection)'): 'Merefleksikan (Reflecting)',
    ('pkr-kj', 'Eksplorasi dan Observasi'): 'Observasi dan Eksplorasi',
    ('pkr-kj', 'Evaluasi dan Refleksi'): 'Refleksi dan Evaluasi',
}


def norm_elem(mid, e):
    e = re.sub(r'\s+', ' ', e).strip()
    e = re.sub(r'^Elemen\s+', '', e)
    e = e.replace('Nilai- Nilai', 'Nilai-Nilai').replace('Nilai- nilai', 'Nilai-Nilai')
    e = e.replace('Desain/ Perencanaan', 'Desain/Perencanaan').replace('Desain/perencanaan', 'Desain/Perencanaan')
    e = e.replace('Observasi dan eksplorasi', 'Observasi dan Eksplorasi')
    e = re.sub(r'\s*（', ' (', e).replace('）', ')')
    e = ELEM_FIX.get((mid, e), e)
    return e


SIG = re.compile(r'\s*KEPALA BADAN\s+TTD\..*$', re.S)


def clean_cp(t):
    t = SIG.sub('', t).strip()
    t = re.sub(r'\s+([,.;:])', r'\1', t)
    t = re.sub(r'\b(\w+) \1\b', lambda m: m.group(0) if m.group(1).lower() in ('dan',) else m.group(0), t)
    return t


# ---------- CP rows ----------
cp_rows = []
elem_order = collections.defaultdict(dict)
counter = collections.Counter()
mapel_order = []
for r in rows:
    mid = MAPEL_ID[r['mapel']]
    if mid not in mapel_order:
        mapel_order.append(mid)
    e = norm_elem(mid, r['elemen'])
    if e not in elem_order[mid]:
        elem_order[mid][e] = len(elem_order[mid]) + 1
    counter[(mid, r['fase'])] += 1
    n = counter[(mid, r['fase'])]
    cp = clean_cp(r['cp'])
    note = ''
    if cp.strip() in ('-', '–'):
        cp = ''
        note = 'Di dokumen sumber elemen ini bertanda "-" (tidak ada capaian tertulis untuk fase ini).'
    jenjang, kelas = FASE_INFO[r['fase']]
    cp_rows.append({
        'id': f"{mid}-{r['fase'].lower()}-{n}",
        'mapel_id': mid, 'mapel': r['mapel'], 'fase': r['fase'], 'jenjang': jenjang, 'kelas': kelas,
        'urutan': n, 'elemen': e, 'elemen_sumber': re.sub(r'\s+', ' ', r['elemen']).strip(),
        'capaian': cp, 'halaman_pdf': r['halaman'], 'catatan': note,
    })

# ---------- butir CP (bahan TP) ----------
VERB_SKIP = {'murid', 'peserta', 'mampu', 'dapat'}


def split_top(text, seps=';'):
    parts, depth, cur = [], 0, ''
    for ch in text:
        if ch in '([':
            depth += 1
        elif ch in ')]':
            depth = max(0, depth - 1)
        if ch in seps and depth == 0:
            parts.append(cur); cur = ''
        else:
            cur += ch
    parts.append(cur)
    return parts


def tidy(p):
    p = p.strip().strip(',').strip()
    p = re.sub(r'^(serta|dan|juga|lalu|kemudian)\s+', '', p, flags=re.I)
    p = p.rstrip('.').strip()
    if not p:
        return ''
    return p[0].upper() + p[1:]


def to_butir(cp):
    out = []
    lines = cp.split('\n')
    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        if ln.startswith('•'):
            body = ln.lstrip('• ').strip()
            if ': ' in body[:70]:
                head, rest = body.split(': ', 1)
                for p in split_top(rest):
                    t = tidy(p)
                    if t and t not in ('-', '–'):
                        out.append((head.strip(), t))
            else:
                body = re.sub(r'\s+-$', '', body)
                t = tidy(body)
                if t and len(t.split()) >= 5:
                    out.append(('', t))
            continue
        if ln.endswith(':'):
            continue  # intro line such as "Menerapkan keterampilan proses yang mencakup:"
        # sentences, then semicolons
        sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', ln)
        for s in sentences:
            for p in split_top(s):
                t = tidy(p)
                if t and len(t) > 3:
                    out.append(('', t))
    return out


def kata_kerja(t):
    for w in re.findall(r"[A-Za-zÀ-ÿ\-]+", t):
        lw = w.lower()
        if lw in VERB_SKIP:
            continue
        return lw
    return ''


butir_rows = []
for c in cp_rows:
    for i, (sub, t) in enumerate(to_butir(c['capaian']), 1):
        butir_rows.append({
            'id': f"{c['id']}-{i}", 'cp_id': c['id'], 'mapel_id': c['mapel_id'], 'fase': c['fase'],
            'elemen': c['elemen'], 'sub_elemen': sub, 'urutan': i, 'butir': t, 'kata_kerja': kata_kerja(t),
        })

# ---------- mapel ----------
mapel_rows = []
for i, mid in enumerate(mapel_order, 1):
    name = next(c['mapel'] for c in cp_rows if c['mapel_id'] == mid)
    fases = sorted({c['fase'] for c in cp_rows if c['mapel_id'] == mid})
    jen = []
    for f in fases:
        j = FASE_INFO[f][0]
        if j not in jen:
            jen.append(j)
    mapel_rows.append({'id': mid, 'nama': name, 'singkatan': MAPEL_SINGKAT[mid], 'urutan': i,
                       'fase': ''.join(fases), 'jenjang': ', '.join(jen),
                       'elemen': ' | '.join(elem_order[mid].keys())})

# ---------- write CSV ----------
def wcsv(path, data, cols):
    with open(path, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in data:
            w.writerow({k: r[k] for k in cols})

wcsv(f'{OUT}/cp_2025_sd_sma.csv', cp_rows,
     ['id', 'mapel_id', 'mapel', 'fase', 'jenjang', 'kelas', 'urutan', 'elemen', 'capaian', 'elemen_sumber', 'halaman_pdf', 'catatan'])
wcsv(f'{OUT}/cp_butir_2025.csv', butir_rows,
     ['id', 'cp_id', 'mapel_id', 'fase', 'elemen', 'sub_elemen', 'urutan', 'butir', 'kata_kerja'])
wcsv(f'{OUT}/mapel_2025.csv', mapel_rows, ['id', 'nama', 'singkatan', 'urutan', 'fase', 'jenjang', 'elemen'])

# ---------- JSON (nested, for bundling into the PWA) ----------
SUMBER = {
    'dokumen': 'Keputusan Kepala BSKAP Kemendikdasmen Nomor 046/H/KR/2025 tentang Capaian Pembelajaran pada PAUD, Jenjang Pendidikan Dasar, dan Jenjang Pendidikan Menengah',
    'lampiran': 'Lampiran II — CP untuk SD/MI, SMP/MTs, dan SMA/MA',
    'ditetapkan': '2025-07-16',
    'diekstrak': '2026-10-24',
}
nested = {'sumber': SUMBER, 'fase': {k: {'jenjang': v[0], 'kelas': v[1]} for k, v in FASE_INFO.items()}, 'mapel': []}
for m in mapel_rows:
    mm = {'id': m['id'], 'nama': m['nama'], 'singkatan': m['singkatan'], 'fase': {}}
    for c in cp_rows:
        if c['mapel_id'] != m['id']:
            continue
        mm['fase'].setdefault(c['fase'], []).append({
            'id': c['id'], 'elemen': c['elemen'], 'capaian': c['capaian'],
            'butir': [b['butir'] if not b['sub_elemen'] else f"{b['sub_elemen']}: {b['butir']}" for b in butir_rows if b['cp_id'] == c['id']],
            **({'catatan': c['catatan']} if c['catatan'] else {}),
        })
    nested['mapel'].append(mm)
json.dump(nested, open(f'{OUT}/cp_2025_sd_sma.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ---------- SQL seed for Supabase ----------
def q(v):
    if v is None or v == '':
        return 'null'
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"

sql = []
sql.append(f"""-- Data referensi Capaian Pembelajaran (CP) SD/MI, SMP/MTs, SMA/MA
-- Sumber: {SUMBER['dokumen']}
-- {SUMBER['lampiran']}; ditetapkan {SUMBER['ditetapkan']}; diekstrak {SUMBER['diekstrak']}.
-- {len(mapel_rows)} mapel, {len(cp_rows)} baris CP (per mapel x fase x elemen), {len(butir_rows)} butir CP.
-- Tabel ref_cp_butir adalah pecahan kalimat CP (dipisah titik koma/kalimat) sebagai bahan menyusun TP;
-- ini BUKAN tujuan pembelajaran resmi. TP tetap disusun guru/satuan pendidikan.

begin;

create table if not exists public.ref_mapel (
  id text primary key,
  nama text not null,
  singkatan text not null,
  urutan int not null,
  fase text not null,          -- fase yang memiliki CP, mis. 'ABCDEF'
  jenjang text not null
);

create table if not exists public.ref_cp (
  id text primary key,         -- mis. 'ipa-d-1'
  mapel_id text not null references public.ref_mapel(id),
  fase char(1) not null check (fase in ('A','B','C','D','E','F')),
  jenjang text not null,
  kelas text not null,
  urutan int not null,
  elemen text not null,
  capaian text not null,
  elemen_sumber text not null,
  halaman_pdf int,
  catatan text
);
create index if not exists ref_cp_mapel_fase on public.ref_cp (mapel_id, fase);

create table if not exists public.ref_cp_butir (
  id text primary key,         -- mis. 'ipa-d-1-3'
  cp_id text not null references public.ref_cp(id) on delete cascade,
  urutan int not null,
  sub_elemen text,
  butir text not null,
  kata_kerja text
);
create index if not exists ref_cp_butir_cp on public.ref_cp_butir (cp_id);

-- Referensi hanya-baca untuk pengguna yang sudah masuk
alter table public.ref_mapel enable row level security;
alter table public.ref_cp enable row level security;
alter table public.ref_cp_butir enable row level security;
drop policy if exists "ref_mapel dibaca pengguna" on public.ref_mapel;
drop policy if exists "ref_cp dibaca pengguna" on public.ref_cp;
drop policy if exists "ref_cp_butir dibaca pengguna" on public.ref_cp_butir;
create policy "ref_mapel dibaca pengguna" on public.ref_mapel for select to authenticated using (true);
create policy "ref_cp dibaca pengguna" on public.ref_cp for select to authenticated using (true);
create policy "ref_cp_butir dibaca pengguna" on public.ref_cp_butir for select to authenticated using (true);
""")
sql.append('insert into public.ref_mapel (id, nama, singkatan, urutan, fase, jenjang) values')
sql.append(',\n'.join(f"  ({q(m['id'])}, {q(m['nama'])}, {q(m['singkatan'])}, {m['urutan']}, {q(m['fase'])}, {q(m['jenjang'])})" for m in mapel_rows) + '\non conflict (id) do update set nama = excluded.nama, singkatan = excluded.singkatan, urutan = excluded.urutan, fase = excluded.fase, jenjang = excluded.jenjang;\n')
sql.append('insert into public.ref_cp (id, mapel_id, fase, jenjang, kelas, urutan, elemen, capaian, elemen_sumber, halaman_pdf, catatan) values')
sql.append(',\n'.join(f"  ({q(c['id'])}, {q(c['mapel_id'])}, {q(c['fase'])}, {q(c['jenjang'])}, {q(c['kelas'])}, {c['urutan']}, {q(c['elemen'])}, {q(c['capaian']) if c['capaian'] else "''"}, {q(c['elemen_sumber'])}, {c['halaman_pdf']}, {q(c['catatan'])})" for c in cp_rows) + '\non conflict (id) do update set elemen = excluded.elemen, capaian = excluded.capaian, catatan = excluded.catatan;\n')
for k in range(0, len(butir_rows), 500):
    chunk = butir_rows[k:k + 500]
    sql.append('insert into public.ref_cp_butir (id, cp_id, urutan, sub_elemen, butir, kata_kerja) values')
    sql.append(',\n'.join(f"  ({q(b['id'])}, {q(b['cp_id'])}, {b['urutan']}, {q(b['sub_elemen'])}, {q(b['butir'])}, {q(b['kata_kerja'])})" for b in chunk) + '\non conflict (id) do update set butir = excluded.butir, sub_elemen = excluded.sub_elemen, kata_kerja = excluded.kata_kerja;\n')
sql.append('commit;\n')
open(f'{OUT}/seed_ref_cp_2025.sql', 'w', encoding='utf-8').write('\n'.join(sql))

print('mapel', len(mapel_rows), 'cp', len(cp_rows), 'butir', len(butir_rows))

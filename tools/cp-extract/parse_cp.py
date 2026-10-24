"""Parse Lampiran II (CP SD/MI, SMP/MTs, SMA/MA) of Keputusan Kepala BSKAP 046/H/KR/2025
into rows: mapel, fase, elemen, capaian pembelajaran."""
import re, json, sys

RAW = open('cp_layout.txt', encoding='utf-8').read()
PAGES = RAW.split('\f')
P0, P1 = 22, 347  # 0-based page range of Lampiran II (pages 23..347)

ZW = dict.fromkeys(map(ord, '​‌‍﻿'), None)

lines = []  # (page_no, text)
for pi in range(P0, P1):
    for ln in PAGES[pi].translate(ZW).split('\n'):
        lines.append((pi + 1, ln.rstrip()))

HEAD = re.compile(r'^\s*(?:[IVX]+(?:\.\d+)?\.?\s*)?CAPAIAN PEMBELAJARAN\s+(?!PADA|UNTUK)([A-Z].*)$')
FASE = re.compile(r'^\s*(\d+\.\s*)?Fase\s+([A-F])\s*(\(.*|$)')
ELEM2 = re.compile(r'^\s*(\d+\.\d+)\.?\s+(\S.*)$')
ELEM1 = re.compile(r'^\s*(\d+)\.\s+([A-Z]\S*.*)$')
SECT = re.compile(r'^\s*([A-H])\.\s+(Rasional|Tujuan|Karakteristik|Capaian Pembelajaran)\s*$')
PAGENO = re.compile(r'^\s*-\s*\d+\s*-\s*$')

FASE_INFO = {
    'A': ('SD/MI', 'I–II'), 'B': ('SD/MI', 'III–IV'), 'C': ('SD/MI', 'V–VI'),
    'D': ('SMP/MTs', 'VII–IX'), 'E': ('SMA/MA', 'X'), 'F': ('SMA/MA', 'XI–XII'),
}


def clean(txt):
    t = re.sub(r'[ \t]+', ' ', txt)
    t = re.sub(r'(\w)-\n(\w)', r'\1\2', t)  # rare hyphen breaks
    out = []
    head_open = False
    for ln in t.split('\n'):
        ln = ln.strip()
        if not ln:
            continue
        msub = re.match(r'^\d+\.\d+\.\d+\.?\s+Subelemen\s+(.*)$', ln)
        if msub:
            ln = '• ' + msub.group(1).strip()
        if head_open and out and re.search(r'(\bdan|\bserta|\batau|,)$', out[-1]) and not ln.startswith(('●', '•')):
            out.append(' ' + ln)
            continue
        if ln.startswith('●') or ln.startswith('•') or re.match(r'^[a-z]\.\s', ln) or re.match(r'^\d+\)\s', ln):
            out.append('\n' + ln)
            head_open = (ln.startswith('●') or ln.startswith('•')) and len(ln) < 70 and not re.search(r'[.;:,]$', ln)
        else:
            if out and head_open and ln[:1].isupper():
                out.append(': ' + ln)
            else:
                out.append(' ' + ln if out else ln)
            head_open = False
    s = ''.join(out).strip()
    s = re.sub(r' +', ' ', s)
    s = s.replace('● ', '• ').replace('●', '• ')
    return s


def title_case_mapel(s):
    s = re.sub(r'\s+', ' ', s).strip()
    small = {'dan', 'di'}
    words = []
    for w in s.lower().split(' '):
        if w in small:
            words.append(w)
        elif w in ('(ipa)',):
            words.append('(IPA)')
        else:
            words.append(w[:1].upper() + w[1:])
    r = ' '.join(words)
    return r.replace('Jasmani,', 'Jasmani,')


# 1. locate subject headings
subjects = []
i = 0
while i < len(lines):
    pg, ln = lines[i]
    m = HEAD.match(ln)
    if m:
        name = m.group(1).strip()
        # continuation line in caps
        j = i + 1
        while j < len(lines) and re.match(r'^\s*[A-Z][A-Z ,/()\-]+$', lines[j][1]) and not SECT.match(lines[j][1]) and not HEAD.match(lines[j][1]):
            name += ' ' + lines[j][1].strip()
            j += 1
        if not subjects or subjects[-1]['raw'] != name:
            subjects.append({'raw': name, 'start': i, 'page': pg})
        i = j
        continue
    i += 1

for k, s in enumerate(subjects):
    s['end'] = subjects[k + 1]['start'] if k + 1 < len(subjects) else len(lines)

rows = []
problems = []
for s in subjects:
    seg = lines[s['start']:s['end']]
    # find "D. Capaian Pembelajaran" (letter may vary)
    cstart = None
    for idx, (pg, ln) in enumerate(seg):
        m = SECT.match(ln)
        if m and m.group(2) == 'Capaian Pembelajaran':
            cstart = idx
    if cstart is None:
        problems.append((s['raw'], 'no CP section'))
        continue
    mapel = title_case_mapel(re.sub(r'\s+CAPAIAN PEMBELAJARAN.*$', '', s['raw']))
    ELEM = ELEM2
    fase = None
    fase_note = ''
    elem = None
    buf = []
    page_of = None
    intro = []

    def flush():
        if fase and elem and buf:
            rows.append({'mapel': mapel, 'fase': fase, 'elemen': elem,
                         'cp': clean('\n'.join(buf)), 'halaman': page_of})

    for pg, ln in seg[cstart + 1:]:
        if PAGENO.match(ln) or not ln.strip():
            if buf:
                buf.append('')
            continue
        mf = FASE.match(ln)
        if mf:
            flush(); buf = []; elem = None
            fase = mf.group(2)
            ELEM = ELEM2 if mf.group(1) else ELEM1
            continue
        me = ELEM.match(ln) if fase else None
        if me and fase:
            flush(); buf = []
            elem = clean(me.group(2))
            page_of = pg
            continue
        if fase is None:
            mp = re.match(r'^\s*Pada akhir Fase\s+([A-F])\b', ln)
            if mp:
                fase = mp.group(1); ELEM = ELEM1
                continue
        if fase and elem:
            st = ln.strip()
            if not ''.join(buf).strip() and len(st) < 30 and re.match(r"^[A-Z][\w’'()\-/]*( [\w’'()\-/]+){0,2}$", st) and not elem.endswith(')'):
                elem += ' ' + st
                continue
            buf.append(ln)
        elif fase:
            intro.append((fase, ln.strip()))
    flush()
    s['mapel'] = mapel
    s['intro'] = intro

json.dump({'rows': rows, 'subjects': [{k: v for k, v in s.items() if k != 'intro'} for s in subjects],
           'intro': {s.get('mapel', s['raw']): s.get('intro', []) for s in subjects},
           'problems': problems}, open('parsed.json', 'w'), ensure_ascii=False, indent=1)
print(len(subjects), 'mapel;', len(rows), 'baris;', 'problems:', problems)

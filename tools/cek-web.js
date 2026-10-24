// Pemeriksaan statis aplikasi web (jalan di CI, tanpa browser):
//  1. semua file di daftar service worker ada, dan semua modul JS ada di daftar itu
//  2. setiap import relatif menunjuk file yang ada dan nama yang diekspor memang ada
//  3. setiap id yang dicari app.js dengan $('#…') ada di index.html
//  4. sintaks semua modul valid
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'web');
const galat = [];
const semuaFile = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? semuaFile(p) : [p]; });

// 1. daftar service worker
const sw = readFileSync(join(WEB, 'sw.js'), 'utf8');
const daftar = [...sw.matchAll(/^\s*'([^']+)',?$/gm)].map(m => m[1]).filter(f => f !== './');
for (const f of daftar) if (!existsSync(join(WEB, f))) galat.push(`sw.js menyebut ${f}, tetapi file tidak ada`);
const js = semuaFile(join(WEB, 'js')).filter(f => f.endsWith('.js'));
for (const f of js) { const r = relative(WEB, f).split('\\').join('/'); if (!daftar.includes(r)) galat.push(`${r} belum ada di daftar FILE sw.js (aplikasi offline akan rusak)`); }

// 2. import & ekspor
const ekspor = f => {
  const s = readFileSync(f, 'utf8');
  const n = new Set();
  for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) n.add(m[1]);
  for (const m of s.matchAll(/export\s*\{([^}]+)\}/g)) m[1].split(',').forEach(x => n.add(x.trim().split(/\s+as\s+/).pop()));
  return n;
};
for (const f of js) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/import\s+(?:\*\s+as\s+\w+|\{([^}]*)\})\s+from\s+'(\.[^']+)'/g)) {
    const target = resolve(dirname(f), m[2]);
    if (!existsSync(target)) { galat.push(`${relative(ROOT, f)}: import '${m[2]}' tidak ditemukan`); continue; }
    if (m[1]) {
      const ada = ekspor(target);
      for (const nama of m[1].split(',').map(x => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
        if (!ada.has(nama)) galat.push(`${relative(ROOT, f)}: '${nama}' tidak diekspor oleh ${m[2]}`);
      }
    }
  }
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { galat.push(`${relative(ROOT, f)}: sintaks salah\n${e.stderr}`); }
}

// 3. id di index.html
const html = readFileSync(join(WEB, 'index.html'), 'utf8');
const idHtml = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
for (const f of [join(WEB, 'js/app.js'), join(WEB, 'js/util.js'), join(WEB, 'js/views/cetak.js')]) {
  for (const m of readFileSync(f, 'utf8').matchAll(/\$\('#([\w-]+)'\)/g)) if (!idHtml.has(m[1])) galat.push(`${relative(ROOT, f)} mencari #${m[1]}, tetapi tidak ada di index.html`);
}
for (const v of ['beranda', 'kelas', 'kuis', 'saran', 'riwayat', 'pengaturan']) if (!idHtml.has('v-' + v)) galat.push(`index.html tidak punya section #v-${v}`);

// 4. manifest
const man = JSON.parse(readFileSync(join(WEB, 'manifest.webmanifest'), 'utf8'));
for (const i of man.icons) if (!existsSync(join(WEB, i.src))) galat.push(`ikon manifest ${i.src} tidak ada`);

if (galat.length) { console.error('Pemeriksaan web GAGAL:\n- ' + galat.join('\n- ')); process.exit(1); }
console.log(`Pemeriksaan web lulus: ${js.length} modul, ${daftar.length} file offline, ${idHtml.size} id HTML.`);

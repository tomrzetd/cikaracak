// Service worker: menyimpan seluruh aplikasi di perangkat agar tetap berjalan tanpa internet.
// Naikkan VERSI setiap kali ada file yang berubah; tools/cek-web.js memeriksa daftar ini lengkap.
const VERSI = 'cikaracak-0.1.0';
const FILE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'data/cp_2025_sd_sma.json',
  'js/app.js',
  'js/state.js',
  'js/db.js',
  'js/util.js',
  'js/gambar.js',
  'js/core/analisis.js',
  'js/core/impor.js',
  'js/core/nama.js',
  'js/core/ljk.js',
  'js/core/omr.js',
  'js/views/bersama.js',
  'js/views/beranda.js',
  'js/views/kelas.js',
  'js/views/kuis.js',
  'js/views/pilih-cp.js',
  'js/views/pindai.js',
  'js/views/tempel.js',
  'js/views/cetak.js',
  'js/views/saran.js',
  'js/views/riwayat.js',
  'js/views/pengaturan.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSI).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSI).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Utamakan salinan di perangkat; bila tidak ada, ambil dari jaringan.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});

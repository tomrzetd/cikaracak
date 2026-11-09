// Adaptor server: Supabase (GoTrue + PostgREST) lewat fetch biasa, tanpa pustaka tambahan.
// Halaman Presensi hanya memakai fungsi yang diekspor di sini, sehingga server lain (misalnya PHP + MySQL
// di hosting sekolah) cukup menyediakan modul dengan fungsi dan format jawaban yang sama.
//
// Alamat server dan kunci anon disimpan di localStorage perangkat ini. Sesi login juga, agar guru tidak
// perlu masuk ulang setiap membuka aplikasi. "Keluar" menghapus sesi.

const K_SERVER = 'cikaracak.server', K_SESI = 'cikaracak.sesi';

function baca(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }
function tulis(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* mode privat */ } }

let server = baca(K_SERVER);   // { url, anon }
let sesi = baca(K_SESI);       // { akses, segar, sampai, pengguna: { id, email } }

export const pengaturan = () => (server ? { ...server } : null);
export const terhubung = () => !!(server?.url && server?.anon);
export const masukSebagai = () => sesi?.pengguna || null;

export function aturServer(url, anon) {
  url = String(url || '').trim().replace(/\/+$/, '');
  anon = String(anon || '').trim();
  if (!/^https?:\/\/[^\s/]+/.test(url)) throw new Error('Alamat server harus diawali https://');
  if (!anon) throw new Error('Kunci anon wajib diisi');
  if (server?.url !== url) { sesi = null; tulis(K_SESI, null); }
  server = { url, anon };
  tulis(K_SERVER, server);
}

export function lupakanServer() { server = null; sesi = null; tulis(K_SERVER, null); tulis(K_SESI, null); }

function kepala(pakaiSesi = true, tambahan = {}) {
  const h = { apikey: server.anon, 'Content-Type': 'application/json', ...tambahan };
  if (pakaiSesi && sesi?.akses) h.Authorization = 'Bearer ' + sesi.akses;
  else if (server.anon.startsWith('eyJ')) h.Authorization = 'Bearer ' + server.anon;   // kunci anon lama (JWT)
  return h;
}

async function pesanGalat(r) {
  let j = null;
  try { j = await r.json(); } catch { /* bukan JSON */ }
  const m = j?.msg || j?.error_description || j?.message || j?.error || `HTTP ${r.status}`;
  const e = new Error(terjemah(m, r.status));
  e.status = r.status; e.kode = j?.code || j?.error_code;
  return e;
}

function terjemah(m, status) {
  if (/Invalid login credentials/i.test(m)) return 'NIP/PegID atau kata sandi salah';
  if (/should be different|same_password/i.test(m)) return 'Sandi baru harus berbeda dari sandi lama';
  if (/Password should be at least|weak_password/i.test(m)) return 'Sandi terlalu lemah: minimal 8 karakter, campur huruf dan angka';
  if (/Email not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Buka tautan konfirmasi di email, atau minta admin Supabase mengonfirmasi.';
  if (/JWT expired/i.test(m)) return 'Sesi berakhir, silakan masuk lagi';
  if (status === 404 && /function|Could not find/i.test(m)) return 'Fungsi presensi belum ada di server. Jalankan migrasi supabase/migrations terlebih dahulu.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Tidak bisa menghubungi server. Periksa internet dan alamat server.';
  return m;
}

async function ambil(jalur, opsi = {}) {
  if (!terhubung()) throw new Error('Server belum diatur');
  let r;
  try { r = await fetch(server.url + jalur, opsi); }
  catch (e) { throw new Error(terjemah(e.message)); }
  return r;
}

function simpanSesi(j) {
  sesi = { akses: j.access_token, segar: j.refresh_token, sampai: Date.now() + (j.expires_in || 3600) * 1000, pengguna: { id: j.user?.id, email: j.user?.email } };
  tulis(K_SESI, sesi);
}

// Pegawai masuk dengan NIP/PegID; akunnya di Supabase memakai email buatan <id>@pegawai.cikaracak.invalid
// (lihat atur_akun di migrasi pegawai). Operator lama tetap bisa masuk dengan email.
export const DOMAIN_PEGAWAI = 'pegawai.cikaracak.invalid';
export const emailDariId = id => (id.includes('@') ? id.trim() : `${id.trim().toLowerCase()}@${DOMAIN_PEGAWAI}`);
export const idDariEmail = e => (e || '').endsWith('@' + DOMAIN_PEGAWAI) ? e.split('@')[0] : e;

export async function masuk(idAtauEmail, sandi) {
  const r = await ambil('/auth/v1/token?grant_type=password', { method: 'POST', headers: kepala(false), body: JSON.stringify({ email: emailDariId(idAtauEmail), password: sandi }) });
  if (!r.ok) throw await pesanGalat(r);
  simpanSesi(await r.json());
  return sesi.pengguna;
}

export async function gantiSandi(baru) {
  await pastikanSesi();
  const r = await ambil('/auth/v1/user', { method: 'PUT', headers: kepala(), body: JSON.stringify({ password: baru }) });
  if (!r.ok) throw await pesanGalat(r);
}

export async function keluar() {
  if (sesi?.akses && terhubung()) { try { await ambil('/auth/v1/logout', { method: 'POST', headers: kepala() }); } catch { /* tetap keluar */ } }
  sesi = null; tulis(K_SESI, null);
}

async function pastikanSesi() {
  if (!sesi?.akses || Date.now() < sesi.sampai - 60000) return;
  const r = await ambil('/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: kepala(false), body: JSON.stringify({ refresh_token: sesi.segar }) });
  if (!r.ok) { sesi = null; tulis(K_SESI, null); throw new Error('Sesi berakhir, silakan masuk lagi'); }
  simpanSesi(await r.json());
}

async function minta(jalur, { method = 'GET', body, prefer, anon = false } = {}) {
  if (!anon) await pastikanSesi();
  const h = kepala(!anon, prefer ? { Prefer: prefer } : {});
  const r = await ambil('/rest/v1' + jalur, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.status === 401 && sesi && !anon) { sesi = null; tulis(K_SESI, null); }
  if (!r.ok) throw await pesanGalat(r);
  if (r.status === 204) return null;
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

/** Panggil fungsi server. { anon: true } = tanpa sesi, seperti alat presensi. */
export const rpc = (nama, args = {}, { anon = false } = {}) => minta('/rpc/' + nama, { method: 'POST', body: args, anon });

const q = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

/** Baca tabel. filter memakai sintaks PostgREST, mis. { id: 'eq.123', order: 'nama' }. */
export const daftar = (tabel, select = '*', filter = {}) => minta(`/${tabel}?${q({ select, ...filter })}`);
export const tambah = (tabel, baris, { gabung = false } = {}) =>
  minta(`/${tabel}`, { method: 'POST', body: baris, prefer: 'return=representation' + (gabung ? ',resolution=merge-duplicates' : '') });
export const ubah = (tabel, filter, isian) => minta(`/${tabel}?${q(filter)}`, { method: 'PATCH', body: isian, prefer: 'return=representation' });
export const hapus = (tabel, filter) => minta(`/${tabel}?${q(filter)}`, { method: 'DELETE' });

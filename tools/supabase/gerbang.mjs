// "Gerbang" tiruan Supabase untuk uji dan demo lokal (BUKAN untuk produksi):
//   /auth/v1/token, /auth/v1/logout, /auth/v1/user  -> login email+sandi dengan akun dari variabel AKUN
//   /rest/v1/*                                      -> diteruskan ke PostgREST
// Token dibuat dengan HS256 memakai RAHASIA yang sama dengan PGRST_JWT_SECRET, seperti Supabase.
//
//   RAHASIA=... AKUN='[{"email":"a@b","sandi":"x","id":"uuid"}]' PGRST=http://127.0.0.1:3000 node tools/supabase/gerbang.mjs 54321
import { createServer, request } from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';

const PORT = Number(process.argv[2]) || 54321;
const RAHASIA = process.env.RAHASIA;
const PGRST = new URL(process.env.PGRST || 'http://127.0.0.1:3000');
const AKUN = JSON.parse(process.env.AKUN || '[]');
if (!RAHASIA || RAHASIA.length < 32) { console.error('RAHASIA minimal 32 karakter'); process.exit(1); }

const b64 = x => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
function jwt(isi) {
  const kepala = b64({ alg: 'HS256', typ: 'JWT' }), badan = b64(isi);
  return `${kepala}.${badan}.${createHmac('sha256', RAHASIA).update(`${kepala}.${badan}`).digest('base64url')}`;
}
export const ANON = jwt({ role: 'anon', iss: 'cikaracak-uji', iat: 1700000000, exp: 4102444800 });
const segar = new Map();   // refresh token -> akun

function token(a) {
  const r = randomBytes(18).toString('base64url');
  segar.set(r, a);
  const kini = Math.floor(Date.now() / 1000);
  return { access_token: jwt({ sub: a.id, email: a.email, role: 'authenticated', aud: 'authenticated', iat: kini, exp: kini + 3600 }),
           token_type: 'bearer', expires_in: 3600, refresh_token: r, user: { id: a.id, email: a.email } };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, prefer, x-client-info, accept-profile, content-profile, range',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'content-range',
};
const kirim = (res, kode, isi) => { res.writeHead(kode, { ...CORS, 'Content-Type': 'application/json' }); res.end(isi === undefined ? '' : JSON.stringify(isi)); };
const badan = req => new Promise(ok => { let s = ''; req.on('data', c => { s += c; }); req.on('end', () => ok(s)); });

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }

  if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
    let j = {}; try { j = JSON.parse(await badan(req) || '{}'); } catch { /* kosong */ }
    if (url.searchParams.get('grant_type') === 'password') {
      const a = AKUN.find(x => x.email.toLowerCase() === String(j.email || '').toLowerCase() && x.sandi === j.password);
      return a ? kirim(res, 200, token(a)) : kirim(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    }
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      const a = segar.get(j.refresh_token);
      if (!a) return kirim(res, 400, { code: 400, msg: 'Invalid Refresh Token' });
      segar.delete(j.refresh_token);
      return kirim(res, 200, token(a));
    }
    return kirim(res, 400, { msg: 'grant_type tidak dikenal' });
  }
  if (url.pathname === '/auth/v1/logout') return kirim(res, 204);

  if (url.pathname.startsWith('/rest/v1/')) {
    const h = { ...req.headers };
    delete h.host; delete h.origin; delete h.referer;
    if (!h.authorization && h.apikey) h.authorization = 'Bearer ' + h.apikey;
    const ke = request({ hostname: PGRST.hostname, port: PGRST.port, method: req.method, path: url.pathname.slice('/rest/v1'.length) + url.search, headers: h }, r => {
      const kepala = { ...r.headers, ...CORS };
      res.writeHead(r.statusCode, kepala);
      r.pipe(res);
    });
    ke.on('error', e => kirim(res, 502, { message: 'PostgREST tidak bisa dihubungi: ' + e.message }));
    req.pipe(ke);
    return;
  }
  kirim(res, 404, { message: 'Tidak ditemukan' });
}).listen(PORT, '127.0.0.1', () => console.log(`gerbang siap http://127.0.0.1:${PORT}\nANON=${ANON}`));

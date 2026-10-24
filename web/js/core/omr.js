// Pemindai LJK (OMR) murni JavaScript, tanpa pustaka luar dan tanpa jaringan.
// Masukan: citra skala abu-abu {w, h, data: Uint8Array|Uint8ClampedArray} dan tata letak dari ljk.js.
// Langkah: (1) cari 4 penanda sudut, (2) hitung homografi mm→piksel,
// (3) ukur kegelapan setiap bulatan dibanding cincin kertas di sekitarnya, (4) putuskan jawaban per baris.

export const AMBANG = Object.freeze({ isi: 0.30, ragu: 0.16, selisih: 0.18 });

/** Ubah ImageData RGBA (dari canvas) menjadi abu-abu. */
export function keAbu(imageData) {
  const { width: w, height: h, data } = imageData;
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
  return { w, h, data: g };
}

/** Perkecil citra dengan rata-rata kotak, faktor bulat. */
export function perkecil(img, f) {
  if (f <= 1) return img;
  const w = Math.floor(img.w / f), h = Math.floor(img.h / f), out = new Uint8Array(w * h), n = f * f;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let dy = 0; dy < f; dy++) { const row = (y * f + dy) * img.w + x * f; for (let dx = 0; dx < f; dx++) s += img.data[row + dx]; }
    out[y * w + x] = s / n;
  }
  return { w, h, data: out };
}

/** Ambang adaptif (Bradley): piksel gelap bila lebih gelap dari rata-rata lokal. */
function ambangAdaptif(img, jendela, t = 0.18) {
  const { w, h, data } = img;
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) { row += data[(y - 1) * w + x - 1]; I[y * (w + 1) + x] = I[(y - 1) * (w + 1) + x] + row; }
  }
  const m = new Uint8Array(w * h), s2 = Math.max(1, jendela >> 1);
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - s2), y2 = Math.min(h - 1, y + s2);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - s2), x2 = Math.min(w - 1, x + s2);
      const n = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum = I[(y2 + 1) * (w + 1) + x2 + 1] - I[y1 * (w + 1) + x2 + 1] - I[(y2 + 1) * (w + 1) + x1] + I[y1 * (w + 1) + x1];
      m[y * w + x] = data[y * w + x] * n < sum * (1 - t) ? 1 : 0;
    }
  }
  return m;
}

/** Komponen terhubung (8 tetangga) pada topeng biner. */
function komponen(mask, w, h) {
  const lab = new Int32Array(w * h), comps = [], stack = new Int32Array(w * h);
  let id = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || lab[i]) continue;
    id++;
    let sp = 0, area = 0, sx = 0, sy = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    stack[sp++] = i; lab[i] = id;
    while (sp) {
      const p = stack[--sp], x = p % w, y = (p - x) / w;
      area++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (mask[q] && !lab[q]) { lab[q] = id; stack[sp++] = q; }
        }
      }
    }
    comps.push({ area, cx: sx / area, cy: sy / area, x0, x1, y0, y1, bw: x1 - x0 + 1, bh: y1 - y0 + 1 });
  }
  return comps;
}

/** Cari 4 penanda sudut. Mengembalikan pusatnya [TL, TR, BL, BR] dalam piksel citra asli, atau null. */
export function cariPenanda(img) {
  const f = Math.max(1, Math.round(Math.max(img.w, img.h) / 900));
  const kecil = perkecil(img, f);
  const mask = ambangAdaptif(kecil, Math.round(Math.max(kecil.w, kecil.h) / 8));
  const comps = komponen(mask, kecil.w, kecil.h);
  const minSisi = Math.min(kecil.w, kecil.h) * 0.018, maksSisi = Math.min(kecil.w, kecil.h) * 0.12;
  // Isi ≥ 0,6: kotak yang miring/buram tidak lagi memenuhi bingkainya (miring 8° ≈ 0,78).
  let kandidat = comps.filter(c => {
    const asp = c.bw / c.bh, isi = c.area / (c.bw * c.bh);
    return c.bw >= minSisi && c.bh >= minSisi && c.bw <= maksSisi && c.bh <= maksSisi && asp > 0.6 && asp < 1.66 && isi > 0.6;
  });
  if (kandidat.length < 4) return null;
  // Penanda (9 mm) jauh lebih besar dari bulatan terisi (5,2 mm): buang yang kurang dari separuh luas penanda ke-4 terbesar.
  const luasUrut = kandidat.map(c => c.area).sort((a, b) => b - a);
  kandidat = kandidat.filter(c => c.area >= luasUrut[3] * 0.5);
  // Pilih penanda paling pojok, lalu pastikan ukurannya serupa
  const pilih = fn => kandidat.reduce((a, b) => (fn(b) > fn(a) ? b : a));
  const TL = pilih(c => -(c.cx + c.cy)), BR = pilih(c => c.cx + c.cy), TR = pilih(c => c.cx - c.cy), BL = pilih(c => c.cy - c.cx);
  const empat = [TL, TR, BL, BR];
  if (new Set(empat).size < 4) return null;
  const luas = empat.map(c => c.area), rasio = Math.max(...luas) / Math.min(...luas);
  if (rasio > 3.5) return null;
  return empat.map(c => ({ x: (c.cx + 0.5) * f - 0.5, y: (c.cy + 0.5) * f - 0.5, sisi: Math.sqrt(c.area) * f }));
}

/** Homografi 4 titik: memetakan src[i] → dst[i]. Mengembalikan fungsi (x,y) → [u,v]. */
export function homografi(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  // Eliminasi Gauss dengan pivot parsial
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    if (Math.abs(A[c][c]) < 1e-12) throw new Error('Penanda sudut segaris; foto ulang lembar dengan lurus.');
    for (let r = c + 1; r < 8; r++) {
      const k = A[r][c] / A[c][c];
      for (let cc = c; cc < 8; cc++) A[r][cc] -= k * A[c][cc];
      b[r] -= k * b[c];
    }
  }
  const h = new Array(8);
  for (let r = 7; r >= 0; r--) { let s = b[r]; for (let c = r + 1; c < 8; c++) s -= A[r][c] * h[c]; h[r] = s / A[r][r]; }
  return (x, y) => {
    const d = h[6] * x + h[7] * y + 1;
    return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d];
  };
}

function baca(img, x, y) {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= img.w || yi >= img.h) return 255;
  return img.data[yi * img.w + xi];
}

// Titik sampel (dalam mm, relatif pusat): cakram dalam dan cincin kertas di luar garis bulatan
function titikSampel(r) {
  const dalam = [[0, 0]], cincin = [];
  for (const [rad, n] of [[0.3 * r, 6], [0.55 * r, 12]]) for (let k = 0; k < n; k++) { const a = (2 * Math.PI * k) / n; dalam.push([rad * Math.cos(a), rad * Math.sin(a)]); }
  for (const rad of [1.4 * r, 1.65 * r]) for (let k = 0; k < 16; k++) { const a = (2 * Math.PI * k) / 16 + 0.2; cincin.push([rad * Math.cos(a), rad * Math.sin(a)]); }
  return { dalam, cincin };
}

/** Skor kegelapan satu bulatan: 0 = sama dengan kertas di sekitarnya, 1 = hitam pekat. */
function skorBulatan(img, H, b, T) {
  const rata = pts => {
    const v = pts.map(([dx, dy]) => { const [u, w] = H(b.x + dx, b.y + dy); return baca(img, u, w); });
    v.sort((a, c) => a - c);
    const buang = Math.floor(v.length * 0.15); // buang ekstrem (huruf cetak samar, noda)
    const inti = v.slice(buang, v.length - buang);
    return inti.reduce((a, c) => a + c, 0) / inti.length;
  };
  const kertas = rata(T.cincin), isi = rata(T.dalam);
  return Math.max(0, Math.min(1, (kertas - isi) / Math.max(kertas, 40)));
}

/** Putuskan satu kelompok bulatan (satu soal, atau satu kolom digit). */
export function putuskan(skor, A = AMBANG) {
  const urut = skor.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
  const [s1, i1] = urut[0], s2 = urut[1] ? urut[1][0] : 0;
  if (s1 < A.ragu) return { pilihan: null, status: 'kosong' };
  // Dua bulatan sama-sama terarsir tebal → ganda, kecuali yang kedua jelas jauh lebih tipis (bekas hapusan)
  if (s2 >= A.isi && s2 * 2 > s1) return { pilihan: null, status: 'ganda' };
  if (s1 >= A.isi && s1 - s2 >= A.selisih) return { pilihan: i1, status: s2 >= A.ragu ? 'ragu' : 'yakin' };
  return { pilihan: i1, status: 'ragu' };
}

/**
 * Pindai satu lembar.
 * @returns {{ok:boolean, pesan?:string, kode:string|null, absen:number|null, jawaban:(string|null)[],
 *   status:string[], ragu:number[], ganda:number[], kosong:number[], penanda?:object[]}}
 */
export function pindai(img, L, A = AMBANG) {
  const pen = cariPenanda(img);
  if (!pen) return { ok: false, pesan: 'Keempat kotak hitam di sudut lembar tidak terlihat. Foto ulang seluruh lembar di tempat terang, tanpa terpotong.' };
  let H;
  try { H = homografi(L.penanda.map(p => [p.cx, p.cy]), pen.map(p => [p.x, p.y])); }
  catch (e) { return { ok: false, pesan: e.message }; }
  // Pemeriksaan kewajaran: ukuran penanda hasil pemetaan vs terdeteksi
  const skala = Math.hypot(...H(L.penanda[1].cx, L.penanda[1].cy).map((v, i) => v - H(L.penanda[0].cx, L.penanda[0].cy)[i])) / (L.penanda[1].cx - L.penanda[0].cx);
  const sisiDuga = L.penanda[0].sisi * skala, sisiNyata = pen[0].sisi;
  if (sisiNyata < sisiDuga * 0.4 || sisiNyata > sisiDuga * 2.2) return { ok: false, pesan: 'Kotak sudut tidak sesuai ukuran lembar. Pastikan yang difoto adalah LJK dari aplikasi ini.' };
  if (skala * L.r < 3) return { ok: false, pesan: 'Foto terlalu kecil atau terlalu jauh. Dekatkan kamera sampai lembar memenuhi layar.' };

  const T = titikSampel(L.r);
  const digit = blok => {
    let s = '', yakin = true;
    for (const kol of blok) {
      const d = putuskan(kol.bulatan.map(b => skorBulatan(img, H, b, T)), A);
      if (d.pilihan === null) return { nilai: null, yakin: false };
      if (d.status !== 'yakin') yakin = false;
      s += kol.bulatan[d.pilihan].nilai;
    }
    return { nilai: s, yakin };
  };
  const kode = digit(L.kode), absen = digit(L.absen);
  const jawaban = [], status = [], ragu = [], ganda = [], kosong = [], skorSoal = [];
  for (const s of L.soal) {
    const sk = s.bulatan.map(b => skorBulatan(img, H, b, T));
    const d = putuskan(sk, A);
    skorSoal.push(sk.map(v => Math.round(v * 100) / 100));
    jawaban.push(d.pilihan === null ? null : s.bulatan[d.pilihan].nilai);
    status.push(d.status);
    if (d.status === 'ragu') ragu.push(s.no);
    if (d.status === 'ganda') ganda.push(s.no);
    if (d.status === 'kosong') kosong.push(s.no);
  }
  const noAbsen = absen.nilai === null ? null : Number(absen.nilai);
  return {
    ok: true, kode: kode.nilai, kodeYakin: kode.yakin, absen: noAbsen || null, absenYakin: absen.yakin,
    jawaban, status, ragu, ganda, kosong, skor: skorSoal, penanda: pen,
  };
}

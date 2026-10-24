// Template Lembar Jawaban (LJK mini) A4 dan tata letaknya dalam milimeter.
// Tata letak ini dipakai bersama oleh pencetak (renderSVG) dan pemindai (omr.js),
// jadi perubahan apa pun di sini WAJIB menaikkan VERSI dan memperbarui fixture tes.

export const VERSI = 'ljk-a4-v1';
export const MAKS_SOAL = 40;

const A4 = { lebar: 210, tinggi: 297 };
const R = 2.6;            // jari-jari bulatan (diameter 5,2 mm)
const PITCH_X = 8;        // jarak antarpusat bulatan mendatar
const PITCH_Y = 8.2;      // jarak antarbaris
const Y0 = 66;            // baris pertama bulatan
const PENANDA = 9;        // sisi penanda sudut
const POS_PENANDA = [[8, 8], [193, 8], [8, 280], [193, 280]]; // pojok kiri-atas tiap penanda: TL, TR, BL, BR

/** Huruf pilihan untuk satu soal. */
export function hurufOpsi(soal) {
  if ((soal.jenis || 'pg') === 'bs') return ['B', 'S'];
  const n = Math.min(5, Math.max(2, soal.opsi || 5));
  return ['A', 'B', 'C', 'D', 'E'].slice(0, n);
}

/** Kode kuis 3 digit yang stabil dari id kuis (untuk memastikan lembar milik kuis yang benar). */
export function kodeKuis(id) {
  let h = 2166136261;
  for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return String((h >>> 0) % 1000).padStart(3, '0');
}

/**
 * Hitung tata letak lembar.
 * @param {{jenis?:'pg'|'bs', opsi?:number}[]} soal maksimal 40 soal
 */
export function tataLetak(soal) {
  if (!Array.isArray(soal) || soal.length < 1) throw new Error('Kuis belum punya soal.');
  if (soal.length > MAKS_SOAL) throw new Error(`Satu lembar memuat maksimal ${MAKS_SOAL} soal.`);
  const penanda = POS_PENANDA.map(([x, y]) => ({ x, y, sisi: PENANDA, cx: x + PENANDA / 2, cy: y + PENANDA / 2 }));
  const digitKolom = (x0, n, nama) => Array.from({ length: n }, (_, c) => ({
    nama, kolom: c,
    bulatan: Array.from({ length: 10 }, (_, d) => ({ nilai: String(d), x: x0 + c * PITCH_X, y: Y0 + d * PITCH_Y })),
  }));
  const kode = digitKolom(24, 3, 'kode');
  const absen = digitKolom(56, 2, 'absen');
  const butir = soal.map((s, i) => {
    const kol = i < 20 ? 0 : 1, baris = i % 20;
    const xLabel = kol === 0 ? 82 : 140;
    const y = Y0 + baris * PITCH_Y;
    return {
      no: i + 1, jenis: s.jenis || 'pg', xLabel, y,
      bulatan: hurufOpsi(s).map((h, k) => ({ nilai: h, x: xLabel + 8 + k * PITCH_X, y })),
    };
  });
  return { versi: VERSI, ...A4, r: R, penanda, kode, absen, soal: butir };
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Gambar satu lembar sebagai SVG berukuran A4 (satuan mm).
 * @param {object} L hasil tataLetak()
 * @param {{judul?:string, topik?:string, kelas?:string, kode?:string, nama?:string, absen?:number, tanggal?:string}} info
 *   Bila `absen` diisi, bulatan nomor absen dicetak terisi dan nama dicetak (lembar per siswa).
 */
export function renderSVG(L, info = {}) {
  const kode = String(info.kode || '000').padStart(3, '0');
  const absen = info.absen ? String(info.absen).padStart(2, '0') : null;
  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${L.lebar}mm" height="${L.tinggi}mm" viewBox="0 0 ${L.lebar} ${L.tinggi}" font-family="Arial, Helvetica, sans-serif">`);
  o.push(`<rect width="${L.lebar}" height="${L.tinggi}" fill="#fff"/>`);
  for (const p of L.penanda) o.push(`<rect x="${p.x}" y="${p.y}" width="${p.sisi}" height="${p.sisi}" fill="#000"/>`);
  // Kepala lembar
  o.push(`<text x="22" y="16" font-size="4.6" font-weight="700">${esc(info.judul || 'LEMBAR JAWABAN KUIS')}</text>`);
  o.push(`<text x="22" y="21.5" font-size="3">${esc(info.topik || '')}${info.kelas ? ' · ' + esc(info.kelas) : ''}${info.tanggal ? ' · ' + esc(info.tanggal) : ''}</text>`);
  o.push(`<text x="22" y="30" font-size="3.4">Nama:</text>`);
  if (info.nama) o.push(`<text x="34" y="30" font-size="3.6" font-weight="700">${esc(info.nama)}</text>`);
  else o.push(`<line x1="34" y1="30.6" x2="120" y2="30.6" stroke="#000" stroke-width="0.25"/>`);
  o.push(`<text x="126" y="30" font-size="3.4">Kelas:</text><line x1="138" y1="30.6" x2="186" y2="30.6" stroke="#000" stroke-width="0.25"/>`);
  if (info.kelas) o.push(`<text x="139" y="30" font-size="3.4">${esc(info.kelas)}</text>`);
  o.push(`<text x="22" y="38" font-size="2.8" fill="#333">Arsir penuh satu bulatan untuk setiap soal dengan pensil 2B atau pulpen hitam. Jangan mencoret di luar bulatan.</text>`);
  o.push(`<text x="22" y="42" font-size="2.8" fill="#333">Untuk mengganti jawaban, hapus bersih arsiran lama. Jangan melipat lembar ini.</text>`);
  // Blok identitas
  o.push(`<text x="20" y="51" font-size="3" font-weight="700">KODE KUIS</text><text x="52" y="51" font-size="3" font-weight="700">NO. ABSEN</text>`);
  const kotak = (blok, nilai) => blok.forEach((k, c) => {
    const x = k.bulatan[0].x;
    o.push(`<rect x="${x - 3.2}" y="${53.5}" width="6.4" height="6.4" fill="none" stroke="#000" stroke-width="0.25"/>`);
    if (nilai) o.push(`<text x="${x}" y="58.3" font-size="4" text-anchor="middle" font-weight="700">${nilai[c]}</text>`);
  });
  kotak(L.kode, kode); kotak(L.absen, absen);
  const bulat = (b, isi) => {
    o.push(`<circle cx="${b.x}" cy="${b.y}" r="${L.r}" fill="${isi ? '#000' : 'none'}" stroke="#8a8a8a" stroke-width="0.3"/>`);
    if (!isi) o.push(`<text x="${b.x}" y="${b.y + 1}" font-size="2.7" text-anchor="middle" fill="#b5b5b5">${b.nilai}</text>`);
  };
  L.kode.forEach((k, c) => k.bulatan.forEach(b => bulat(b, b.nilai === kode[c])));
  L.absen.forEach((k, c) => k.bulatan.forEach(b => bulat(b, absen && b.nilai === absen[c])));
  // Soal
  o.push(`<text x="80" y="51" font-size="3" font-weight="700">JAWABAN</text>`);
  for (const s of L.soal) {
    o.push(`<text x="${s.xLabel + 2.2}" y="${s.y + 1.2}" font-size="3.2" text-anchor="end" font-weight="700">${s.no}.</text>`);
    s.bulatan.forEach(b => bulat(b, false));
  }
  // Kaki lembar
  const yKaki = Math.max(...L.soal.map(s => s.y), ...L.kode[0].bulatan.map(b => b.y)) + 12;
  o.push(`<text x="22" y="${yKaki}" font-size="2.8" fill="#333">Contoh benar:</text><circle cx="45" cy="${yKaki - 1}" r="${L.r}" fill="#000"/>`);
  o.push(`<text x="54" y="${yKaki}" font-size="2.8" fill="#333">Contoh salah:</text><circle cx="76" cy="${yKaki - 1}" r="${L.r}" fill="none" stroke="#8a8a8a" stroke-width="0.3"/><path d="M73.8 ${yKaki - 3.2}l4.4 4.4m0 -4.4l-4.4 4.4" stroke="#000" stroke-width="0.6"/>`);
  o.push(`<text x="105" y="${L.tinggi - 9.5}" font-size="2.4" text-anchor="middle" fill="#666">Cikaracak · ${L.versi} · kode ${kode}</text>`);
  o.push('</svg>');
  return o.join('');
}

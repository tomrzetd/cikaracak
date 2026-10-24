// Impor tabel dari Google Form / Google Sheets / Excel (salin-tempel) dan dari file CSV.
// Modul murni.

/** Tebak pemisah kolom dari baris pertama: tab, titik koma, atau koma. */
export function tebakPemisah(teks) {
  const baris = teks.split(/\r?\n/).find(l => l.trim()) || '';
  if (baris.includes('\t')) return '\t';
  const sc = (baris.match(/;/g) || []).length, c = (baris.match(/,/g) || []).length;
  return sc > c ? ';' : ',';
}

/** Parser CSV/TSV yang menangani tanda kutip, "" di dalam kutip, dan baris baru di dalam kutip. */
export function parseTabel(teks, pemisah = tebakPemisah(teks)) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < teks.length; i++) {
    const ch = teks[i];
    if (q) {
      if (ch === '"') { if (teks[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
      continue;
    }
    if (ch === '"' && cur.trim() === '') { q = true; cur = ''; continue; }
    if (ch === pemisah) { row.push(cur.trim()); cur = ''; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && teks[i + 1] === '\n') i++;
      row.push(cur.trim()); cur = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
      continue;
    }
    cur += ch;
  }
  row.push(cur.trim());
  if (row.some(x => x !== '')) rows.push(row);
  return rows;
}

/** Ubah teks kunci jawaban jadi daftar: "ABCDA" / "A B C" / "A,B,C" / "Paru-paru, Hidung" */
export function parseKunci(s) {
  s = String(s || '').trim();
  if (!s) return [];
  if (s.includes(',') || s.includes(';')) return s.split(/[,;]/).map(x => x.trim());
  if (/^[A-Ea-eBbSs\s]+$/.test(s)) return [...s.replace(/\s+/g, '')].map(x => x.toUpperCase());
  return s.split(/\s+/);
}

const KOLOM_ABAIKAN = /(timestamp|stempel waktu|cap waktu|e-?mail|alamat|skor|score|nilai|kelas|nisn|\bnis\b|absen|jumlah|total)/i;
const BENAR = new Set(['1', 'b', 'benar', 'v', 'true', 'ya', '✓', '✔']);
const SALAH = new Set(['0', 's', 'salah', 'x', 'false', 'tidak', '✗', '✘']);

/**
 * Nilai satu sel.
 * Tanpa kunci: penanda benar/salah (1, B, benar, ✓ / 0, S, salah, ✗) jadi 1/0.
 * Dengan kunci: huruf dan teks dibiarkan apa adanya (huruf "B" adalah pilihan B, bukan "Benar"),
 * kecuali tanda centang/silang yang tidak mungkin berupa pilihan.
 */
export function nilaiSel(v, adaKunci = false) {
  const t = String(v ?? '').trim();
  if (!t) return null;
  const l = t.toLowerCase();
  if (!adaKunci && BENAR.has(l)) return 1;
  if (!adaKunci && SALAH.has(l)) return 0;
  if (/^[✓✔]$/.test(t)) return 1;
  if (/^[✗✘]$/.test(t)) return 0;
  const huruf = t.match(/^([A-Ea-e])(?:[.)]\s+|\s*$)/);
  if (huruf) return huruf[1].toUpperCase();
  return t;
}

/**
 * Baca tabel respons kuis.
 * @returns {{jumlahSoal:number, baris:{nama:string, isian:(string|number|null)[]}[], kolomSoal:string[], peringatan:string[]}}
 */
export function bacaRespons(teks, { adaKunci = false } = {}) {
  const rows = parseTabel(teks);
  const peringatan = [];
  if (!rows.length) return { jumlahSoal: 0, baris: [], kolomSoal: [], peringatan: ['Tabel kosong.'] };
  const head = rows[0].map(h => h.toLowerCase());
  const adaJudul = head.some(h => /nama|name|timestamp|stempel|email|soal|no\.?\s*\d/.test(h));
  let kolNama = head.findIndex(h => /^(nama|name)\b/.test(h) || h === 'nama lengkap' || h === 'nama siswa');
  if (kolNama < 0) kolNama = 0;
  const kolSoal = rows[0].map((_, i) => i).filter(i => i !== kolNama && !(adaJudul && KOLOM_ABAIKAN.test(head[i])));
  const data = adaJudul ? rows.slice(1) : rows;
  const baris = data.filter(r => (r[kolNama] || '').trim()).map(r => ({
    nama: r[kolNama].trim(),
    isian: kolSoal.map(c => nilaiSel(r[c], adaKunci)),
  }));
  if (!kolSoal.length) peringatan.push('Kolom jawaban tidak ditemukan.');
  const teksBebas = baris.reduce((a, b) => a + b.isian.filter(v => typeof v === 'string' && v.length > 1).length, 0);
  if (teksBebas) peringatan.push(`${teksBebas} isian berupa teks; pastikan kunci jawaban diisi dengan teks yang sama persis.`);
  return { jumlahSoal: kolSoal.length, baris, kolomSoal: kolSoal.map(i => rows[0][i]), peringatan };
}

/** Ubah baris daftar siswa (satu nama per baris, atau tabel dengan kolom Nama). */
export function bacaDaftarSiswa(teks) {
  const rows = parseTabel(teks);
  if (!rows.length) return [];
  const head = rows[0].map(h => h.toLowerCase());
  const kol = head.findIndex(h => /^(nama|name)/.test(h));
  if (kol >= 0) return rows.slice(1).map(r => (r[kol] || '').trim()).filter(Boolean);
  if (rows.every(r => r.length === 1)) return rows.map(r => r[0].trim()).filter(Boolean);
  // tabel tanpa judul: ambil kolom terpanjang rata-rata (biasanya nama)
  const lebar = Math.max(...rows.map(r => r.length));
  let best = 0, bestLen = -1;
  for (let c = 0; c < lebar; c++) {
    const len = rows.reduce((a, r) => a + (/[a-z]/i.test(r[c] || '') ? (r[c] || '').length : 0), 0);
    if (len > bestLen) { best = c; bestLen = len; }
  }
  return rows.map(r => (r[best] || '').trim()).filter(Boolean);
}

/** Buat CSV dari array baris (dengan kutip bila perlu). */
export function keCSV(rows) {
  const q = v => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map(r => r.map(q).join(',')).join('\n');
}

// Data aplikasi dan operasi terhadapnya. Penyimpanan lewat adapter (IndexedDB di browser,
// memori saat tes), jadi modul ini bisa diuji di Node.
import { BATAS_BAWAAN } from './core/analisis.js';

export const VERSI_DATA = 1;

export const uid = (awalan = 'x') => awalan + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const hariIni = () => new Date().toISOString().slice(0, 10);

export function dataKosong() {
  return { versi: VERSI_DATA, guru: { nama: '' }, rombel: [], kuis: [], aktif: { rombelId: null, kuisId: null }, fotoIzin: false, contoh: false };
}

/** Data contoh untuk dicoba pertama kali (ditandai `contoh: true`). */
export function dataContoh() {
  const d = dataKosong();
  d.contoh = true;
  d.guru.nama = 'Bu Guru IPA';
  const nama = ['Adit', 'Bella', 'Cahya', 'Dewi', 'Fajar', 'Gilang', 'Hana', 'Intan', 'Jajang', 'Kiki', 'Lutfi', 'Nisa'];
  const r = { id: 'r-contoh', nama: 'VIII-B (contoh)', siswa: nama.map((n, i) => ({ id: 'c' + (i + 1), nama: n, aktif: true })) };
  d.rombel.push(r);
  const konsep = [
    ['k1', 'Organ pernapasan', 'Peserta didik dapat mengidentifikasi organ pernapasan manusia dan fungsinya.'],
    ['k2', 'Mekanisme inspirasi–ekspirasi', 'Peserta didik dapat menjelaskan mekanisme pernapasan dada dan perut.'],
    ['k3', 'Pertukaran gas di alveolus', 'Peserta didik dapat menjelaskan proses difusi gas di alveolus.'],
    ['k4', 'Gangguan pernapasan', 'Peserta didik dapat menganalisis gangguan sistem pernapasan dan pencegahannya.'],
  ].map(([id, n, tp]) => ({ id, nama: n, tp }));
  const peta = ['k1', 'k1', 'k1', 'k2', 'k2', 'k2', 'k3', 'k3', 'k4', 'k4'];
  const kunci = 'BCADBACDAB';
  const pola = ['1111101110', '1110101010', '1111111111', '1100000110', '1111001110', '1010011011', '1111101110', '1111011110', '1000000010', '1110101110', '0111001011', '1110111110'];
  const salahDari = k => ({ A: 'B', B: 'C', C: 'D', D: 'A' }[k]);
  const k = {
    id: 'q-contoh', rombelId: r.id, topik: 'Sistem Pernapasan Manusia', mapel: 'IPA', fase: 'D', tanggal: '2026-10-23',
    batas: { ...BATAS_BAWAAN }, konsep,
    soal: peta.map((kid, i) => ({ jenis: 'pg', opsi: 4, kunci: kunci[i], konsepId: kid })),
    jawaban: Object.fromEntries(r.siswa.map((s, i) => [s.id, [...pola[i]].map((b, j) => (b === '1' ? kunci[j] : salahDari(kunci[j])))])),
    tindakan: { dijalankan: '', catatan: '' }, dibuat: Date.now(),
  };
  d.kuis.push(k);
  d.aktif = { rombelId: r.id, kuisId: k.id };
  return d;
}

/** Perbaiki/lengkapi data lama agar sesuai versi sekarang. */
export function migrasi(d) {
  if (!d || typeof d !== 'object') return dataKosong();
  const x = { ...dataKosong(), ...d };
  x.rombel = (x.rombel || []).map(r => ({ id: r.id || uid('r'), nama: r.nama || 'Kelas', siswa: (r.siswa || []).map(s => ({ id: s.id || uid('s'), nama: s.nama || '', aktif: s.aktif !== false })) }));
  x.kuis = (x.kuis || []).map(k => ({
    tindakan: { dijalankan: '', catatan: '' }, batas: { ...BATAS_BAWAAN }, konsep: [], soal: [], jawaban: {}, ...k,
  }));
  x.versi = VERSI_DATA;
  return x;
}

/** Penyimpanan di memori, untuk tes. */
export function penyimpananMemori() {
  const m = new Map();
  return { async ambil(k) { return m.has(k) ? structuredClone(m.get(k)) : undefined; }, async simpan(k, v) { m.set(k, structuredClone(v)); }, async hapus(k) { m.delete(k); } };
}

/**
 * Buat penyimpan data aplikasi.
 * @param {{ambil:Function, simpan:Function}} adapter
 */
export function buatStore(adapter) {
  let data = dataKosong();
  const pendengar = new Set();
  let tunda = null;

  const s = {
    get data() { return data; },
    async muat() {
      const d = await adapter.ambil('data');
      data = d ? migrasi(d) : dataContoh();
      return data;
    },
    /** Ubah data lalu simpan (ditunda 300 ms agar ketukan beruntun tidak menulis berulang). */
    ubah(fn) {
      fn(data);
      pendengar.forEach(f => f(data));
      clearTimeout(tunda);
      tunda = setTimeout(() => adapter.simpan('data', data), 300);
    },
    async simpanSekarang() { clearTimeout(tunda); await adapter.simpan('data', data); },
    dengar(f) { pendengar.add(f); return () => pendengar.delete(f); },
    async ganti(dBaru) { data = migrasi(dBaru); await adapter.simpan('data', data); pendengar.forEach(f => f(data)); },

    // ---- pembacaan ----
    rombel(id = data.aktif.rombelId) { return data.rombel.find(r => r.id === id) || null; },
    kuis(id = data.aktif.kuisId) { return data.kuis.find(k => k.id === id) || null; },
    kuisRombel(rid = data.aktif.rombelId) { return data.kuis.filter(k => k.rombelId === rid).sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || '') || b.dibuat - a.dibuat); },
    siswaAktif(rid = data.aktif.rombelId) { return (s.rombel(rid)?.siswa || []).filter(x => x.aktif); },
  };

  // ---- operasi ----
  s.tambahRombel = nama => { const r = { id: uid('r'), nama: nama.trim() || 'Kelas baru', siswa: [] }; s.ubah(d => { d.rombel.push(r); d.aktif.rombelId = r.id; d.aktif.kuisId = null; }); return r; };
  s.hapusRombel = id => s.ubah(d => {
    d.rombel = d.rombel.filter(r => r.id !== id); d.kuis = d.kuis.filter(k => k.rombelId !== id);
    if (d.aktif.rombelId === id) { d.aktif.rombelId = d.rombel[0]?.id || null; d.aktif.kuisId = null; }
  });
  /** Ganti daftar siswa rombel. Siswa lama dengan nama sama mempertahankan id (jawaban & foto tetap). */
  s.aturSiswa = (rid, namaBaru) => s.ubah(d => {
    const r = d.rombel.find(x => x.id === rid); if (!r) return;
    const lama = new Map(r.siswa.map(x => [x.nama.trim().toLowerCase(), x]));
    const baru = namaBaru.map(n => n.trim()).filter(Boolean).map(n => {
      const ada = lama.get(n.toLowerCase()); lama.delete(n.toLowerCase());
      return ada ? { ...ada, nama: n, aktif: true } : { id: uid('s'), nama: n, aktif: true };
    });
    // siswa yang hilang dari daftar disimpan sebagai tidak aktif agar riwayat kuis tetap utuh
    r.siswa = [...baru, ...[...lama.values()].map(x => ({ ...x, aktif: false }))];
  });
  s.pilih = (rombelId, kuisId = null) => s.ubah(d => { d.aktif.rombelId = rombelId; d.aktif.kuisId = kuisId; });
  s.kuisBaru = (info = {}) => {
    const k = {
      id: uid('q'), rombelId: data.aktif.rombelId, topik: info.topik || 'Kuis baru', mapel: info.mapel || '', fase: info.fase || '',
      tanggal: hariIni(), batas: { ...BATAS_BAWAAN }, konsep: info.konsep || [{ id: uid('k'), nama: 'Konsep 1', tp: '' }],
      soal: [], jawaban: {}, tindakan: { dijalankan: '', catatan: '' }, dibuat: Date.now(),
    };
    const n = info.jumlahSoal || 10;
    k.soal = Array.from({ length: n }, (_, j) => ({ jenis: 'pg', opsi: 4, kunci: '', konsepId: k.konsep[Math.min(Math.floor(j * k.konsep.length / n), k.konsep.length - 1)].id }));
    s.ubah(d => { d.kuis.push(k); d.aktif.kuisId = k.id; d.contoh = false; });
    return k;
  };
  s.salinKuis = id => {
    const asal = s.kuis(id); if (!asal) return null;
    const k = { ...structuredClone(asal), id: uid('q'), tanggal: hariIni(), jawaban: {}, tindakan: { dijalankan: '', catatan: '' }, dibuat: Date.now(), topik: asal.topik + ' (salinan)' };
    s.ubah(d => { d.kuis.push(k); d.aktif.kuisId = k.id; });
    return k;
  };
  s.hapusKuis = id => s.ubah(d => { d.kuis = d.kuis.filter(k => k.id !== id); if (d.aktif.kuisId === id) d.aktif.kuisId = null; });
  s.ubahKuis = (id, fn) => s.ubah(d => { const k = d.kuis.find(x => x.id === id); if (k) fn(k); });
  /** Atur jumlah soal, mempertahankan soal & jawaban yang ada. */
  s.aturJumlahSoal = (id, n) => s.ubahKuis(id, k => {
    n = Math.max(1, Math.min(40, n | 0));
    const kId = j => k.konsep[Math.min(Math.floor(j * k.konsep.length / n), k.konsep.length - 1)]?.id || '';
    k.soal = Array.from({ length: n }, (_, j) => k.soal[j] || { jenis: 'pg', opsi: 4, kunci: '', konsepId: kId(j) });
    for (const sid of Object.keys(k.jawaban)) k.jawaban[sid] = Array.from({ length: n }, (_, j) => k.jawaban[sid][j] ?? null);
  });
  /** Ganti konsep kuis; soal dibagi rata ke konsep baru. */
  s.aturKonsep = (id, konsep, jumlahSoal) => s.ubahKuis(id, k => {
    k.konsep = konsep.map(c => ({ id: c.id || uid('k'), nama: c.nama, tp: c.tp || '', cp: c.cp || undefined }));
    const n = jumlahSoal || k.soal.length || 10;
    k.soal = Array.from({ length: n }, (_, j) => ({ ...(k.soal[j] || { jenis: 'pg', opsi: 4, kunci: '' }), konsepId: k.konsep[Math.min(Math.floor(j * k.konsep.length / n), k.konsep.length - 1)].id }));
    for (const sid of Object.keys(k.jawaban)) k.jawaban[sid] = Array.from({ length: n }, (_, j) => k.jawaban[sid][j] ?? null);
  });
  s.isiJawaban = (kuisId, siswaId, isian) => s.ubahKuis(kuisId, k => { k.jawaban[siswaId] = Array.from({ length: k.soal.length }, (_, j) => isian[j] ?? null); });
  s.ketukJawaban = (kuisId, siswaId, j) => s.ubahKuis(kuisId, k => {
    const a = k.jawaban[siswaId] || (k.jawaban[siswaId] = Array(k.soal.length).fill(null));
    const v = a[j];
    a[j] = v === null || v === undefined ? 1 : v === 1 ? 0 : v === 0 ? null : 1; // huruf → ditimpa penilaian manual
  });

  return s;
}

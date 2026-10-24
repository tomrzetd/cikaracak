// Analisis hasil kuis dan aturan saran ("sistem pakar" berbasis aturan yang terbaca guru).
// Modul murni. Setiap aturan di sini didokumentasikan di docs/aturan-saran.md — ubah keduanya bersamaan.

export const BATAS_BAWAAN = Object.freeze({ ulang: 60, kktp: 75, siswa: 50 });

/** Persen dibulatkan, atau null bila tidak ada data. */
export function persen(benar, total) {
  return total ? Math.round((benar / total) * 100) : null;
}

const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Tentukan benar (1), salah (0), atau tidak diketahui/kosong (null) untuk satu isian.
 * Isian boleh berupa 1/0 (diisi manual), huruf pilihan ("A", "b"), atau teks jawaban Google Form.
 */
export function nilaiIsian(isian, kunci) {
  if (isian === null || isian === undefined || isian === '') return null;
  if (isian === 1 || isian === 0) return isian;
  if (kunci === null || kunci === undefined || kunci === '') return null;
  const a = norm(isian), k = norm(kunci);
  if (!a) return null;
  if (a === k) return 1;
  // "A. Paru-paru" atau "A) Paru-paru" dicocokkan dengan kunci "A"
  if (k.length <= 2 && (a.startsWith(k + ' '))) return 1;
  return 0;
}

/**
 * Hitung statistik dan saran untuk satu kuis.
 * @param {object} kuis {konsep:[{id,nama,tp}], soal:[{no,jenis,kunci,konsepId}], jawaban:{[siswaId]:Array}, batas}
 * @param {{id:string,nama:string}[]} siswa daftar siswa rombel
 */
export function analisis(kuis, siswa) {
  const batas = { ...BATAS_BAWAAN, ...(kuis.batas || {}) };
  const iKonsep = new Map(kuis.konsep.map((k, i) => [k.id, i]));
  const K = kuis.konsep.map((k, i) => ({ id: k.id, nama: k.nama, tp: k.tp || '', i, benar: 0, total: 0 }));
  const Q = kuis.soal.map((s, j) => ({ no: j + 1, jenis: s.jenis || 'pg', konsepIndex: iKonsep.get(s.konsepId) ?? -1, benar: 0, total: 0 }));

  const P = siswa.map(s => {
    const isian = (kuis.jawaban && kuis.jawaban[s.id]) || [];
    const per = K.map(() => ({ benar: 0, total: 0 }));
    let benar = 0, total = 0;
    kuis.soal.forEach((soal, j) => {
      const v = nilaiIsian(isian[j], soal.kunci);
      if (v === null) return;
      const ki = Q[j].konsepIndex;
      total++; Q[j].total++;
      if (ki >= 0) { per[ki].total++; K[ki].total++; }
      if (v === 1) { benar++; Q[j].benar++; if (ki >= 0) { per[ki].benar++; K[ki].benar++; } }
    });
    return { id: s.id, nama: s.nama, benar, total, p: persen(benar, total), perKonsep: per.map(x => persen(x.benar, x.total)) };
  });

  K.forEach(k => {
    k.p = persen(k.benar, k.total);
    k.status = k.p === null ? 'kosong' : k.p < batas.ulang ? 'ulang' : k.p < batas.kktp ? 'singkat' : 'tuntas';
  });
  Q.forEach(q => { q.p = persen(q.benar, q.total); });

  const ikut = P.filter(p => p.total > 0);
  const rataRata = ikut.length ? Math.round(ikut.reduce((a, p) => a + p.p, 0) / ikut.length) : null;
  const dampingi = ikut.filter(p => p.p < batas.siswa).sort((a, b) => a.p - b.p)
    .map(p => ({ ...p, konsepLemah: p.perKonsep.map((v, i) => (v !== null && v < 50 ? K[i].nama : null)).filter(Boolean) }));

  // Kelompok kecil vs ulang klasikal
  const kelompok = K.filter(k => k.status === 'ulang' || k.status === 'singkat').map(k => {
    const lemah = ikut.filter(p => p.perKonsep[k.i] !== null && p.perKonsep[k.i] < 50).map(p => ({ id: p.id, nama: p.nama }));
    return { konsep: k.nama, konsepIndex: k.i, siswa: lemah, klasikal: lemah.length >= ikut.length * 0.6 };
  }).filter(g => g.siswa.length >= 2);

  // Soal yang perlu dicek: jauh lebih rendah dari konsepnya
  const cekSoal = Q.filter(q => q.total >= 3 && q.p < 40 && q.konsepIndex >= 0 && K[q.konsepIndex].p !== null && K[q.konsepIndex].p - q.p >= 20)
    .map(q => ({ no: q.no, p: q.p, pKonsep: K[q.konsepIndex].p }));

  // Soal benar-salah yang hasilnya setara menebak
  const bsMenebak = Q.filter(q => q.jenis === 'bs' && q.total >= 5 && q.p >= 40 && q.p <= 60).map(q => ({ no: q.no, p: q.p }));

  return { batas, konsep: K, soal: Q, siswa: P, ikut: ikut.length, jumlahSiswa: siswa.length, rataRata, dampingi, kelompok, cekSoal, bsMenebak };
}

export const LABEL_STATUS = Object.freeze({ ulang: 'Perlu diulang', singkat: 'Bahas singkat', tuntas: 'Tuntas', kosong: 'Belum ada data' });

/** Kalimat saran untuk satu konsep. */
export function saranKonsep(k) {
  switch (k.status) {
    case 'ulang': return `Buka pertemuan berikutnya dengan 3–5 soal latihan mengingat tentang ${k.nama} tanpa nilai, lalu jelaskan ulang dengan contoh atau praktikum yang berbeda. Ulangi lagi 3–7 hari kemudian.`;
    case 'singkat': return 'Bahas 5–10 menit soal yang paling banyak salah, dengan umpan balik spesifik tentang kenapa jawaban yang salah itu keliru.';
    case 'tuntas': return 'Lanjut ke materi berikutnya. Selipkan 1 soal konsep ini di kuis berikutnya sebagai latihan berjarak.';
    default: return 'Belum ada jawaban untuk konsep ini.';
  }
}

/** Alasan yang ditampilkan di bawah saran, agar guru bisa menilai sendiri. */
export function alasanKonsep(k, hasil) {
  if (k.p === null) return '';
  const perSoal = hasil.soal.filter(q => q.konsepIndex === k.i).map(q => `no. ${q.no}: ${q.p === null ? '—' : q.p + '%'}`).join(', ');
  return `${k.benar} dari ${k.total} jawaban benar. Batas ulang ${hasil.batas.ulang}%, KKTP ${hasil.batas.kktp}%. Per soal: ${perSoal}.`;
}

/** Ringkasan teks untuk ditempel ke WhatsApp. */
export function ringkasanWA(info, hasil) {
  const f = p => (p === null ? '—' : p + '%');
  const L = [`*Ringkasan kuis ${info.topik}*`, `${info.kelas} · ${info.tanggal}`,
    `Rata-rata: ${f(hasil.rataRata)} · ikut ${hasil.ikut}/${hasil.jumlahSiswa} siswa`, ''];
  [...hasil.konsep].sort((a, b) => (a.p ?? 101) - (b.p ?? 101)).forEach(k => L.push(`• ${k.nama}: ${f(k.p)} (${LABEL_STATUS[k.status]})`));
  if (hasil.dampingi.length) L.push('', `Perlu didampingi: ${hasil.dampingi.map(p => `${p.nama} (${p.p}%)`).join(', ')}`);
  if (hasil.cekSoal.length) L.push('', `Cek ulang soal no. ${hasil.cekSoal.map(q => q.no).join(', ')}`);
  L.push('', '_Saran dari Pendamping Kuis Kelas; keputusan tetap di guru._');
  return L.join('\n');
}

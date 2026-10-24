// Pemilih konsep dari Capaian Pembelajaran resmi 2025 (Keputusan Kepala BSKAP 046/H/KR/2025, Lampiran II).
// Data: web/data/cp_2025_sd_sma.json (dibuat oleh tools/cp-extract). Tanpa AI, tanpa internet.
import { esc, toast } from '../util.js';

const JENJANG = { SD: ['A', 'B', 'C'], SMP: ['D'], SMA: ['E', 'F'] };
const KELAS = { A: 'kelas I–II', B: 'kelas III–IV', C: 'kelas V–VI', D: 'kelas VII–IX', E: 'kelas X', F: 'kelas XI–XII' };
let DATA = null;

async function muatData() {
  if (DATA) return DATA;
  const r = await fetch('data/cp_2025_sd_sma.json');
  if (!r.ok) throw new Error('Data CP tidak ditemukan');
  DATA = await r.json();
  return DATA;
}

/** Pisahkan "Subjudul: isi" pada butir keterampilan proses. */
export function pisahButir(b) {
  const m = b.match(/^([^:]{2,70}):\s+(.+)$/);
  return m ? { sub: m[1], teks: m[2] } : { sub: '', teks: b };
}
/** Nama konsep awal dari butir: maksimal 7 kata (guru bisa menggantinya). */
export function namaPendek(t) {
  const w = t.replace(/[,;]$/, '').split(/\s+/);
  return w.length <= 7 ? t : w.slice(0, 7).join(' ') + '…';
}
/** TP dari butir CP: "Peserta didik dapat …". */
export function tpDariButir(t) {
  return 'Peserta didik dapat ' + t.charAt(0).toLowerCase() + t.slice(1).replace(/\.$/, '') + '.';
}

export async function bukaPilihCP(ctx) {
  const { store } = ctx;
  const k = store.kuis();
  const isi = ctx.buka(`<div class="head row" style="justify-content:space-between"><h2>Pilih konsep dari CP 2025</h2><button class="btn kecil polos" data-tutup>Tutup</button></div>
    <p class="status" id="cpStatus">Memuat data CP…</p>`);
  let data;
  try { data = await muatData(); } catch { isi.querySelector('#cpStatus').textContent = 'Data CP tidak bisa dimuat. Pastikan folder data/ ikut terpasang.'; return; }

  const pilihan = new Map(); // kunci "cpId#i" → {nama, teks, cp}
  const faseAwal = k.fase || 'D';
  const jenjangAwal = Object.keys(JENJANG).find(j => JENJANG[j].includes(faseAwal)) || 'SMP';
  isi.innerHTML = `<div class="row" style="justify-content:space-between"><h2>Pilih konsep dari CP 2025</h2><button class="btn kecil polos" data-tutup>Tutup</button></div>
    <p class="muted kecil">Sumber: ${esc(data.sumber.dokumen)} — ${esc(data.sumber.lampiran)}. Butir CP adalah bahan menyusun TP, bukan TP resmi.</p>
    <div class="grid2">
      <label>Jenjang <select id="cpJenjang">${Object.keys(JENJANG).map(j => `<option${j === jenjangAwal ? ' selected' : ''}>${j}</option>`).join('')}</select></label>
      <label>Fase <select id="cpFase"></select></label>
    </div>
    <label>Mapel <select id="cpMapel"></select></label>
    <label>Cari butir <input id="cpCari" placeholder="mis. organ, gaya, pecahan, teks"></label>
    <div id="cpDaftar" style="max-height:48vh;overflow:auto"></div>
    <div class="row" style="align-items:flex-end">
      <label style="width:140px">Jumlah soal <input type="number" id="cpN" min="1" max="40" value="${k.soal.length || 10}"></label>
      <button class="btn utama" id="cpPakai" disabled>Pakai butir terpilih</button>
      <span class="muted kecil" id="cpJumlah">Belum ada butir dipilih</span>
    </div>
    <p class="privasi">Konsep yang ada akan diganti, dan soal dibagi rata ke konsep baru. Jawaban yang sudah masuk tetap tersimpan.</p>`;
  const $ = s => isi.querySelector(s);

  const isiFase = () => { $('#cpFase').innerHTML = JENJANG[$('#cpJenjang').value].map(f => `<option value="${f}"${f === faseAwal ? ' selected' : ''}>Fase ${f} (${KELAS[f]})</option>`).join(''); isiMapel(); };
  const isiMapel = () => {
    const f = $('#cpFase').value, sebelum = $('#cpMapel').value;
    const ms = data.mapel.filter(m => m.fase[f]);
    const tebak = sebelum || (ms.find(m => k.mapel && m.nama.toLowerCase().includes(k.mapel.toLowerCase())) || ms[0])?.id;
    $('#cpMapel').innerHTML = ms.map(m => `<option value="${m.id}"${m.id === tebak ? ' selected' : ''}>${esc(m.nama)}</option>`).join('');
    daftar();
  };
  const daftar = () => {
    const f = $('#cpFase').value, m = data.mapel.find(x => x.id === $('#cpMapel').value), q = $('#cpCari').value.trim().toLowerCase();
    if (!m || !m.fase[f]) { $('#cpDaftar').innerHTML = '<p class="muted">Mapel ini tidak punya CP di fase tersebut.</p>'; return; }
    const html = m.fase[f].map(cp => {
      const items = cp.butir.map((b, i) => ({ key: `${cp.id}#${i}`, ...pisahButir(b) }))
        .filter(it => !q || it.teks.toLowerCase().includes(q) || it.sub.toLowerCase().includes(q) || cp.elemen.toLowerCase().includes(q));
      if (!items.length && !(cp.catatan && !q)) return '';
      return `<div class="cpgroup"><h4>${esc(cp.elemen)}</h4>${cp.catatan ? `<span class="why">${esc(cp.catatan)}</span>` : ''}
        ${items.map(it => { const p = pilihan.get(it.key), idk = it.key.replace(/[^a-z0-9]/gi, '_');
          return `<div class="cpitem"><input type="checkbox" id="cb_${idk}" data-k="${esc(it.key)}"${p ? ' checked' : ''}>
            <label for="cb_${idk}" style="font-weight:500;display:block">${it.sub ? `<span class="sub">${esc(it.sub)}: </span>` : ''}${esc(it.teks)}</label>
            ${p ? `<input class="nm" data-nk="${esc(it.key)}" value="${esc(p.nama)}" aria-label="Nama konsep">` : ''}</div>`; }).join('')}</div>`;
    }).join('');
    $('#cpDaftar').innerHTML = html || `<p class="muted">Tidak ada butir yang memuat "${esc(q)}". CP ditulis umum; coba kata lain, mis. "organ" untuk sistem pernapasan.</p>`;
    $('#cpJumlah').textContent = pilihan.size ? `${pilihan.size} butir dipilih` : 'Belum ada butir dipilih';
    $('#cpPakai').disabled = !pilihan.size;
  };
  $('#cpJenjang').onchange = isiFase;
  $('#cpFase').onchange = isiMapel;
  $('#cpMapel').onchange = daftar;
  $('#cpCari').oninput = daftar;
  $('#cpDaftar').addEventListener('change', e => {
    const cb = e.target.closest('[data-k]'); if (!cb) return;
    if (cb.checked) {
      const [cpId, i] = cb.dataset.k.split('#');
      const m = data.mapel.find(x => x.id === $('#cpMapel').value), f = $('#cpFase').value;
      const cp = m.fase[f].find(c => c.id === cpId);
      const { teks } = pisahButir(cp.butir[+i]);
      pilihan.set(cb.dataset.k, { nama: namaPendek(teks), teks, cp: cpId, mapel: m.nama, fase: f });
    } else pilihan.delete(cb.dataset.k);
    daftar();
  });
  $('#cpDaftar').addEventListener('input', e => { const n = e.target.closest('[data-nk]'); if (n && pilihan.has(n.dataset.nk)) pilihan.get(n.dataset.nk).nama = n.value; });
  $('#cpPakai').onclick = () => {
    const ps = [...pilihan.values()]; if (!ps.length) return;
    const dipakai = new Set();
    const konsep = ps.map(p => {
      let n = (p.nama || '').trim() || namaPendek(p.teks), x = n, c = 2;
      while (dipakai.has(x)) x = `${n} (${c++})`;
      dipakai.add(x);
      return { nama: x, tp: tpDariButir(p.teks), cp: p.cp };
    });
    const n = Math.max(1, Math.min(40, Number($('#cpN').value) || konsep.length));
    store.aturKonsep(k.id, konsep, n);
    store.ubahKuis(k.id, q => { q.mapel = q.mapel || ps[0].mapel; q.fase = ps[0].fase; if (/^Kuis baru/.test(q.topik)) q.topik = ps[0].mapel; });
    ctx.tutup();
    toast(`${konsep.length} konsep dipakai, ${n} soal dibagi rata. Ganti nama konsep bila perlu.`);
  };
  isiFase();
}

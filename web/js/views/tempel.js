// Tempel respons dari Google Form / Google Sheets / Excel. Tanpa internet: guru menyalin tabel lalu menempelnya.
import { bacaRespons } from '../core/impor.js';
import { cocokkanNama } from '../core/nama.js';
import { nilaiIsian } from '../core/analisis.js';
import { esc, toast } from '../util.js';

export function bukaTempel(ctx) {
  const { store } = ctx;
  const k = store.kuis();
  const adaKunci = k.soal.some(s => s.kunci);
  const isi = ctx.buka(`<div class="row" style="justify-content:space-between"><h2>Tempel dari Google Form / Sheets</h2><button class="btn kecil polos" data-tutup>Tutup</button></div>
    <p class="muted kecil">Buka tab Respons → tautkan ke Spreadsheet, blok seluruh tabel (termasuk judul kolom), salin, lalu tempel di bawah. Kolom stempel waktu, email, dan skor diabaikan otomatis.
    ${adaKunci ? 'Jawaban dinilai dengan kunci yang sudah diisi di kuis ini.' : 'Kuis ini belum punya kunci, jadi isian harus berupa 1/0, benar/salah, atau ✓/✗.'}</p>
    <textarea id="tpData" style="min-height:160px" placeholder="Nama&#9;Soal 1&#9;Soal 2&#10;Adit&#9;A&#9;C" autofocus></textarea>
    <div class="row"><button class="btn utama" id="tpBaca">Baca tabel</button><span class="status" id="tpStatus"></span></div>
    <div id="tpHasil"></div>`);
  isi.querySelector('#tpBaca').onclick = () => {
    const r = bacaRespons(isi.querySelector('#tpData').value, { adaKunci });
    const st = isi.querySelector('#tpStatus');
    if (!r.baris.length) { st.className = 'status err'; st.textContent = 'Tidak ada baris yang terbaca. Pastikan baris pertama berisi judul kolom.'; return; }
    const siswa = store.siswaAktif();
    const n = Math.min(r.jumlahSoal, k.soal.length);
    st.className = 'status';
    st.textContent = `${r.baris.length} siswa, ${r.jumlahSoal} kolom jawaban.${r.jumlahSoal !== k.soal.length ? ` Kuis ini punya ${k.soal.length} soal; yang dipakai ${n} kolom pertama.` : ''} ${r.peringatan.join(' ')}`;
    const baris = r.baris.map(b => ({ ...b, idx: cocokkanNama(b.nama, siswa) }));
    isi.querySelector('#tpHasil').innerHTML = `<div class="tablebox"><table><tr><th class="l">Nama di tabel</th><th class="l">Siswa</th>${Array.from({ length: n }, (_, j) => `<th>${j + 1}</th>`).join('')}<th>Benar</th></tr>
      ${baris.map((b, i) => {
        let ok = 0, t = 0;
        const sel = b.isian.slice(0, n).map((v, j) => { const x = nilaiIsian(v, k.soal[j].kunci); if (x !== null) { t++; ok += x; } return `<td style="color:${x === 1 ? 'var(--ok)' : x === 0 ? 'var(--bad)' : 'var(--muted)'}">${v === 1 ? '✓' : v === 0 ? '✗' : esc(String(v ?? '·').slice(0, 3))}</td>`; }).join('');
        return `<tr><td class="l">${esc(b.nama)}</td><td class="l"><select data-baris="${i}" style="width:auto">
          <option value="">— lewati —</option>${siswa.map((s, si) => `<option value="${si}"${si === b.idx ? ' selected' : ''}>${esc(s.nama)}</option>`).join('')}</select></td>${sel}<td><b>${t ? Math.round(ok / t * 100) + '%' : '—'}</b></td></tr>`;
      }).join('')}</table></div>
      <p class="privasi">Nama yang tidak cocok otomatis (mis. ada dua "Bella") perlu dipilih manual.</p>
      <button class="btn utama" id="tpSimpan">Simpan jawaban</button>`;
    isi.querySelector('#tpHasil').addEventListener('change', e => { const s = e.target.closest('[data-baris]'); if (s) baris[+s.dataset.baris].idx = s.value === '' ? -1 : +s.value; });
    isi.querySelector('#tpSimpan').onclick = () => {
      const dipakai = baris.filter(b => b.idx >= 0);
      const ids = dipakai.map(b => siswa[b.idx].id);
      if (new Set(ids).size !== ids.length) { toast('Ada siswa yang dipilih untuk dua baris. Perbaiki dulu.'); return; }
      dipakai.forEach(b => store.isiJawaban(k.id, siswa[b.idx].id, b.isian.slice(0, n)));
      ctx.tutup(); toast(`Jawaban ${dipakai.length} siswa disimpan`);
    };
  };
}

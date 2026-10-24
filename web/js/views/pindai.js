// Alur pindai LJK: foto → baca di perangkat → periksa → simpan. Foto tidak disimpan dan tidak dikirim ke mana pun.
import { tataLetak, kodeKuis } from '../core/ljk.js';
import { pindai } from '../core/omr.js';
import { muatAbu } from '../gambar.js';
import { esc, toast } from '../util.js';

export async function prosesPindai(files, ctx) {
  const { store } = ctx;
  const k = store.kuis(), siswa = store.siswaAktif();
  if (!k.soal.length) { toast('Kuis belum punya soal'); return; }
  const L = tataLetak(k.soal), kode = kodeKuis(k.id);
  const isi = ctx.buka(`<h2>Memindai ${files.length} lembar…</h2><p class="status" id="pdStatus">Menyiapkan…</p>`);
  const hasil = [];
  for (let i = 0; i < files.length; i++) {
    isi.querySelector('#pdStatus') && (isi.querySelector('#pdStatus').textContent = `Lembar ${i + 1} dari ${files.length}`);
    await new Promise(r => setTimeout(r, 0)); // beri kesempatan layar diperbarui
    let h;
    try { h = pindai(await muatAbu(files[i]), L); } catch (e) { h = { ok: false, pesan: 'Foto tidak bisa dibuka: ' + e.message }; }
    const target = h.ok && h.absen ? siswa[h.absen - 1] : null;
    hasil.push({ nama: files[i].name, h, siswaId: target?.id || '', pakai: !!(h.ok && target), jawaban: h.ok ? [...h.jawaban] : [] });
  }
  tinjau(ctx, hasil, kode, L);
}

function tinjau(ctx, hasil, kode, L) {
  const { store } = ctx;
  const k = store.kuis(), siswa = store.siswaAktif();
  const opsiSiswa = sel => `<option value="">— pilih siswa —</option>` + siswa.map((s, i) => `<option value="${esc(s.id)}"${s.id === sel ? ' selected' : ''}>${i + 1}. ${esc(s.nama)}</option>`).join('');
  const dobel = id => id && hasil.filter(x => x.pakai && x.siswaId === id).length > 1;
  const isi = ctx.buka(`<div class="row" style="justify-content:space-between"><h2>Periksa hasil pindai</h2><button class="btn kecil polos" data-tutup>Batal</button></div>
    <p class="muted kecil">Bulatan yang ragu, ganda, atau kosong ditandai kuning; pilih jawabannya bila perlu. Nomor absen dicocokkan dengan urutan siswa di kelas ${esc(store.rombel().nama)}.</p>
    <div id="pdDaftar" style="display:flex;flex-direction:column;gap:14px"></div>
    <div class="row"><button class="btn utama" id="pdSimpan">Simpan</button><span class="muted kecil" id="pdInfo"></span></div>`);
  const gambar = () => {
    isi.querySelector('#pdDaftar').innerHTML = hasil.map((x, i) => {
      if (!x.h.ok) return `<div class="preview"><b>${esc(x.nama)}</b><span class="status err">${esc(x.h.pesan)}</span></div>`;
      const peringatan = [];
      if (x.h.kode !== kode) peringatan.push(`Kode di lembar ${x.h.kode ?? '???'}, kode kuis ini ${kode}. Pastikan lembar ini untuk kuis "${k.topik}".`);
      if (!x.h.absen) peringatan.push('Nomor absen tidak terbaca; pilih siswanya.');
      else if (!siswa[x.h.absen - 1]) peringatan.push(`Nomor absen ${x.h.absen} tidak ada di kelas ini.`);
      if (dobel(x.siswaId)) peringatan.push('Siswa ini dipilih di lebih dari satu lembar.');
      const tandai = new Set([...x.h.ragu, ...x.h.ganda, ...x.h.kosong]);
      return `<div class="preview">
        <div class="row" style="justify-content:space-between">
          <label class="cek"><input type="checkbox" data-pakai="${i}"${x.pakai ? ' checked' : ''}><span>${esc(x.nama)} · absen ${x.h.absen ?? '?'} · kode ${x.h.kode ?? '?'}</span></label>
          <select data-siswa="${i}" style="width:auto;max-width:240px" aria-label="Siswa untuk lembar ${i + 1}">${opsiSiswa(x.siswaId)}</select>
        </div>
        ${peringatan.map(p => `<span class="status err">${esc(p)}</span>`).join('')}
        <div class="row" style="gap:6px">${L.soal.map((s, j) => {
          const v = x.jawaban[j];
          if (!tandai.has(j + 1)) return `<span class="pill ${v ? 'mint' : 'kosong'}" style="text-transform:none">${j + 1}.${v ?? '–'}</span>`;
          return `<label class="pill singkat" style="text-transform:none;flex-direction:row;gap:4px">${j + 1}.<select data-jwb="${i}:${j}" style="width:auto;padding:2px 6px;font-size:.8rem" aria-label="Jawaban soal ${j + 1}">
            <option value="">–</option>${s.bulatan.map(b => `<option${b.nilai === v ? ' selected' : ''}>${b.nilai}</option>`).join('')}</select>
            <small>${x.h.status[j]}</small></label>`;
        }).join('')}</div></div>`;
    }).join('');
    const n = hasil.filter(x => x.pakai && x.siswaId).length;
    isi.querySelector('#pdInfo').textContent = `${n} lembar akan disimpan`;
    isi.querySelector('#pdSimpan').disabled = !n;
  };
  isi.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.pakai) hasil[+t.dataset.pakai].pakai = t.checked;
    if (t.dataset.siswa) { const x = hasil[+t.dataset.siswa]; x.siswaId = t.value; if (t.value) x.pakai = true; }
    if (t.dataset.jwb) { const [i, j] = t.dataset.jwb.split(':').map(Number); hasil[i].jawaban[j] = t.value || null; return; }
    gambar();
  });
  isi.querySelector('#pdSimpan').onclick = () => {
    const dipakai = hasil.filter(x => x.pakai && x.siswaId);
    if (dipakai.some(x => dobel(x.siswaId))) { toast('Ada siswa yang terpilih di dua lembar. Perbaiki dulu.'); return; }
    dipakai.forEach(x => store.isiJawaban(k.id, x.siswaId, x.jawaban));
    ctx.tutup();
    toast(`Jawaban ${dipakai.length} siswa disimpan`);
  };
  gambar();
}

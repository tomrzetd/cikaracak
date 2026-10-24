## Apa yang berubah

<!-- Satu atau dua kalimat. Tautkan Issue: "Menutup #12" -->

## Cara menguji

- [ ] `node --test tests/*.test.js` lulus
- [ ] `node tools/cek-web.js` lulus
- [ ] Dicoba di browser HP atau mode HP di DevTools

## Bila menyentuh bagian sensitif

- [ ] Pemindai/LJK: angka uji massal sebelum → sesudah: …
- [ ] Aturan saran: `docs/aturan-saran.md` dan tesnya diperbarui
- [ ] Skema database: migrasi baru + uji di `tools/supabase/uji_rls.sql`
- [ ] Tidak ada data siswa yang dikirim ke luar perangkat; tidak ada pelacak/CDN baru

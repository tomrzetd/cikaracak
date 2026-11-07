// Tanda tangan tap kartu, persis seperti firmware alat (firmware/lib/logika) dan fungsi catat_tap di server.
// Dipakai simulator alat di halaman Presensi, supaya presensi bisa didemokan tanpa perangkat keras.

export const pesanTap = (alat, waktu, nonce, uid, offline) => `${alat}\n${waktu}\n${nonce}\n${uid}\n${offline ? '1' : '0'}`;

export function dariHex(hex) {
  if (!/^([0-9a-fA-F]{2})+$/.test(hex || '')) throw new Error('Bukan teks heksadesimal');
  return new Uint8Array(hex.match(/../g).map(h => parseInt(h, 16)));
}
const keHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

export async function hmacHex(kunciHex, pesan) {
  const kunci = await crypto.subtle.importKey('raw', dariHex(kunciHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return keHex(await crypto.subtle.sign('HMAC', kunci, new TextEncoder().encode(pesan)));
}

export function buatNonce() {
  const huruf = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...crypto.getRandomValues(new Uint8Array(16))].map(b => huruf[b % 32]).join('');
}

export const uidSah = uid => /^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/.test(uid);
export const rapikanUid = uid => String(uid || '').replace(/[\s:-]/g, '').toUpperCase();

/** Susun argumen RPC catat_tap yang sudah ditandatangani. waktu = detik Unix (0 = jam server). */
export async function tapBertanda({ alat, kunciHex, uid, waktu = 0, offline = false, nonce = buatNonce() }) {
  uid = rapikanUid(uid);
  if (!uidSah(uid)) throw new Error('UID harus 8, 14, atau 20 digit heksadesimal');
  if (!/^[A-Z0-9]{8}$/.test(alat)) throw new Error('ID alat harus 8 huruf/angka');
  const tanda = await hmacHex(kunciHex, pesanTap(alat, waktu, nonce, uid, offline));
  return { p_alat: alat, p_uid: uid, p_waktu: waktu, p_nonce: nonce, p_offline: offline, p_tanda: tanda };
}

// Teks layar alat untuk setiap hasil, sama dengan firmware (logika.cpp susunTeks).
export function teksHasil(j) {
  const n = j.nama || 'kamu', jam = j.jam || '';
  const t = {
    hadir: ['🥳', `Selamat datang, ${n}!`, `Hadir ${jam}`],
    terlambat: ['😅', `Halo, ${n}`, `Tercatat ${jam}, telat ${j.terlambat_menit} menit`],
    sudah: ['😉', `Sudah tercatat, ${n}`, 'Tidak perlu tap lagi'],
    pulang: ['👋', `Hati-hati di jalan, ${n}!`, `Pulang ${jam}`],
    pulang_awal: ['🤔', `Pulang lebih awal, ${n}`, `Tercatat ${jam}`],
    terdaftar: ['🌟', 'Kartu terdaftar!', `Kartu milik ${n}`],
    kartu_terpakai: ['😟', 'Kartu milik siswa lain', 'Tidak bisa didaftarkan'],
    tidak_dikenal: ['❓', 'Kartu belum terdaftar', 'Hubungi operator sekolah'],
    libur: ['😴', 'Hari ini libur', 'Selamat beristirahat'],
    nonaktif: ['😟', 'Alat dinonaktifkan', 'Hubungi operator sekolah'],
    kedaluwarsa: ['😟', 'Tap terlalu lama tersimpan', 'Lebih dari 7 hari'],
    waktu_salah: ['😟', 'Jam alat tidak cocok', 'Samakan jam alat'],
    tanda_salah: ['🔒', 'Kunci alat salah', 'Periksa ID dan kunci alat'],
    format_salah: ['❓', 'Kartu tidak terbaca', 'Coba tempel lagi'],
  }[j.hasil] || ['😟', 'Ada gangguan', j.hasil || ''];
  return { wajah: t[0], judul: t[1], sub: t[2] };
}

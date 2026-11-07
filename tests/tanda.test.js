import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hmacHex, pesanTap, tapBertanda, rapikanUid, uidSah, teksHasil, buatNonce } from '../web/js/core/tanda.js';

const KUNCI = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';

test('vektor HMAC sama dengan firmware dan server', async () => {
  const pesan = pesanTap('ATESTKEY', 1762480000, 'nonce0001', 'A1B2C3D4', false);
  assert.equal(pesan, 'ATESTKEY\n1762480000\nnonce0001\nA1B2C3D4\n0');
  assert.equal(await hmacHex(KUNCI, pesan), 'c2aabcda63071a3c914a36ba5fdc4fc6cd215e37779ea37d35fa0a5ac0915a03');
});

test('tapBertanda merapikan UID dan menandatangani', async () => {
  const a = await tapBertanda({ alat: 'ATESTKEY', kunciHex: KUNCI, uid: 'a1 b2 c3 d4', waktu: 1762480000, nonce: 'nonce0001' });
  assert.equal(a.p_uid, 'A1B2C3D4');
  assert.equal(a.p_tanda, 'c2aabcda63071a3c914a36ba5fdc4fc6cd215e37779ea37d35fa0a5ac0915a03');
  await assert.rejects(tapBertanda({ alat: 'ATESTKEY', kunciHex: KUNCI, uid: 'XYZ' }), /UID/);
  await assert.rejects(tapBertanda({ alat: 'pendek', kunciHex: KUNCI, uid: 'A1B2C3D4' }), /ID alat/);
});

test('UID, nonce, dan teks hasil', () => {
  assert.equal(rapikanUid('04:a1:b2:c3:d4:e5:06'), '04A1B2C3D4E506');
  assert.ok(uidSah('47DB1DE0') && !uidSah('47DB1D'));
  assert.match(buatNonce(), /^[A-Z2-9]{16}$/);
  assert.equal(teksHasil({ hasil: 'terlambat', nama: 'Adit', jam: '07:25', terlambat_menit: 25 }).sub, 'Tercatat 07:25, telat 25 menit');
  assert.equal(teksHasil({ hasil: 'kode_baru' }).judul, 'Ada gangguan');
});

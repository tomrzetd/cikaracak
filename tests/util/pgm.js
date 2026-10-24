// Baca citra PGM biner (P5) menjadi {w, h, data}. Dipakai tes pemindai.
export function bacaPGM(buf) {
  // Header P5: "P5\n<w> <h>\n255\n"
  let i = 0; const tok = [];
  while (tok.length < 4) {
    while (buf[i] === 0x20 || buf[i] === 0x0a || buf[i] === 0x0d) i++;
    let s = ''; while (buf[i] !== 0x20 && buf[i] !== 0x0a && buf[i] !== 0x0d) s += String.fromCharCode(buf[i++]);
    tok.push(s);
  }
  i++;
  const [, w, h] = tok.map(Number);
  return { w, h, data: new Uint8Array(buf.buffer, buf.byteOffset + i, w * h) };
}

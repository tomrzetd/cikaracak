// Penyimpanan IndexedDB di perangkat: data aplikasi dan foto siswa.
// Foto disimpan terpisah dan TIDAK ikut ekspor/cadangan kecuali guru memintanya.

const NAMA_DB = 'pendamping-kuis';

function buka() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(NAMA_DB, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('data')) db.createObjectStore('data');
      if (!db.objectStoreNames.contains('foto')) db.createObjectStore('foto');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

let dbJanji = null;
const db = () => (dbJanji ||= buka());

function tx(store, mode, fn) {
  return db().then(d => new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const hasil = fn(t.objectStore(store));
    t.oncomplete = () => res(hasil && 'result' in hasil ? hasil.result : undefined);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}

/** Adapter untuk state.js */
export const penyimpananIDB = {
  ambil: k => tx('data', 'readonly', st => st.get(k)),
  simpan: (k, v) => tx('data', 'readwrite', st => { st.put(v, k); }),
  hapus: k => tx('data', 'readwrite', st => { st.delete(k); }),
};

/** Foto siswa: blob JPEG 200×200 per id siswa, plus URL objek untuk ditampilkan. */
export const foto = {
  url: {},
  async muat() {
    const d = await db();
    await new Promise(res => {
      const c = d.transaction('foto', 'readonly').objectStore('foto').openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { this._set(cur.key, cur.value); cur.continue(); } else res(); };
      c.onerror = () => res();
    });
  },
  _set(id, blob) {
    if (this.url[id]) URL.revokeObjectURL(this.url[id]);
    if (blob) this.url[id] = URL.createObjectURL(blob); else delete this.url[id];
  },
  async simpan(id, blob) { await tx('foto', 'readwrite', st => { st.put(blob, id); }); this._set(id, blob); },
  async hapus(id) { await tx('foto', 'readwrite', st => { st.delete(id); }); this._set(id, null); },
  async hapusSemua() { await tx('foto', 'readwrite', st => { st.clear(); }); Object.keys(this.url).forEach(k => this._set(k, null)); },
};

/** Minta browser agar data tidak dihapus otomatis saat memori penuh. */
export async function mintaPenyimpananTetap() {
  try { return navigator.storage?.persist ? await navigator.storage.persist() : false; } catch { return false; }
}

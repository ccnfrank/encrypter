// The list of protected files. Each record keeps a file handle (File System Access API),
// stored in IndexedDB, so the files can be opened again later. Nothing is stored
// except the handle and a few names and dates. Without IndexedDB the list stays empty.

const DB_NAME = "encrypter";
const STORE = "protected";
const SETTINGS = "settings"; // small values, e.g. the list password hash

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
        if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

async function withStore(mode, action, storeName = STORE) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Newest first
export async function listProtected() {
  try {
    const records = (await withStore("readonly", (store) => store.getAll())) || [];
    return records.sort((a, b) => b.savedAt - a.savedAt);
  } catch (err) {
    console.error(err);
    return [];
  }
}

// Adds a record. A file that is already in the list (same handle) is replaced.
export async function rememberProtected({ handle, name, kind }) {
  try {
    const existing = await listProtected();
    for (const record of existing) {
      if (await sameFile(record.handle, handle)) await forgetProtected(record.id);
    }
    const record = { id: crypto.randomUUID(), handle, name, kind, savedAt: Date.now() };
    await withStore("readwrite", (store) => store.put(record));
  } catch (err) {
    // The file is already saved; only the list entry is missing
    console.error(err);
  }
}

export async function forgetProtected(id) {
  try {
    await withStore("readwrite", (store) => store.delete(id));
  } catch (err) {
    console.error(err);
  }
}

async function sameFile(a, b) {
  try {
    return Boolean(a && b && (await a.isSameEntry(b)));
  } catch {
    return false;
  }
}

export async function getSetting(key) {
  try {
    return await withStore("readonly", (store) => store.get(key), SETTINGS);
  } catch (err) {
    console.error(err);
    return undefined;
  }
}

export async function setSetting(key, value) {
  await withStore("readwrite", (store) => store.put(value, key), SETTINGS);
}

export async function deleteSetting(key) {
  await withStore("readwrite", (store) => store.delete(key), SETTINGS);
}

// Collecting, naming and zipping the items the user picks or drops.
// Each entry: { id, name, kind: 'file' | 'folder', items: [{ path, file }], size, handle, encrypted }

let nextId = 1;

export const MIN_LENGTH = 8;

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const totalSize = (items) => items.reduce((sum, item) => sum + item.file.size, 0);

export function makeEntry(fields) {
  return {
    id: nextId++,
    name: "",
    kind: "file",
    items: [],
    size: 0,
    handle: null,
    encrypted: false,
    ...fields,
    size: fields.size ?? totalSize(fields.items ?? []),
  };
}

export const isZipped = (entries) => !(entries.length === 1 && entries[0].kind === "file");
export const allItems = (entries) => entries.flatMap((entry) => entry.items);

// "decrypt" when every selected item is an encrypted file, otherwise "encrypt"
export const currentMode = (entries) =>
  entries.length && entries.every((entry) => entry.kind === "file" && entry.encrypted) ? "decrypt" : "encrypt";

export const sanitizeName = (raw) => raw.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").trim() || "file";

// The original name, with its extension, is stored inside the encrypted file. Folders
// and several items are stored as a ".zip" archive.
export function originalName(raw, zipped) {
  const base = sanitizeName(raw);
  return zipped ? `${base.replace(/\.zip$/i, "")}.zip` : base;
}

// Output name for encryption: the stored name plus ".enc". The ".enc" keeps the
// result from overwriting the original.
export const buildOutputName = (raw, zipped) => `${originalName(raw, zipped)}.enc`;

// Output name for old (version 1) files, which have no stored name: drop ".enc"
export function buildDecryptedName(raw) {
  const base = sanitizeName(raw);
  if (/\.enc$/i.test(base)) return base.replace(/\.enc$/i, "") || "file";
  return `${base}.decrypted`;
}

/* ---------- reading items ---------- */

async function collectHandle(handle, prefix, out) {
  if (handle.kind === "file") {
    out.push({ path: prefix + handle.name, file: await handle.getFile() });
    return;
  }
  for await (const child of handle.values()) {
    await collectHandle(child, `${prefix}${handle.name}/`, out);
  }
}

// File System Access API handle (picker or drop)
export async function entryFromHandle(handle) {
  const items = [];
  await collectHandle(handle, "", items);
  return makeEntry({
    name: handle.name,
    kind: handle.kind === "directory" ? "folder" : "file",
    items,
    handle,
  });
}

// Fallback for drops without handles (webkitGetAsEntry)
async function walk(entry, prefix, out) {
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
    out.push({ path: prefix + entry.name, file });
  } else if (entry.isDirectory) {
    const dirPrefix = `${prefix}${entry.name}/`;
    const reader = entry.createReader();
    let batch;
    do {
      // readEntries returns at most ~100 items per call
      batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      for (const child of batch) await walk(child, dirPrefix, out);
    } while (batch.length);
  }
}

export async function entryFromLegacy(entry) {
  const items = [];
  await walk(entry, "", items);
  return makeEntry({
    name: entry.name,
    kind: entry.isDirectory ? "folder" : "file",
    items,
    handle: null,
  });
}

// Fallback for <input type="file"> (files and folders picked without handles)
export function entriesFromFileList(list) {
  const folders = new Map();
  const out = [];
  for (const file of Array.from(list || [])) {
    const rel = file.webkitRelativePath;
    if (rel) {
      const top = rel.split("/")[0];
      let folder = folders.get(top);
      if (!folder) {
        folder = makeEntry({ name: top, kind: "folder", items: [], handle: null });
        folders.set(top, folder);
        out.push(folder);
      }
      folder.items.push({ path: rel, file });
      folder.size += file.size;
    } else {
      out.push(
        makeEntry({
          name: file.name,
          kind: "file",
          items: [{ path: file.name, file }],
          handle: null,
        })
      );
    }
  }
  return out;
}

// Detects encrypted files by their header, so the app knows when to decrypt
export async function markEncrypted(entry, isEncryptedBlob) {
  if (entry.kind === "file") entry.encrypted = await isEncryptedBlob(entry.items[0].file);
  return entry;
}

export function entryMeta(entry) {
  if (entry.kind === "file") {
    return `${entry.encrypted ? "Encrypted file" : "File"} · ${formatBytes(entry.size)}`;
  }
  return `Folder · ${plural(entry.items.length, "file", "files")} · ${formatBytes(entry.size)}`;
}

/* ---------- zipping ---------- */

export async function zipItems(items, onProgress) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const { path, file } of items) zip.file(path, file);
  return zip.generateAsync(
    {
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
      streamFiles: true,
    },
    (meta) => onProgress(meta.percent / 100)
  );
}

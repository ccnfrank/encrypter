// The encrypt / decrypt job, split in three steps so the UI can react between them:
//   prepareJob  -> reads the name (decrypt) and asks where to save (needs the click)
//   executeJob  -> does the crypto work and reports progress
//   finishJob   -> writes the file (or downloads it) and deletes the originals if asked
import { EncripterCore } from "./crypto.js";
import {
  buildDecryptedName,
  buildOutputName,
  currentMode,
  isZipped,
  originalName,
  sanitizeName,
  zipItems,
  allItems,
} from "./files.js";
import { ZIP_SHARE } from "./progress.js";
import { coded } from "./errors.js";
import { FS_ACCESS, downloadBlob, ensureWritable, pickSaveTarget, removeOriginals } from "./save.js";
import { rememberProtected } from "./vault.js";

// Several encrypted files: one password for all of them, saved into one folder
async function prepareBatch({ entries, password, deleteOriginal }) {
  const deleting = deleteOriginal && FS_ACCESS;

  // The folder dialog must open straight from the click, so it comes first
  let dir = null;
  if (FS_ACCESS) {
    try {
      dir = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch (err) {
      if (err.name === "AbortError") return { cancelled: true };
      throw coded("saveDialog");
    }
  }
  if (deleting) await ensureWritable(entries);

  // The names come from inside each file, which also checks the password
  const names = [];
  for (const entry of entries) {
    const storedName = await EncripterCore.readName(entry.items[0].file, password);
    names.push(storedName ? sanitizeName(storedName) : buildDecryptedName(entry.name));
  }
  return { cancelled: false, decrypting: true, batch: true, dir, names, deleting, entries, password };
}

// A name that is not taken yet in the folder: "a.txt" -> "a (2).txt"
async function freeName(dir, name) {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let candidate = name;
  for (let i = 2; await exists(dir, candidate); i++) candidate = `${base} (${i})${ext}`;
  return candidate;
}

async function exists(dir, name) {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch (err) {
    return err.name !== "NotFoundError";
  }
}

export async function prepareJob({ entries, password, deleteOriginal }) {
  const decrypting = currentMode(entries) === "decrypt";
  if (decrypting && entries.length > 1) return prepareBatch({ entries, password, deleteOriginal });
  const first = entries[0];
  const zipped = !decrypting && isZipped(entries);
  const deleting = deleteOriginal && FS_ACCESS;

  // When decrypting, read the original name from the file (this also checks the
  // password), so the save dialog suggests e.g. "texte.png" and not "texte.enc"
  let outName = buildOutputName(first.name, zipped);
  if (decrypting) {
    const storedName = await EncripterCore.readName(first.items[0].file, password);
    outName = storedName ? sanitizeName(storedName) : buildDecryptedName(first.name);
  }

  // Ask for permission and where to save first: both need the click's user activation
  if (deleting) await ensureWritable(entries);

  let target = null;
  if (FS_ACCESS) {
    try {
      target = await pickSaveTarget(outName, first.handle || undefined, decrypting);
    } catch (err) {
      if (err.name === "AbortError") return { cancelled: true };
      throw coded("saveDialog");
    }
  }

  return { cancelled: false, decrypting, zipped, deleting, outName, target, entries, password };
}

export async function executeJob(plan, { report, setStatus }) {
  const { decrypting, zipped, entries, password } = plan;
  const first = entries[0];

  if (plan.batch) {
    const results = [];
    for (let i = 0; i < entries.length; i++) {
      setStatus("status.decrypting");
      const blob = await EncripterCore.decryptBlob(entries[i].items[0].file, password, {
        onProgress: (f) => report((i + f) / entries.length),
      });
      results.push({ name: plan.names[i], blob });
    }
    return results;
  }

  if (decrypting) {
    setStatus("status.decrypting");
    return EncripterCore.decryptBlob(first.items[0].file, password, {
      onProgress: (f) => report(f),
    });
  }

  let source;
  let start = 0;
  let span = 1;
  if (zipped) {
    setStatus("status.zipping");
    source = await zipItems(allItems(entries), (f) => report(f * ZIP_SHARE));
    start = ZIP_SHARE;
    span = 1 - ZIP_SHARE;
  } else {
    source = first.items[0].file;
  }

  setStatus("status.encrypting");
  return EncripterCore.encryptBlob(source, password, {
    name: originalName(first.name, zipped),
    onProgress: (f) => report(start + f * span),
  });
}

// Returns { savedAs, deleted, deleteFailed }
export async function finishJob(plan, result, { setStatus }) {
  const { target, outName, deleting, entries } = plan;

  if (plan.batch) {
    setStatus("status.saving");
    const saved = [];
    for (const file of result) {
      if (plan.dir) {
        const name = await freeName(plan.dir, file.name);
        const handle = await plan.dir.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(file.blob);
        await writable.close();
        saved.push(name);
      } else {
        downloadBlob(file.blob, file.name);
        saved.push(file.name);
      }
    }
    let deleted = false;
    let deleteFailed = false;
    if (plan.deleting && plan.dir) {
      try {
        await removeOriginals(entries);
        deleted = true;
      } catch (err) {
        console.error(err);
        deleteFailed = true;
      }
    }
    return { savedAs: saved.join(", "), deleted, deleteFailed, saved: Boolean(plan.dir) };
  }

  setStatus("status.saving");
  if (target) {
    const writable = await target.createWritable();
    await writable.write(result);
    await writable.close();
    // Encrypted files are listed in the "protected files" side
    if (!plan.decrypting) await rememberProtected({ handle: target, name: target.name, kind: "enc" });
  } else {
    downloadBlob(result, outName);
  }

  // Only after the new file is saved: remove the originals
  let deleted = false;
  let deleteFailed = false;
  if (deleting && target) {
    try {
      await removeOriginals(entries);
      deleted = true;
    } catch (err) {
      console.error(err);
      deleteFailed = true;
    }
  }
  return { savedAs: target ? target.name : outName, deleted, deleteFailed, saved: Boolean(target) };
}

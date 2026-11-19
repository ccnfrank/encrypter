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
import { FS_ACCESS, downloadBlob, ensureWritable, pickSaveTarget, removeOriginals } from "./save.js";

export class JobError extends Error {}

export async function prepareJob({ entries, password, deleteOriginal }) {
  const decrypting = currentMode(entries) === "decrypt";
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
      throw new JobError("Could not open the save dialog.");
    }
  }

  return { cancelled: false, decrypting, zipped, deleting, outName, target, entries, password };
}

export async function executeJob(plan, { report, setStatus }) {
  const { decrypting, zipped, entries, password } = plan;
  const first = entries[0];

  if (decrypting) {
    setStatus("Decrypting…");
    return EncripterCore.decryptBlob(first.items[0].file, password, {
      onProgress: (f) => report(f),
    });
  }

  let source;
  let start = 0;
  let span = 1;
  if (zipped) {
    setStatus("Zipping…");
    source = await zipItems(allItems(entries), (f) => report(f * ZIP_SHARE));
    start = ZIP_SHARE;
    span = 1 - ZIP_SHARE;
  } else {
    source = first.items[0].file;
  }

  setStatus("Encrypting…");
  return EncripterCore.encryptBlob(source, password, {
    name: originalName(first.name, zipped),
    onProgress: (f) => report(start + f * span),
  });
}

// Returns { savedAs, deleted, deleteFailed }
export async function finishJob(plan, result, { setStatus }) {
  const { target, outName, deleting, entries } = plan;

  setStatus("Saving…");
  if (target) {
    const writable = await target.createWritable();
    await writable.write(result);
    await writable.close();
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

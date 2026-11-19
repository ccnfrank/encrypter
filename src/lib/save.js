import { coded } from "./errors.js";

// Where results go. The File System Access API (Chromium) lets the save dialog start
// in the original folder and lets originals be deleted. Elsewhere, results download.

export const FS_ACCESS = typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";
export const CAN_OPEN_FILES = typeof window !== "undefined" && typeof window.showOpenFilePicker === "function";
export const CAN_OPEN_DIR = typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

// Opens the native save dialog, starting in the folder of the original item.
// Must be called straight from the user's click (user activation).
export async function pickSaveTarget(suggestedName, startIn, decrypting) {
  const options = decrypting
    ? { suggestedName }
    : {
        suggestedName,
        types: [{ description: "Encrypted file", accept: { "application/octet-stream": [".enc"] } }],
      };
  try {
    return await window.showSaveFilePicker(startIn ? { ...options, startIn } : options);
  } catch (err) {
    if (err.name === "AbortError") throw err;
    if (startIn) return pickSaveTarget(suggestedName, undefined, decrypting); // retry without startIn
    throw err;
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Deleting needs write access to each original. The browser asks only for items that
// do not have it yet, and only when the job runs with the box checked.
export async function ensureWritable(entries) {
  const mode = { mode: "readwrite" };
  for (const entry of entries) {
    if (!entry.handle) throw coded("noDelete");
    if ((await entry.handle.queryPermission(mode)) === "granted") continue;
    if ((await entry.handle.requestPermission(mode)) !== "granted") {
      throw coded("permission");
    }
  }
}

// Only called after the new file is saved
export async function removeOriginals(entries) {
  for (const entry of entries) {
    await entry.handle.remove({ recursive: entry.kind === "folder" });
  }
}

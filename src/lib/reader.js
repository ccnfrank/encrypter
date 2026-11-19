// Opens a protected file from the list, in memory only. Nothing is written to disk.
import { EncripterCore } from "./crypto.js";
import { coded } from "./errors.js";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp)$/i;
const TEXT_EXT = /\.(txt|md|csv|tsv|json|log|xml|html?|css|js|jsx|ts|tsx|ya?ml|ini|conf|sh|py|rb|go|rs|java|c|h|cpp|sql)$/i;
const PDF_EXT = /\.pdf$/i;

// Chooses how the file is shown: "pdf", "image", "text" or "other" (download only)
export function viewKind(name, bytes) {
  if (PDF_EXT.test(name)) return "pdf";
  if (IMAGE_EXT.test(name)) return "image";
  if (TEXT_EXT.test(name) || isText(bytes)) return "text";
  return "other";
}

const MIME = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
};

const mimeOf = (name) => MIME[name.split(".").pop().toLowerCase()] || "application/octet-stream";

// Plain text: valid UTF-8 with no NUL bytes in the first 4 KB
function isText(bytes) {
  const head = bytes.subarray(0, 4096);
  if (head.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(head);
    return true;
  } catch {
    return false;
  }
}

// Returns { name, kind, blob, text }. Throws coded errors: wrongPassword, invalid, gone, readPermission.
export async function openProtected(record, password) {
  let file;
  try {
    file = await record.handle.getFile();
  } catch (err) {
    if (err.name === "NotFoundError") throw coded("gone");
    throw err;
  }

  if (record.kind === "pdf") return openPdf(file, record.name, password);

  // Encrypter file: decrypts with the same code as the decrypt job
  const { blob, name } = await EncripterCore.decryptFile(file, password);
  const shownName = name || record.name.replace(/\.enc$/i, "");
  return describe(blob, shownName);
}

async function describe(blob, name) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const kind = viewKind(name, bytes);
  const typed = new Blob([bytes], { type: mimeOf(name) });
  const text = kind === "text" ? new TextDecoder("utf-8").decode(bytes) : null;
  return { name, kind, blob: typed, text };
}

// PDFs protected in place: MuPDF checks the password, then writes an unprotected copy in memory
async function openPdf(file, name, password) {
  const mupdf = await import("mupdf");
  const doc = mupdf.PDFDocument.openDocument(new Uint8Array(await file.arrayBuffer()), "application/pdf");
  if (doc.needsPassword() && !doc.authenticatePassword(password)) throw coded("wrongPassword");
  const buffer = doc.saveToBuffer("encrypt=none");
  const plain = buffer.asUint8Array().slice(); // copy out of WebAssembly memory
  buffer.destroy();
  return { name, kind: "pdf", blob: new Blob([plain], { type: "application/pdf" }), text: null };
}

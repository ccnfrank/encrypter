// PDF protection with the standard PDF encryption (AES-256). The result asks for the
// password when opened, so it works in Preview, Acrobat and other PDF readers.
// The engine (MuPDF, WebAssembly) is loaded only when a PDF is protected.
import { coded } from "./errors.js";

export const isPdfName = (name) => /\.pdf$/i.test(name);

// The options string of MuPDF is split on commas, so a comma can't appear in the password
export const canUseInPdf = (password) => !password.includes(",");

const randomOwnerPassword = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(36)).join("");
};

// Returns the protected PDF bytes. Throws "alreadyLocked" if the PDF already has a password.
export async function protectPdf(bytes, password) {
  const mupdf = await import("mupdf");
  let doc;
  try {
    doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf");
  } catch {
    throw coded("lockFailed");
  }
  if (doc.needsPassword()) throw coded("alreadyLocked");

  // The view from asUint8Array() points into WebAssembly memory, so copy it out before the
  // buffer is freed. Reading the view later can give garbage bytes.
  const buffer = doc.saveToBuffer(`encrypt=aes-256,owner-password=${randomOwnerPassword()},user-password=${password}`);
  const output = buffer.asUint8Array().slice();
  buffer.destroy();

  // Check the result before it replaces the original
  const check = mupdf.Document.openDocument(output, "application/pdf");
  if (!check.needsPassword() || !check.authenticatePassword(password)) throw coded("lockVerify");
  return output;
}

// "Protect PDFs": each PDF is encrypted with its password and written back to the same
// handle, so it keeps its name and extension and no .enc is created. Other files are skipped.
import { EncripterCore } from "./crypto.js";
import { coded } from "./errors.js";
import { isPdfName, protectPdf } from "./pdf.js";
import { rememberProtected } from "./vault.js";

// PDFs that are not protected yet, and how many items were skipped
export async function collectLockTargets(entries) {
  const targets = [];
  let skipped = 0;
  for (const entry of entries) {
    for (const item of entry.items) {
      const isPdf = isPdfName(item.file.name);
      const protectedByEncrypter = isPdf && (await EncripterCore.isEncryptedBlob(item.file));
      if (isPdf && !protectedByEncrypter) targets.push(item);
      else skipped += 1;
    }
  }
  return { targets, skipped };
}

// Returns { count, skipped }. A file is only replaced after its new content is complete.
export async function lockInPlace(entries, password, { report, setStatus }) {
  setStatus("status.encrypting");
  const { targets, skipped: initialSkipped } = await collectLockTargets(entries);
  const total = targets.reduce((sum, item) => sum + item.file.size, 0) || 1;
  let done = 0;
  let count = 0;
  let skipped = initialSkipped;

  for (const item of targets) {
    let output;
    try {
      output = await protectPdf(new Uint8Array(await item.file.arrayBuffer()), password);
    } catch (err) {
      // A PDF that already has a password is left alone; other failures stop the job
      if (err.code !== "alreadyLocked") throw err;
      skipped += 1;
      done += item.file.size;
      report(done / total);
      continue;
    }
    const writable = await item.handle.createWritable();
    await writable.write(output);
    await writable.close();
    await rememberProtected({ handle: item.handle, name: item.file.name, kind: "pdf" });
    count += 1;
    done += item.file.size;
    report(done / total);
  }
  return { count, skipped };
}

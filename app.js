/*
 * Encryter — interface
 * Depends on crypto-core.js (EncripterCore), viz.js (EncripterViz) and JSZip
 * (for folders and several items).
 *
 * Encrypt when the selection holds plain files or folders. Decrypt when every
 * selected item is an encrypted file. Where the browser supports the File System
 * Access API (Chromium), the picker and the save dialog both point at the original
 * location. Elsewhere, the result is downloaded.
 */
(() => {
  "use strict";

  const MIN_LENGTH = 8;
  const MIN_DURATION_MS = 5000; // every job lasts at least this long
  const ZIP_SHARE = 0.35; // share of the progress bar used while zipping

  const FS_ACCESS = typeof window.showSaveFilePicker === "function";
  const CAN_OPEN_FILES = typeof window.showOpenFilePicker === "function";
  const CAN_OPEN_DIR = typeof window.showDirectoryPicker === "function";

  const $ = (id) => document.getElementById(id);
  const el = {
    drop: $("drop"),
    fileInput: $("fileInput"),
    folderInput: $("folderInput"),
    pickFile: $("pickFile"),
    pickFolder: $("pickFolder"),
    picked: $("picked"),
    pickedEmpty: $("pickedEmpty"),
    form: $("form"),
    pwLabel: $("pwLabel"),
    pw: $("pw"),
    pw2: $("pw2"),
    deleteOriginal: $("deleteOriginal"),
    deleteText: $("deleteText"),
    toggle: $("togglePw"),
    strength: document.querySelector(".strength"),
    strengthText: $("strengthText"),
    matchText: $("matchText"),
    bar: $("bar"),
    fill: $("fill"),
    percent: $("percent"),
    statusText: $("statusText"),
    submit: $("submit"),
    submitLabel: $("submitLabel"),
    toast: $("toast"),
    about: $("about"),
    aboutBtn: $("aboutBtn"),
    help: $("help"),
    helpBtn: $("helpBtn"),
    viz: $("viz"),
  };

  const viz = EncripterViz.create(el.viz);

  const ICON_FILE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>';
  const ICON_FOLDER =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';

  // Each entry is one dropped/picked item:
  // { name, kind: 'file' | 'folder', items: [{ path, file }], size, handle, encrypted }
  let entries = [];
  let busy = false;
  let dragDepth = 0;
  let toastTimer = 0;

  /* ---------- helpers ---------- */

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clamp01 = (n) => Math.min(1, Math.max(0, n));

  function formatBytes(bytes) {
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

  function plural(n, one, many) {
    return `${n} ${n === 1 ? one : many}`;
  }

  const totalSize = (items) => items.reduce((sum, item) => sum + item.file.size, 0);
  const isZipped = () => !(entries.length === 1 && entries[0].kind === "file");
  const allItems = () => entries.flatMap((entry) => entry.items);

  // "decrypt" when every selected item is an encrypted file, otherwise "encrypt"
  const currentMode = () =>
    entries.length && entries.every((entry) => entry.kind === "file" && entry.encrypted) ? "decrypt" : "encrypt";

  const sanitizeName = (raw) => raw.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").trim() || "file";

  // The original name, with its extension, is stored inside the encrypted file. Folders
  // and several items are stored as a ".zip" archive.
  function originalName(raw, zipped) {
    const base = sanitizeName(raw);
    return zipped ? `${base.replace(/\.zip$/i, "")}.zip` : base;
  }

  // Output name for encryption: the stored name plus ".enc". The ".enc" keeps the
  // result from overwriting the original.
  const buildOutputName = (raw, zipped) => `${originalName(raw, zipped)}.enc`;

  // Output name for old (version 1) files, which have no stored name: drop ".enc"
  function buildDecryptedName(raw) {
    const base = sanitizeName(raw);
    if (/\.enc$/i.test(base)) return base.replace(/\.enc$/i, "") || "file";
    return `${base}.decrypted`;
  }

  function setStatus(text, tone = "") {
    el.statusText.textContent = text;
    el.statusText.className = `status${tone ? ` is-${tone}` : ""}`;
  }

  function renderProgress(fraction) {
    const pct = Math.round(clamp01(fraction) * 100);
    el.fill.style.width = `${pct}%`;
    el.percent.textContent = `${pct}%`;
    el.bar.setAttribute("aria-valuenow", String(pct));
    viz.setProgress(clamp01(fraction));
  }

  function toast(message, isError = false) {
    el.toast.textContent = message;
    el.toast.className = `toast is-visible${isError ? " is-error" : ""}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("is-visible"), 3200);
  }

  function reportError(err, message) {
    console.error(err);
    toast(message, true);
  }

  /* ---------- building entries ---------- */

  async function collectHandle(handle, prefix, out) {
    if (handle.kind === "file") {
      out.push({ path: prefix + handle.name, file: await handle.getFile() });
      return;
    }
    for await (const child of handle.values()) {
      await collectHandle(child, `${prefix}${handle.name}/`, out);
    }
  }

  async function entryFromHandle(handle) {
    const items = [];
    await collectHandle(handle, "", items);
    return {
      name: handle.name,
      kind: handle.kind === "directory" ? "folder" : "file",
      items,
      size: totalSize(items),
      handle,
    };
  }

  // Fallback for browsers without the File System Access API (drop via webkitGetAsEntry)
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

  async function entryFromLegacy(entry) {
    const items = [];
    await walk(entry, "", items);
    return {
      name: entry.name,
      kind: entry.isDirectory ? "folder" : "file",
      items,
      size: totalSize(items),
      handle: null,
    };
  }

  // Fallback for <input type="file"> (files and folders picked without handles)
  function entriesFromFileList(list) {
    const folders = new Map();
    const out = [];
    for (const file of Array.from(list || [])) {
      const rel = file.webkitRelativePath;
      if (rel) {
        const top = rel.split("/")[0];
        let folder = folders.get(top);
        if (!folder) {
          folder = { name: top, kind: "folder", items: [], size: 0, handle: null };
          folders.set(top, folder);
          out.push(folder);
        }
        folder.items.push({ path: rel, file });
        folder.size += file.size;
      } else {
        out.push({
          name: file.name,
          kind: "file",
          items: [{ path: file.name, file }],
          size: file.size,
          handle: null,
        });
      }
    }
    return out;
  }

  async function addEntries(added) {
    const withContent = added.filter((entry) => entry.items.length > 0);
    if (!withContent.length) {
      toast("Nothing to encrypt. The folder is empty.", true);
      renderSelection();
      return;
    }
    // Detect encrypted files by their header, so the app knows when to decrypt
    await Promise.all(
      withContent.map(async (entry) => {
        entry.encrypted =
          entry.kind === "file" && (await EncripterCore.isEncryptedBlob(entry.items[0].file));
      })
    );
    entries = entries.concat(withContent);
    renderSelection();
  }

  function removeEntry(index) {
    if (busy) return;
    entries.splice(index, 1);
    renderSelection();
  }

  function entryMeta(entry) {
    if (entry.kind === "file") {
      return `${entry.encrypted ? "Encrypted file" : "File"} · ${formatBytes(entry.size)}`;
    }
    return `Folder · ${plural(entry.items.length, "file", "files")} · ${formatBytes(entry.size)}`;
  }

  function renderSelection() {
    el.picked.replaceChildren();
    entries.forEach((entry, index) => {
      const item = document.createElement("li");
      item.className = "picked-item";

      const glyph = document.createElement("div");
      glyph.className = "file-glyph";
      glyph.setAttribute("aria-hidden", "true");
      glyph.innerHTML = entry.kind === "folder" ? ICON_FOLDER : ICON_FILE;

      const info = document.createElement("div");
      info.className = "file-info";
      const name = document.createElement("p");
      name.className = "file-name";
      name.textContent = entry.name;
      const meta = document.createElement("p");
      meta.className = "file-meta";
      meta.textContent = entryMeta(entry);
      info.append(name, meta);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-btn";
      remove.setAttribute("aria-label", `Remove ${entry.name}`);
      remove.textContent = "×";
      remove.addEventListener("click", (e) => {
        e.stopPropagation();
        removeEntry(index);
      });

      item.append(glyph, info, remove);
      el.picked.append(item);
    });

    el.picked.hidden = entries.length === 0;
    el.pickedEmpty.hidden = entries.length > 0;

    const decrypting = currentMode() === "decrypt";
    el.form.classList.toggle("is-decrypt", decrypting);
    el.pwLabel.textContent = decrypting ? "Enter the password" : "Set a password";
    el.deleteText.textContent =
      (decrypting ? "Delete the original file after decrypting" : "Delete the original file after encrypting") +
      (FS_ACCESS ? "" : " (Chrome and Edge only)");
    setStatus(
      !entries.length
        ? "Waiting for a file"
        : decrypting
          ? "Enter the password to decrypt"
          : "Set a password to continue"
    );
    validate();
  }

  /* ---------- pickers ---------- */

  async function openFiles() {
    if (busy) return;
    if (!CAN_OPEN_FILES) {
      el.fileInput.click();
      return;
    }
    try {
      const handles = await window.showOpenFilePicker({ multiple: true });
      await addEntries(await Promise.all(handles.map(entryFromHandle)));
    } catch (err) {
      if (err.name !== "AbortError") reportError(err, "Could not read the selected files.");
    }
  }

  async function openFolder() {
    if (busy) return;
    if (!CAN_OPEN_DIR) {
      el.folderInput.click();
      return;
    }
    try {
      const dir = await window.showDirectoryPicker({ mode: "read" });
      await addEntries([await entryFromHandle(dir)]);
    } catch (err) {
      if (err.name !== "AbortError") reportError(err, "Could not read the selected folder.");
    }
  }

  // Drop: the handles are requested synchronously inside the drop event
  function handleDrop(dataTransfer) {
    const items = Array.from(dataTransfer.items || []).filter((item) => item.kind === "file");
    const useHandles = items.length > 0 && typeof items[0].getAsFileSystemHandle === "function";
    const handlePromises = useHandles ? items.map((item) => item.getAsFileSystemHandle()) : null;
    const legacyEntries = useHandles
      ? []
      : items.map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null)).filter(Boolean);
    const files = dataTransfer.files;

    setStatus("Reading items…");
    readDropped(handlePromises, legacyEntries, files);
  }

  async function readDropped(handlePromises, legacyEntries, files) {
    try {
      let added;
      if (handlePromises) {
        added = await Promise.all(
          handlePromises.map(async (promise) => {
            const handle = await promise;
            return handle ? entryFromHandle(handle) : null;
          })
        );
        added = added.filter(Boolean);
      } else if (legacyEntries.length) {
        added = await Promise.all(legacyEntries.map(entryFromLegacy));
      } else {
        added = entriesFromFileList(files);
      }
      await addEntries(added);
    } catch (err) {
      reportError(err, "Could not read the dropped items.");
      renderSelection();
    }
  }

  /* ---------- password ---------- */

  const LEVEL_TEXT = ["", "Very short", "Fair", "Good", "Strong"];

  function passwordScore(password) {
    if (!password) return 0;
    if (password.length < MIN_LENGTH) return 1;
    const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
    return 2 + (password.length >= 12 ? 1 : 0) + (classes >= 3 ? 1 : 0);
  }

  function updatePasswordUI() {
    const password = el.pw.value;
    const level = passwordScore(password);
    el.strength.dataset.level = String(level);

    if (!password) {
      el.strengthText.textContent = `Use at least ${MIN_LENGTH} characters.`;
      el.strengthText.className = "hint";
    } else if (password.length < MIN_LENGTH) {
      el.strengthText.textContent = `${MIN_LENGTH - password.length} more characters needed.`;
      el.strengthText.className = "hint is-error";
    } else {
      el.strengthText.textContent = `Strength: ${LEVEL_TEXT[level].toLowerCase()}.`;
      el.strengthText.className = "hint is-ok";
    }

    const confirm = el.pw2.value;
    if (!confirm) {
      el.matchText.textContent = "";
      el.matchText.className = "hint";
    } else if (confirm === password) {
      el.matchText.textContent = "Passwords match.";
      el.matchText.className = "hint is-ok";
    } else {
      el.matchText.textContent = "Passwords don't match yet.";
      el.matchText.className = "hint is-error";
    }
  }

  function getState() {
    const password = el.pw.value;
    if (!entries.length) return { ok: false, label: "Choose a file" };

    if (currentMode() === "decrypt") {
      if (entries.length > 1) return { ok: false, label: "Decrypt one file at a time" };
      if (!password) return { ok: false, label: "Enter the password" };
      return { ok: true, label: "Decrypt" };
    }

    if (password.length < MIN_LENGTH) return { ok: false, label: "Set a password" };
    if (el.pw2.value !== password) {
      return { ok: false, label: el.pw2.value ? "Passwords don't match" : "Confirm your password" };
    }
    return { ok: true, label: "Encrypt" };
  }

  function validate() {
    updatePasswordUI();
    if (busy) return;
    const state = getState();
    el.submit.disabled = !state.ok;
    el.submitLabel.textContent = state.label;
  }

  function setBusy(on) {
    busy = on;
    el.drop.classList.toggle("is-busy", on);
    el.bar.classList.toggle("is-working", on);
    el.submit.classList.toggle("is-busy", on);
    el.submit.disabled = on;
    if (on) el.submitLabel.textContent = currentMode() === "decrypt" ? "Decrypting…" : "Encrypting…";
    el.pickFile.disabled = on;
    el.pickFolder.disabled = on;
    el.deleteOriginal.disabled = on || !FS_ACCESS;
    if (!on) validate();
  }

  /* ---------- saving ---------- */

  // Opens the native save dialog, starting in the folder of the original item.
  // Must be called straight from the user's click (before any await-heavy work).
  async function pickSaveTarget(suggestedName, startIn, decrypting) {
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

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function zipItems(items, onProgress) {
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

  // Drives the progress bar: it moves with the real work, and once the work is done
  // it eases to 97% over the time that is left, so the job always lasts MIN_DURATION_MS.
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function startRun() {
    const startedAt = performance.now();
    let actual = 0; // real progress reported by zip/encrypt
    let shown = 0; // value currently drawn
    let workDone = false;
    let workDoneAt = 0;
    let shownAtWorkDone = 0;
    let running = true;
    let frameId = 0;

    const frame = () => {
      if (!running) return;
      const now = performance.now();
      if (!workDone) {
        shown += (Math.min(0.96, actual) - shown) * 0.2;
      } else {
        const span = Math.max(MIN_DURATION_MS - (workDoneAt - startedAt), 400);
        const t = clamp01((now - workDoneAt) / span);
        shown = Math.max(shown, shownAtWorkDone + (0.97 - shownAtWorkDone) * easeInOutCubic(t));
      }
      renderProgress(shown);
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);

    const stop = () => {
      running = false;
      cancelAnimationFrame(frameId);
    };

    return {
      report(fraction) {
        actual = Math.max(actual, clamp01(fraction));
        if (actual >= 1 && !workDone) {
          workDone = true;
          workDoneAt = performance.now();
          shownAtWorkDone = shown;
        }
      },
      async finish() {
        const remaining = MIN_DURATION_MS - (performance.now() - startedAt);
        if (remaining > 0) await sleep(remaining);
        stop();
        renderProgress(1);
      },
      stop,
    };
  }

  async function runJob() {
    const decrypting = currentMode() === "decrypt";
    const password = el.pw.value;
    const first = entries[0];
    const zipped = !decrypting && isZipped();
    const startIn = first.handle || undefined;
    const deleting = el.deleteOriginal.checked && FS_ACCESS;

    // When decrypting, read the original name from the file (this also checks the
    // password), so the save dialog suggests e.g. "texte.png" and not "texte.enc"
    let outName = buildOutputName(first.name, zipped);
    if (decrypting) {
      try {
        const storedName = await EncripterCore.readName(first.items[0].file, password);
        outName = storedName ? sanitizeName(storedName) : buildDecryptedName(first.name);
      } catch (err) {
        reportError(err, err.message);
        setStatus(err.message, "error");
        return;
      }
    }

    // Ask for permission and where to save first: both need the click's user activation
    if (deleting) {
      try {
        await ensureWritable();
      } catch (err) {
        reportError(err, err.message);
        setStatus(err.message, "error");
        return;
      }
    }

    let target = null;
    if (FS_ACCESS) {
      try {
        target = await pickSaveTarget(outName, startIn, decrypting);
      } catch (err) {
        if (err.name === "AbortError") {
          setStatus("Cancelled. Nothing was saved.");
        } else {
          reportError(err, "Could not open the save dialog.");
          setStatus("Could not open the save dialog.", "error");
        }
        return;
      }
    }

    el.bar.classList.remove("is-done");
    setBusy(true);
    const run = startRun();
    viz.start(decrypting ? "Decrypting" : "Encrypting");

    try {
      let result;
      if (decrypting) {
        setStatus("Decrypting…");
        result = await EncripterCore.decryptBlob(first.items[0].file, password, {
          onProgress: (f) => run.report(f),
        });
      } else {
        let source;
        let start = 0;
        let span = 1;
        if (zipped) {
          setStatus("Zipping…");
          source = await zipItems(allItems(), (f) => run.report(f * ZIP_SHARE));
          start = ZIP_SHARE;
          span = 1 - ZIP_SHARE;
        } else {
          source = first.items[0].file;
        }

        setStatus("Encrypting…");
        result = await EncripterCore.encryptBlob(source, password, {
          name: originalName(first.name, zipped),
          onProgress: (f) => run.report(start + f * span),
        });
      }

      setStatus("Saving…");
      if (target) {
        const writable = await target.createWritable();
        await writable.write(result);
        await writable.close();
      } else {
        saveBlob(result, outName);
      }

      // Only after the new file is saved: remove the originals
      let deleted = false;
      if (deleting && target) {
        try {
          for (const entry of entries) {
            await entry.handle.remove({ recursive: entry.kind === "folder" });
          }
          deleted = true;
        } catch (err) {
          console.error(err);
          toast("Saved, but the original could not be deleted.", true);
        }
      }

      await run.finish();
      el.bar.classList.add("is-done");
      if (deleted) {
        entries = [];
        renderSelection();
      }
      const savedAs = target ? target.name : outName;
      const note = deleted ? ". Original deleted" : "";
      setStatus(target ? `Done. Saved as ${savedAs}${note}` : `Done. Downloaded ${savedAs}`, "ok");
      toast(target ? `Saved as ${savedAs}${note}` : `Downloaded ${savedAs}`);

      // Clear the passwords from the screen as soon as the file is saved
      el.pw.value = "";
      el.pw2.value = "";
    } catch (err) {
      run.stop();
      renderProgress(0);
      // Errors from the crypto core are written for the user ("Wrong password…")
      const message = decrypting
        ? err.message || "Decryption failed."
        : "Encryption failed.";
      console.error(err);
      setStatus(message, "error");
      toast(message, true);
    } finally {
      viz.stop();
      setBusy(false);
    }
  }

  /* ---------- deleting the originals ---------- */

  // Deleting needs write access to each original. The browser asks for it only when
  // the job runs with the box checked, and only for items that do not have it yet.
  async function ensureWritable() {
    const mode = { mode: "readwrite" };
    for (const entry of entries) {
      if (!entry.handle) throw new Error("This item can't be deleted from the browser.");
      if ((await entry.handle.queryPermission(mode)) === "granted") continue;
      if ((await entry.handle.requestPermission(mode)) !== "granted") {
        throw new Error("Permission to delete the original was not granted.");
      }
    }
  }

  /* ---------- events ---------- */

  el.pw.addEventListener("input", validate);
  el.pw2.addEventListener("input", validate);

  el.toggle.addEventListener("click", () => {
    const reveal = el.pw.type === "password";
    el.pw.type = reveal ? "text" : "password";
    el.pw2.type = el.pw.type;
    el.toggle.textContent = reveal ? "Hide" : "Show";
    el.toggle.setAttribute("aria-pressed", String(reveal));
  });

  el.pickFile.addEventListener("click", (e) => {
    e.stopPropagation();
    openFiles();
  });

  el.pickFolder.addEventListener("click", (e) => {
    e.stopPropagation();
    openFolder();
  });

  el.drop.addEventListener("click", () => {
    if (!busy) openFiles();
  });

  el.fileInput.addEventListener("change", () => {
    addEntries(entriesFromFileList(el.fileInput.files));
    el.fileInput.value = "";
  });

  el.folderInput.addEventListener("change", () => {
    addEntries(entriesFromFileList(el.folderInput.files));
    el.folderInput.value = "";
  });

  el.drop.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragDepth += 1;
    el.drop.classList.add("is-dragover");
  });

  el.drop.addEventListener("dragover", (e) => e.preventDefault());

  el.drop.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) el.drop.classList.remove("is-dragover");
  });

  el.drop.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    el.drop.classList.remove("is-dragover");
    if (!busy) handleDrop(e.dataTransfer);
  });

  // Dropping outside the drop area must not make the browser open the file
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());

  el.form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (busy || !getState().ok) {
      validate();
      return;
    }
    runJob();
  });

  /* ---------- about dialog ---------- */

  el.aboutBtn.addEventListener("click", () => el.about.showModal());

  // Clicking the backdrop (outside the card) closes the dialog
  el.about.addEventListener("click", (e) => {
    if (e.target === el.about) el.about.close();
  });

  /* ---------- help dialog ---------- */

  el.helpBtn.addEventListener("click", () => el.help.showModal());
  el.help.addEventListener("click", (e) => {
    if (e.target === el.help) el.help.close();
  });

  renderSelection();
})();

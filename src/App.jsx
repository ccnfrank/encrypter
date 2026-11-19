import { useCallback, useEffect, useRef, useState } from "react";
import { MotionConfig, motion, useReducedMotion } from "motion/react";
import Brand from "./components/Brand.jsx";
import DropZone from "./components/DropZone.jsx";
import SelectionList from "./components/SelectionList.jsx";
import PasswordFields from "./components/PasswordFields.jsx";
import ProgressBar from "./components/ProgressBar.jsx";
import SubmitButton from "./components/SubmitButton.jsx";
import HelpDialog from "./components/HelpDialog.jsx";
import AboutDialog from "./components/AboutDialog.jsx";
import Toast from "./components/Toast.jsx";
import { HelpGlyph, InfoGlyph, CheckGlyph } from "./components/icons.jsx";
import { useProgress } from "./hooks/useProgress.js";
import { EncripterViz } from "./lib/viz.js";
import { EncripterCore } from "./lib/crypto.js";
import { CAN_OPEN_DIR, CAN_OPEN_FILES, FS_ACCESS } from "./lib/save.js";
import {
  currentMode,
  entriesFromFileList,
  entryFromHandle,
  entryFromLegacy,
  markEncrypted,
} from "./lib/files.js";
import { matchHint, passwordScore, strengthHint, submitState } from "./lib/password.js";
import { executeJob, finishJob, prepareJob } from "./lib/job.js";

const idleText = (entries, decrypting) =>
  !entries.length
    ? "Waiting for a file"
    : decrypting
      ? "Enter the password to decrypt"
      : "Set a password to continue";

export default function App() {
  const [entries, setEntries] = useState([]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [deleteOriginal, setDeleteOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragover, setDragover] = useState(false);
  const [note, setNote] = useState(null); // { text, tone } shown instead of the idle text
  const [toast, setToast] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [done, setDone] = useState(false);

  const reduce = useReducedMotion();
  const vizCanvasRef = useRef(null);
  const vizRef = useRef(null);
  const fileInput = useRef(null);
  const folderInput = useRef(null);
  const busyRef = useRef(false);
  busyRef.current = busy;
  const progress = useProgress();

  // Canvas visualization: created once, drawn while a job runs
  useEffect(() => {
    vizRef.current = EncripterViz.create(vizCanvasRef.current);
  }, []);

  // Dropping outside the drop area must not make the browser open the file
  useEffect(() => {
    const prevent = (e) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  const showToast = useCallback((message, isError = false) => {
    setToast({ message, isError, id: Date.now() });
  }, []);

  const reportError = useCallback(
    (err, message) => {
      console.error(err);
      showToast(message, true);
    },
    [showToast]
  );

  /* ---------- selection ---------- */

  const addEntries = useCallback(
    async (added) => {
      const withContent = added.filter((entry) => entry.items.length > 0);
      if (!withContent.length) {
        showToast("Nothing to encrypt. The folder is empty.", true);
        return;
      }
      await Promise.all(withContent.map((entry) => markEncrypted(entry, EncripterCore.isEncryptedBlob)));
      setEntries((prev) => [...prev, ...withContent]);
      setNote(null);
      setDone(false);
    },
    [showToast]
  );

  const removeEntry = (id) => {
    if (busyRef.current) return;
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    setNote(null);
  };

  const openFiles = async () => {
    if (busyRef.current) return;
    if (!CAN_OPEN_FILES) {
      fileInput.current.click();
      return;
    }
    try {
      const handles = await window.showOpenFilePicker({ multiple: true });
      await addEntries(await Promise.all(handles.map(entryFromHandle)));
    } catch (err) {
      if (err.name !== "AbortError") reportError(err, "Could not read the selected files.");
    }
  };

  const openFolder = async () => {
    if (busyRef.current) return;
    if (!CAN_OPEN_DIR) {
      folderInput.current.click();
      return;
    }
    try {
      const dir = await window.showDirectoryPicker({ mode: "read" });
      await addEntries([await entryFromHandle(dir)]);
    } catch (err) {
      if (err.name !== "AbortError") reportError(err, "Could not read the selected folder.");
    }
  };

  // Drop: the handles are requested synchronously inside the drop event
  const handleDrop = (dataTransfer) => {
    const items = Array.from(dataTransfer.items || []).filter((item) => item.kind === "file");
    const useHandles = items.length > 0 && typeof items[0].getAsFileSystemHandle === "function";
    const handlePromises = useHandles ? items.map((item) => item.getAsFileSystemHandle()) : null;
    const legacyEntries = useHandles
      ? []
      : items.map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null)).filter(Boolean);
    const files = dataTransfer.files;

    setNote({ text: "Reading items…", tone: "" });
    readDropped(handlePromises, legacyEntries, files);
  };

  const readDropped = async (handlePromises, legacyEntries, files) => {
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
      setNote(null);
    }
  };

  const onFilesChosen = (input) => {
    addEntries(entriesFromFileList(input.files));
    input.value = "";
  };

  /* ---------- job ---------- */

  const mode = currentMode(entries);
  const decrypting = mode === "decrypt";
  const state = submitState({ entries, mode, password, confirm });

  const runJob = async () => {
    // The save dialog must open straight from the click, so preparation comes first
    let plan;
    try {
      plan = await prepareJob({ entries, password, deleteOriginal });
    } catch (err) {
      const message = err.message || "Something went wrong.";
      console.error(err);
      setNote({ text: message, tone: "error" });
      showToast(message, true);
      return;
    }
    if (plan.cancelled) {
      setNote({ text: "Cancelled. Nothing was saved.", tone: "" });
      return;
    }

    setBusy(true);
    setDone(false);
    setNote(null);
    const run = progress.start();
    vizRef.current?.start(plan.decrypting ? "Decrypting" : "Encrypting");
    const setText = (text) => setNote({ text, tone: "" });

    try {
      const result = await executeJob(plan, { report: (f) => run.report(f), setStatus: setText });
      const outcome = await finishJob(plan, result, { setStatus: setText });
      await run.finish();
      setDone(true);

      const note = outcome.deleted ? ". Original deleted" : "";
      if (outcome.deleted) setEntries([]);
      if (outcome.deleteFailed) showToast("Saved, but the original could not be deleted.", true);
      setNote({
        text: outcome.saved ? `Done. Saved as ${outcome.savedAs}${note}` : `Done. Downloaded ${outcome.savedAs}`,
        tone: "ok",
      });
      showToast(outcome.saved ? `Saved as ${outcome.savedAs}${note}` : `Downloaded ${outcome.savedAs}`);

      // Clear the passwords from the screen as soon as the file is saved
      setPassword("");
      setConfirm("");
    } catch (err) {
      run.stop();
      progress.reset();
      const message = plan.decrypting ? err.message || "Decryption failed." : "Encryption failed.";
      console.error(err);
      setNote({ text: message, tone: "error" });
      showToast(message, true);
    } finally {
      vizRef.current?.stop();
      setBusy(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (busy || !state.ok) return;
    runJob();
  };

  const statusText = note?.text ?? idleText(entries, decrypting);
  const statusTone = note?.tone ?? "";
  const submitLabel = busy ? (decrypting ? "Decrypting…" : "Encrypting…") : state.label;
  const deleteLabel =
    (decrypting ? "Delete the original file after decrypting" : "Delete the original file after encrypting") +
    (FS_ACCESS ? "" : " (Chrome and Edge only)");

  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <header className="topbar">
          <Brand />
          <div className="top-actions">
            <button type="button" className="icon-btn" aria-label="How to use Encryter" onClick={() => setHelpOpen(true)}>
              <HelpGlyph />
            </button>
            <button type="button" className="icon-btn" aria-label="About Encryter" onClick={() => setAboutOpen(true)}>
              <InfoGlyph />
            </button>
          </div>
        </header>

        <main className="shell">
          <DropZone
            canvasRef={vizCanvasRef}
            busy={busy}
            dragover={dragover}
            decrypting={decrypting}
            done={done}
            onActivate={openFiles}
            onPickFile={openFiles}
            onPickFolder={openFolder}
            onDragState={setDragover}
            onDrop={(dt) => {
              setDragover(false);
              if (!busy) handleDrop(dt);
            }}
          />

          <motion.form
            className="panel"
            onSubmit={onSubmit}
            noValidate
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <SelectionList entries={entries} onRemove={removeEntry} busy={busy} />

            <PasswordFields
              decrypting={decrypting}
              password={password}
              confirm={confirm}
              onPassword={setPassword}
              onConfirm={setConfirm}
              strength={strengthHint(password)}
              strengthLevel={passwordScore(password)}
              match={matchHint(password, confirm)}
              disabled={busy}
            />

            <label className={`check${busy || !FS_ACCESS ? " is-disabled" : ""}`}>
              <input
                type="checkbox"
                checked={deleteOriginal}
                disabled={busy || !FS_ACCESS}
                onChange={(e) => setDeleteOriginal(e.target.checked)}
              />
              <span className="check-box" aria-hidden="true">
                <CheckGlyph />
              </span>
              <span>{deleteLabel}</span>
            </label>

            <ProgressBar progress={progress} busy={busy} done={done} status={statusText} tone={statusTone} />

            <SubmitButton
              disabled={busy || !state.ok}
              busy={busy}
              done={done}
              decrypting={decrypting}
              label={submitLabel}
            />
          </motion.form>
        </main>

        <input ref={fileInput} type="file" multiple hidden onChange={(e) => onFilesChosen(e.target)} />
        <input
          ref={folderInput}
          type="file"
          webkitdirectory=""
          multiple
          hidden
          onChange={(e) => onFilesChosen(e.target)}
        />
        <Toast toast={toast} />
      </div>

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </MotionConfig>
  );
}

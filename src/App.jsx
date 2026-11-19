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
import ProtectedList from "./components/ProtectedList.jsx";
import ProtectedViewer from "./components/ProtectedViewer.jsx";
import ListGate from "./components/ListGate.jsx";
import { ArrowLeft, Eye } from "lucide-react";
import { HelpGlyph, InfoGlyph, CheckGlyph } from "./components/icons.jsx";
import { useProgress } from "./hooks/useProgress.js";
import { useI18n } from "./i18n/LanguageProvider.jsx";
import LanguageSwitch from "./components/LanguageSwitch.jsx";
import { EncripterViz } from "./lib/viz.js";
import { EncripterCore } from "./lib/crypto.js";
import { CAN_OPEN_DIR, CAN_OPEN_FILES, FS_ACCESS, ensureWritable } from "./lib/save.js";
import {
  currentMode,
  entriesFromFileList,
  entryFromHandle,
  entryFromLegacy,
  markEncrypted,
} from "./lib/files.js";
import { matchHint, passwordScore, strengthHint, submitState } from "./lib/password.js";
import { executeJob, finishJob, prepareJob } from "./lib/job.js";
import { errorText } from "./lib/errors.js";
import { lockInPlace } from "./lib/lock.js";
import { canUseInPdf } from "./lib/pdf.js";
import { pluralKey } from "./i18n/index.mjs";

const idleText = (entries, decrypting, t) =>
  !entries.length ? t("idle.empty") : decrypting ? t("idle.decrypt") : t("idle.encrypt");

export default function App() {
  const { t, lang, locale } = useI18n();
  const [entries, setEntries] = useState([]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [deleteOriginal, setDeleteOriginal] = useState(false);
  const [lockMode, setLockMode] = useState(false); // only set a password, replace the files
  const [busy, setBusy] = useState(false);
  const [dragover, setDragover] = useState(false);
  const [note, setNote] = useState(null); // { text, tone } shown instead of the idle text
  const [toast, setToast] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [flipped, setFlipped] = useState(false); // drop area shows the protected files
  const [viewing, setViewing] = useState(null); // protected file open in the viewer
  const [gateOpen, setGateOpen] = useState(false); // password asked before showing the list

  // Showing the list needs the list password; going back does not
  const requestFlip = useCallback(() => {
    if (flipped) setFlipped(false);
    else setGateOpen(true);
  }, [flipped]);

  const reduce = useReducedMotion();
  const vizCanvasRef = useRef(null);
  const vizRef = useRef(null);
  const fileInput = useRef(null);
  const folderInput = useRef(null);
  const busyRef = useRef(false);
  busyRef.current = busy;
  // The canvas draws its labels every frame, so it reads the latest language through a ref
  const i18nRef = useRef({ t, locale });
  i18nRef.current = { t, locale };
  const progress = useProgress();

  // Canvas visualization: created once, drawn while a job runs
  useEffect(() => {
    vizRef.current = EncripterViz.create(vizCanvasRef.current, (key, vars = {}) => {
      const { t: translate, locale: loc } = i18nRef.current;
      const formatted = {};
      for (const [name, value] of Object.entries(vars)) {
        formatted[name] = typeof value === "number" ? value.toLocaleString(loc) : value;
      }
      return translate(`viz.${key}`, formatted);
    });
  }, []);

  // Alt+F flips between the drop area and the protected files (not while a dialog is open)
  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey || e.code !== "KeyF" || e.ctrlKey || e.metaKey) return;
      if (busyRef.current || viewing || helpOpen || aboutOpen || gateOpen) return;
      e.preventDefault();
      requestFlip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing, helpOpen, aboutOpen, gateOpen, requestFlip]);

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
        showToast(t("toast.empty"), true);
        return;
      }
      await Promise.all(withContent.map((entry) => markEncrypted(entry, EncripterCore.isEncryptedBlob)));
      setEntries((prev) => [...prev, ...withContent]);
      setNote(null);
      setDone(false);
    },
    [showToast, t]
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
      if (err.name !== "AbortError") reportError(err, t("err.readFiles"));
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
      if (err.name !== "AbortError") reportError(err, t("err.readFolder"));
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

    setNote({ text: t("status.reading"), tone: "" });
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
      reportError(err, t("err.readDropped"));
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
  const state = submitState({ entries, mode, password, confirm, t });

  // Protect in place: no .enc, the files keep their names
  const lockAvailable = FS_ACCESS && entries.every((entry) => entry.handle);
  const inPlace = lockMode && lockAvailable && !decrypting;
  const commaBlocked = inPlace && !canUseInPdf(password);

  const runInPlace = async () => {
    // Asks for write permission first, straight from the click
    try {
      await ensureWritable(entries);
    } catch (err) {
      const message = errorText(err, t, "err.generic");
      console.error(err);
      setNote({ text: message, tone: "error" });
      showToast(message, true);
      return;
    }

    setBusy(true);
    setDone(false);
    setNote(null);
    const run = progress.start();
    vizRef.current?.start("encrypting");
    try {
      const { count, skipped } = await lockInPlace(entries, password, {
        report: (f) => run.report(f),
        setStatus: (key) => setNote({ text: t(key), tone: "" }),
      });
      await run.finish();
      setDone(true);
      const main =
        count > 0 ? t("status.locked", { text: t(pluralKey(lang, "lock", count), { n: count }) }) : t("lock.nothing");
      const skipText = skipped ? t(pluralKey(lang, "lock.skip", skipped), { n: skipped }) : "";
      const message = [main, skipText].filter(Boolean).join(" ");
      setNote({ text: message, tone: count > 0 ? "ok" : "" });
      showToast(message);
      if (count > 0) {
        // The selection now points at the old contents, so clear it
        setEntries([]);
        setPassword("");
        setConfirm("");
      }
    } catch (err) {
      run.stop();
      progress.reset();
      const message = errorText(err, t, "err.encryptFailed");
      console.error(err);
      setNote({ text: message, tone: "error" });
      showToast(message, true);
    } finally {
      vizRef.current?.stop();
      setBusy(false);
    }
  };

  const runJob = async () => {
    // The save dialog must open straight from the click, so preparation comes first
    let plan;
    try {
      plan = await prepareJob({ entries, password, deleteOriginal });
    } catch (err) {
      const message = errorText(err, t, "err.generic");
      console.error(err);
      setNote({ text: message, tone: "error" });
      showToast(message, true);
      return;
    }
    if (plan.cancelled) {
      setNote({ text: t("status.cancelled"), tone: "" });
      return;
    }

    setBusy(true);
    setDone(false);
    setNote(null);
    const run = progress.start();
    vizRef.current?.start(plan.decrypting ? "decrypting" : "encrypting");
    const setText = (key) => setNote({ text: t(key), tone: "" });

    try {
      const result = await executeJob(plan, { report: (f) => run.report(f), setStatus: setText });
      const outcome = await finishJob(plan, result, { setStatus: setText });
      await run.finish();
      setDone(true);

      const deletedNote = outcome.deleted ? t("status.deleted") : "";
      if (outcome.deleted) setEntries([]);
      if (outcome.deleteFailed) showToast(t("toast.deleteFailed"), true);
      setNote({
        text: outcome.saved
          ? t("status.done", { name: outcome.savedAs }) + deletedNote
          : t("status.downloaded", { name: outcome.savedAs }),
        tone: "ok",
      });
      showToast(
        outcome.saved ? t("toast.saved", { name: outcome.savedAs }) + deletedNote : t("toast.downloaded", { name: outcome.savedAs })
      );

      // Clear the passwords from the screen as soon as the file is saved
      setPassword("");
      setConfirm("");
    } catch (err) {
      run.stop();
      progress.reset();
      const message = plan.decrypting ? errorText(err, t, "err.decryptFailed") : t("err.encryptFailed");
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
    if (busy || !state.ok || commaBlocked) return;
    if (inPlace) runInPlace();
    else runJob();
  };

  const statusText = note?.text ?? idleText(entries, decrypting, t);
  const statusTone = note?.tone ?? "";
  const shownLabel = commaBlocked ? t("label.noComma") : inPlace && state.ok ? t("label.lock") : state.label;
  const submitLabel = busy
    ? inPlace
      ? t("label.locking")
      : decrypting
        ? t("label.decrypting")
        : t("label.encrypting")
    : shownLabel;
  const deleteLabel = (decrypting ? t("delete.decrypt") : t("delete.encrypt")) + (FS_ACCESS ? "" : t("delete.unsupported"));
  const lockLabel = t("lock.option") + (lockAvailable ? "" : t("lock.unsupported"));

  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <header className="topbar">
          <Brand />
          <div className="top-actions">
            <LanguageSwitch />
            <button type="button" className="icon-btn" aria-label={t("aria.help")} onClick={() => setHelpOpen(true)}>
              <HelpGlyph />
            </button>
            <button type="button" className="icon-btn" aria-label={t("aria.about")} onClick={() => setAboutOpen(true)}>
              <InfoGlyph />
            </button>
          </div>
        </header>

        <main className="shell">
          <div className="flip-stage">
            <div className={`flip${flipped ? " is-flipped" : ""}`}>
              <div className="flip-face flip-front" inert={flipped}>
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
              </div>
              <div className="flip-face flip-back" inert={!flipped}>
                <ProtectedList active={flipped} onOpen={setViewing} />
              </div>
            </div>
            <button
              type="button"
              className="flip-btn"
              aria-pressed={flipped}
              aria-keyshortcuts="Alt+F"
              title="Alt+F"
              onClick={requestFlip}
            >
              {flipped ? (
                <ArrowLeft size={15} strokeWidth={1.8} aria-hidden="true" />
              ) : (
                <Eye size={15} strokeWidth={1.8} aria-hidden="true" />
              )}
              {flipped ? t("flip.back") : t("flip.view")}
            </button>
          </div>

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
              strength={strengthHint(password, t, locale)}
              strengthLevel={passwordScore(password)}
              match={matchHint(password, confirm, t)}
              disabled={busy}
            />

            <label className={`check${busy || !lockAvailable || decrypting ? " is-disabled" : ""}`}>
              <input
                type="checkbox"
                checked={inPlace}
                disabled={busy || !lockAvailable || decrypting}
                onChange={(e) => setLockMode(e.target.checked)}
              />
              <span className="check-box" aria-hidden="true">
                <CheckGlyph />
              </span>
              <span>{lockLabel}</span>
            </label>

            <label className={`check${busy || !FS_ACCESS || inPlace ? " is-disabled" : ""}`}>
              <input
                type="checkbox"
                checked={deleteOriginal}
                disabled={busy || !FS_ACCESS || inPlace}
                onChange={(e) => setDeleteOriginal(e.target.checked)}
              />
              <span className="check-box" aria-hidden="true">
                <CheckGlyph />
              </span>
              <span>{deleteLabel}</span>
            </label>

            <ProgressBar progress={progress} busy={busy} done={done} status={statusText} tone={statusTone} />

            <SubmitButton
              disabled={busy || !state.ok || commaBlocked}
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

      <ProtectedViewer record={viewing} onClose={() => setViewing(null)} />
      <ListGate
        open={gateOpen}
        onUnlock={() => {
          setGateOpen(false);
          setFlipped(true);
        }}
        onCancel={() => setGateOpen(false)}
      />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </MotionConfig>
  );
}

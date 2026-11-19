import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { openProtected } from "../lib/reader.js";
import { coded, errorText } from "../lib/errors.js";
import { downloadBlob } from "../lib/save.js";
import { useI18n } from "../i18n/LanguageProvider.jsx";

// Ask for read permission (a click gives the user activation the browser needs)
async function ensureRead(handle) {
  const mode = { mode: "read" };
  if ((await handle.queryPermission(mode)) === "granted") return true;
  return (await handle.requestPermission(mode)) === "granted";
}

// Pop-up that asks for the password and shows the file. Nothing is saved to disk.
export default function ProtectedViewer({ record, onClose }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(null); // { name, kind, blob, text, url }

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (record && !dialog.open) dialog.showModal();
    if (!record && dialog.open) dialog.close();
  }, [record]);

  // A new file starts with an empty form and no content
  useEffect(() => {
    setPassword("");
    setError("");
    setShown(null);
  }, [record]);

  // Object URLs are released when the content changes or the pop-up closes
  useEffect(() => {
    const url = shown?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [shown]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy || !record || !password) return;
    setBusy(true);
    setError("");
    try {
      if (!(await ensureRead(record.handle))) throw coded("readPermission");
      const result = await openProtected(record, password);
      const url = result.kind === "text" ? null : URL.createObjectURL(result.blob);
      setPassword("");
      setShown({ ...result, url });
    } catch (err) {
      console.error(err);
      setError(errorText(err, t, "err.decryptFailed"));
    } finally {
      setBusy(false);
    }
  };

  const title = shown?.name || record?.name || "";

  return (
    <dialog ref={ref} className="viewer" aria-labelledby="viewerTitle" onClose={onClose}>
      <div className="viewer-card">
        <header className="viewer-head">
          <h2 className="viewer-title" id="viewerTitle">
            {title}
          </h2>
          <button type="button" className="dialog-x" aria-label={t("common.close")} onClick={() => ref.current?.close()}>
            <span aria-hidden="true">×</span>
          </button>
        </header>

        {shown ? (
          <div className="viewer-body">
            {shown.kind === "text" && <pre className="viewer-text">{shown.text}</pre>}
            {shown.kind === "image" && <img className="viewer-image" src={shown.url} alt={shown.name} />}
            {shown.kind === "pdf" && <iframe className="viewer-frame" src={shown.url} title={shown.name} />}
            {shown.kind === "other" && <p className="viewer-note">{t("viewer.unknown")}</p>}
            <div className="viewer-foot">
              <button type="button" className="ghost" onClick={() => downloadBlob(shown.blob, shown.name)}>
                <Download size={16} strokeWidth={1.8} aria-hidden="true" />
                {t("viewer.download")}
              </button>
            </div>
          </div>
        ) : (
          <form className="viewer-unlock" onSubmit={onSubmit} noValidate>
            <p className="viewer-note">{t("viewer.hint")}</p>
            <label className="viewer-field">
              <span>{t("viewer.password")}</span>
              <input
                type="password"
                autoComplete="off"
                value={password}
                disabled={busy}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <p className="viewer-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="ghost" disabled={busy || !password}>
              {busy ? t("viewer.busy") : t("viewer.open")}
            </button>
          </form>
        )}
      </div>
    </dialog>
  );
}

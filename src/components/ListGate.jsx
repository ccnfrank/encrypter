import { useEffect, useRef, useState } from "react";
import {
  MIN_LIST_PASSWORD,
  checkListPassword,
  hasListPassword,
  resetListPassword,
  setListPassword,
} from "../lib/listGate.js";
import { useI18n } from "../i18n/LanguageProvider.jsx";

// Asks for the list password before the protected files are shown.
// First time: creates the password (asks twice).
export default function ListGate({ open, onUnlock, onCancel }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const [mode, setMode] = useState("unlock"); // "create" | "unlock"
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Each opening starts with a fresh form
  useEffect(() => {
    if (!open) return;
    setPassword("");
    setConfirm("");
    setError("");
    hasListPassword().then((has) => setMode(has ? "unlock" : "create"));
  }, [open]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy || !password) return;
    setError("");
    if (mode === "create") {
      if (password.length < MIN_LIST_PASSWORD) return setError(t("gate.short", { min: MIN_LIST_PASSWORD }));
      if (password !== confirm) return setError(t("gate.mismatch"));
      setBusy(true);
      try {
        await setListPassword(password);
        onUnlock();
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      if (await checkListPassword(password)) onUnlock();
      else setError(t("gate.wrong"));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    await resetListPassword();
    setPassword("");
    setConfirm("");
    setError("");
    setMode("create");
  };

  return (
    <dialog ref={ref} className="gate" aria-labelledby="gateTitle" onClose={onCancel}>
      <form className="gate-card" onSubmit={onSubmit} noValidate>
        <header className="viewer-head">
          <h2 className="viewer-title" id="gateTitle">
            {mode === "create" ? t("gate.createTitle") : t("gate.unlockTitle")}
          </h2>
          <button type="button" className="dialog-x" aria-label={t("common.close")} onClick={() => ref.current?.close()}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="gate-body">
          <p className="viewer-note">{mode === "create" ? t("gate.createHint") : t("gate.unlockHint")}</p>
          <label className="viewer-field">
            <span>{t("gate.password")}</span>
            <input
              type="password"
              autoComplete="off"
              autoFocus
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {mode === "create" && (
            <label className="viewer-field">
              <span>{t("gate.confirm")}</span>
              <input
                type="password"
                autoComplete="off"
                value={confirm}
                disabled={busy}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p className="viewer-error" role="alert">
              {error}
            </p>
          )}
          <div className="gate-actions">
            <button type="submit" className="ghost" disabled={busy || !password}>
              {mode === "create" ? t("gate.create") : t("gate.open")}
            </button>
            {mode === "unlock" && (
              <button type="button" className="link-btn" onClick={reset}>
                {t("gate.reset")}
              </button>
            )}
          </div>
          {mode === "unlock" && <p className="viewer-note gate-small">{t("gate.resetNote")}</p>}
        </div>
      </form>
    </dialog>
  );
}

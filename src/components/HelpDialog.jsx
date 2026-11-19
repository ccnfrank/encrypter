import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useI18n } from "../i18n/LanguageProvider.jsx";
import { MIN_LENGTH } from "../lib/files.js";

// Splits a translated sentence around a placeholder so the placeholder can be rendered as <code>
function withCode(text, placeholder, code) {
  return text.split(placeholder).flatMap((part, i) => (i === 0 ? [part] : [<code key={i}>{code}</code>, part]));
}

export default function HelpDialog({ open, onClose }) {
  const { t } = useI18n();
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="help"
      aria-labelledby="helpTitle"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="help-card">
        <button type="button" className="dialog-x" aria-label={t("common.close")} onClick={onClose}>
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </button>
        <h2 className="help-title" id="helpTitle">
          {t("help.title", { app: "encrypter.app" })}
        </h2>
        <ol className="help-steps">
          <li>
            <strong>{t("help.s1.title")}</strong>
            <span>{t("help.s1.body")}</span>
          </li>
          <li>
            <strong>{t("help.s2.title")}</strong>
            <span>{t("help.s2.body")}</span>
          </li>
          <li>
            <strong>{t("help.s3.title")}</strong>
            <span>{t("help.s3.body", { min: MIN_LENGTH })}</span>
          </li>
          <li>
            <strong>{t("help.s4.title")}</strong>
            <span>{t("help.s4.body")}</span>
          </li>
          <li>
            <strong>{t("help.s5.title")}</strong>
            <span>{withCode(t("help.s5.body"), "{enc}", ".enc")}</span>
          </li>
        </ol>
        <p className="help-note">
          {t("help.note")}
        </p>
        <p className="help-note">{t("help.lock")}</p>
        <button type="button" className="ghost" autoFocus onClick={onClose}>
          {t("help.ok")}
        </button>
      </div>
    </dialog>
  );
}

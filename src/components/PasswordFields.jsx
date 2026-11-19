import { useState } from "react";
import { motion } from "motion/react";
import { Eye, EyeOff } from "lucide-react";
import { useI18n } from "../i18n/LanguageProvider.jsx";
import { MIN_LENGTH } from "../lib/files.js";

const SEGMENTS = [0, 1, 2, 3];

export default function PasswordFields({
  decrypting,
  password,
  confirm,
  onPassword,
  onConfirm,
  strength,
  strengthLevel,
  match,
  disabled,
}) {
  const { t } = useI18n();
  const [reveal, setReveal] = useState(false);
  const type = reveal ? "text" : "password";

  return (
    <>
      <div className="field">
        <div className="field-head">
          <label htmlFor="pw">{decrypting ? t("pw.enterLabel") : t("pw.setLabel")}</label>
          <p className={`hint${strength.tone ? ` is-${strength.tone}` : ""}`} aria-live="polite">
            {strength.text}
          </p>
        </div>
        <div className="input-wrap">
          <input
            id="pw"
            type={type}
            autoComplete="new-password"
            placeholder={t("pw.placeholder", { min: MIN_LENGTH })}
            value={password}
            disabled={disabled}
            onChange={(e) => onPassword(e.target.value)}
          />
          <button
            type="button"
            className="toggle"
            aria-controls="pw"
            aria-pressed={reveal}
            aria-label={reveal ? t("aria.hidePassword") : t("aria.showPassword")}
            onClick={() => setReveal((v) => !v)}
          >
            {reveal ? <EyeOff size={17} strokeWidth={1.8} /> : <Eye size={17} strokeWidth={1.8} />}
          </button>
        </div>
        <div className="strength" data-level={strengthLevel} aria-hidden="true">
          {SEGMENTS.map((i) => (
            <motion.span
              key={i}
              initial={false}
              animate={{ scaleX: strengthLevel > i ? 1 : 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 24, delay: i * 0.03 }}
            />
          ))}
        </div>
      </div>

      <div className="field confirm-field">
        <div className="field-head">
          <label htmlFor="pw2">{t("pw.confirmLabel")}</label>
          <p className={`hint${match.tone ? ` is-${match.tone}` : ""}`} aria-live="polite">
            {match.text}
          </p>
        </div>
        <div className="input-wrap">
          <input
            id="pw2"
            type={type}
            autoComplete="new-password"
            placeholder={t("pw.confirmPlaceholder")}
            value={confirm}
            disabled={disabled}
            onChange={(e) => onConfirm(e.target.value)}
          />
        </div>
      </div>
    </>
  );
}

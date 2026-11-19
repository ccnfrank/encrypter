import { LANGUAGES } from "../i18n/index.mjs";
import { useI18n } from "../i18n/LanguageProvider.jsx";

export default function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();

  return (
    <div className="lang-switch" role="group" aria-label={t("lang.label")}>
      {LANGUAGES.map((option) => (
        <button
          key={option.code}
          type="button"
          className="lang-btn"
          aria-pressed={lang === option.code}
          title={option.name}
          lang={option.code}
          onClick={() => setLang(option.code)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { detectLanguage, localeOf, makeT, saveLanguage } from "./index.mjs";

const I18nContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(detectLanguage);

  const changeLanguage = useCallback((code) => {
    setLang(code);
    saveLanguage(code);
  }, []);

  useEffect(() => {
    document.documentElement.lang = localeOf(lang);
  }, [lang]);

  const value = useMemo(
    () => ({ lang, locale: localeOf(lang), setLang: changeLanguage, t: makeT(lang) }),
    [lang, changeLanguage]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

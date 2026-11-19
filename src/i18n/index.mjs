// Interface languages. Keys live in en.mjs, de.mjs, pt.mjs and es.mjs.
import en from "./en.mjs";
import de from "./de.mjs";
import pt from "./pt.mjs";
import es from "./es.mjs";

export const LANGUAGES = [
  { code: "en", label: "EN", name: "English", locale: "en-US" },
  { code: "de", label: "DE", name: "Deutsch", locale: "de-DE" },
  { code: "pt", label: "PT", name: "Português", locale: "pt-BR" },
  { code: "es", label: "ES", name: "Español", locale: "es-ES" },
];

const DICTIONARIES = { en, de, pt, es };
const STORAGE_KEY = "encrypter.lang";

export const localeOf = (code) => LANGUAGES.find((lang) => lang.code === code)?.locale ?? "en-US";

// Saved choice first, then the browser language, then English
export function detectLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && DICTIONARIES[saved]) return saved;
  } catch {
    // Storage can be blocked (private window, disabled site data)
  }
  const browser = (typeof navigator !== "undefined" && navigator.language ? navigator.language : "en")
    .slice(0, 2)
    .toLowerCase();
  return DICTIONARIES[browser] ? browser : "en";
}

export function saveLanguage(code) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Not stored: the choice lasts until the page is reloaded
  }
}

// t(key, vars): looks the key up in the language, falls back to English, replaces {name} placeholders
export function makeT(code) {
  const dict = DICTIONARIES[code] || en;
  return (key, vars = {}) => {
    const text = dict[key] ?? en[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
  };
}

// Key for a count, e.g. "<base>.one" or "<base>.other", following the language's plural rules
export function pluralKey(code, base, n) {
  return `${base}.${new Intl.PluralRules(localeOf(code)).select(n)}`;
}

export const countKey = (code, n) => pluralKey(code, "count", n);

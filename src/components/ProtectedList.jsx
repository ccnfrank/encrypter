import { useEffect, useMemo, useState } from "react";
import { File, FileLock2, Search, X } from "lucide-react";
import { FS_ACCESS } from "../lib/save.js";
import { forgetProtected, listProtected } from "../lib/vault.js";
import { useI18n } from "../i18n/LanguageProvider.jsx";

// Name without the ".enc" and the file extension: "diario.txt.enc" -> "diario"
export const displayName = (name) => name.replace(/\.enc$/i, "").replace(/(.)\.[^.]+$/, "$1");

// Back side of the drop area: the files this browser has encrypted or protected
export default function ProtectedList({ active, onOpen }) {
  const { t, locale } = useI18n();
  const [records, setRecords] = useState([]);
  const [query, setQuery] = useState("");

  // Reload each time the side is shown, so new files appear
  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    listProtected().then((list) => {
      if (alive) setRecords(list);
    });
    return () => {
      alive = false;
    };
  }, [active]);

  const forget = async (id) => {
    setRecords((prev) => prev.filter((record) => record.id !== id));
    await forgetProtected(id);
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter((record) => displayName(record.name).toLowerCase().includes(q));
  }, [records, query]);

  let body;
  if (!FS_ACCESS) body = <p className="vault-empty">{t("vault.unsupported")}</p>;
  else if (!records.length) body = <p className="vault-empty">{t("vault.empty")}</p>;
  else
    body = (
      <>
        <label className="vault-search">
          <Search size={16} strokeWidth={1.8} aria-hidden="true" />
          <span className="visually-hidden">{t("vault.search")}</span>
          <input
            type="search"
            value={query}
            placeholder={t("vault.search")}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {shown.length ? (
          <ul className="vault-list" aria-label={t("vault.title")}>
            {shown.map((record) => (
              <li key={record.id} className="vault-item">
                <button type="button" className="vault-open" onClick={() => onOpen(record)}>
                  <span className="file-glyph" aria-hidden="true">
                    {record.kind === "pdf" ? <FileLock2 size={16} strokeWidth={1.8} /> : <File size={16} strokeWidth={1.8} />}
                  </span>
                  <span className="file-info">
                    <span className="file-name">{displayName(record.name)}</span>
                    <span className="file-meta">
                      {t(`vault.kind.${record.kind}`)} · {new Date(record.savedAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="remove-btn"
                  aria-label={t("vault.forget", { name: record.name })}
                  onClick={() => forget(record.id)}
                >
                  <X size={15} strokeWidth={2} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="vault-empty">{t("vault.noMatch")}</p>
        )}
      </>
    );

  return (
    <section className="vault" aria-label={t("vault.title")}>
      <header className="vault-head">
        <h2 className="vault-title">{t("vault.title")}</h2>
      </header>
      {body}
    </section>
  );
}

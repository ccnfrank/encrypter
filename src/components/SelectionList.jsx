import { AnimatePresence, motion } from "motion/react";
import { File, Folder, X } from "lucide-react";
import { entryMeta } from "../lib/files.js";
import { useI18n } from "../i18n/LanguageProvider.jsx";

export default function SelectionList({ entries, onRemove, busy }) {
  const { t, lang, locale } = useI18n();
  return (
    <div className="picked">
      <ul className="picked-list" aria-label={t("aria.selected")} hidden={!entries.length}>
        <AnimatePresence initial={false}>
          {entries.map((entry) => (
            <motion.li
              key={entry.id}
              className="picked-item"
              layout="position"
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 14, transition: { duration: 0.18 } }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              <div className={`file-glyph${entry.kind === "folder" ? " is-folder" : ""}`} aria-hidden="true">
                {entry.kind === "folder" ? <Folder size={18} strokeWidth={1.8} /> : <File size={18} strokeWidth={1.8} />}
              </div>
              <div className="file-info">
                <p className="file-name">{entry.name}</p>
                <p className="file-meta">{entryMeta(entry, t, lang, locale)}</p>
              </div>
              <button
                type="button"
                className="remove-btn"
                aria-label={t("aria.remove", { name: entry.name })}
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(entry.id);
                }}
              >
                <X size={15} strokeWidth={2} aria-hidden="true" />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {!entries.length && <p className="picked-empty">{t("list.empty")}</p>}
    </div>
  );
}

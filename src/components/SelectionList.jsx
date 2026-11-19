import { AnimatePresence, motion } from "motion/react";
import { File, Folder, X } from "lucide-react";
import { entryMeta } from "../lib/files.js";

export default function SelectionList({ entries, onRemove, busy }) {
  return (
    <div className="picked">
      <ul className="picked-list" aria-label="Selected files and folders" hidden={!entries.length}>
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
                <p className="file-meta">{entryMeta(entry)}</p>
              </div>
              <button
                type="button"
                className="remove-btn"
                aria-label={`Remove ${entry.name}`}
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
      {!entries.length && <p className="picked-empty">Nothing selected yet.</p>}
    </div>
  );
}

import { useRef } from "react";
import { FilePlus2, FolderOpen } from "lucide-react";
import Seal from "./Seal.jsx";
import { useI18n } from "../i18n/LanguageProvider.jsx";

export default function DropZone({
  canvasRef,
  busy,
  dragover,
  decrypting,
  done,
  onActivate,
  onPickFile,
  onPickFolder,
  onDragState,
  onDrop,
}) {
  const { t } = useI18n();
  const depth = useRef(0);

  const onEnter = (e) => {
    e.preventDefault();
    depth.current += 1;
    onDragState(true);
  };
  const onLeave = () => {
    depth.current = Math.max(0, depth.current - 1);
    if (!depth.current) onDragState(false);
  };
  const onDropEvent = (e) => {
    e.preventDefault();
    depth.current = 0;
    onDrop(e.dataTransfer);
  };

  return (
    <section
      className={`drop${busy ? " is-busy" : ""}${dragover ? " is-dragover" : ""}`}
      aria-label={t("aria.drop")}
      onClick={() => {
        if (!busy) onActivate();
      }}
      onDragEnter={onEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onLeave}
      onDrop={onDropEvent}
    >
      <Seal busy={busy} dragover={dragover} decrypting={decrypting} done={done} />

      <canvas className="viz" ref={canvasRef} aria-hidden="true" />

      <div className="drop-copy">
        <h1>{t("drop.title")}</h1>
        <p>{t("drop.subtitle")}</p>
        <div className="drop-actions">
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onPickFile();
            }}
          >
            <FilePlus2 size={16} strokeWidth={1.8} aria-hidden="true" />
            {t("drop.chooseFiles")}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onPickFolder();
            }}
          >
            <FolderOpen size={16} strokeWidth={1.8} aria-hidden="true" />
            {t("drop.chooseFolder")}
          </button>
        </div>
      </div>
    </section>
  );
}

import { useRef } from "react";
import { FilePlus2, FolderOpen } from "lucide-react";
import Seal from "./Seal.jsx";

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
      aria-label="Drop area for files or folders"
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
        <h1>Drag your files here</h1>
        <p>Encrypt and Decrypt files and folders.</p>
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
            Choose files
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
            Choose folder
          </button>
        </div>
      </div>
    </section>
  );
}

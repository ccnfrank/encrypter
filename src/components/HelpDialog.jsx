import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export default function HelpDialog({ open, onClose }) {
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
        <button type="button" className="dialog-x" aria-label="Close" onClick={onClose}>
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </button>
        <h2 className="help-title" id="helpTitle">
          How to use encrypter.app
        </h2>
        <ol className="help-steps">
          <li>
            <strong>Add your files</strong>
            <span>Drop files or folders in the area above, or use Choose files / Choose folder. Folders and multiple items are zipped first.</span>
          </li>
          <li>
            <strong>Let the app pick the action</strong>
            <span>Files that are not encrypted yet get encrypted. Files already encrypted with Encrypter get decrypted.</span>
          </li>
          <li>
            <strong>Set a password</strong>
            <span>Use at least 8 characters and type it twice. Without it, the file cannot be opened again.</span>
          </li>
          <li>
            <strong>Optional: delete the original</strong>
            <span>Check the box to remove the original after encrypting. Deleted files are not sent to the Trash.</span>
          </li>
          <li>
            <strong>Choose where to save</strong>
            <span>
              Click the button and pick the name and folder. Encrypted files keep the original name with <code>.enc</code> added.
              Decrypted files get their original name and extension back.
            </span>
          </li>
        </ol>
        <p className="help-note">
          Saving to a chosen folder and deleting originals work in Chrome and Edge. In other browsers, the file is downloaded and the delete option is turned off.
        </p>
        <button type="button" className="ghost" autoFocus onClick={onClose}>
          Got it
        </button>
      </div>
    </dialog>
  );
}

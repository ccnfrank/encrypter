import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { GithubGlyph } from "./icons.jsx";
import pkg from "../../package.json";

export default function AboutDialog({ open, onClose }) {
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
      className="about"
      aria-labelledby="aboutTitle"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="about-card">
        <button type="button" className="dialog-x" aria-label="Close" onClick={onClose}>
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </button>
        <p className="about-name" id="aboutTitle">
          encrypter<span className="brand-tld">.app</span>
        </p>
        <p className="about-version">
          Version <span>{pkg.version}</span>
        </p>
        <p className="about-dev">developed by ®Christian Frank</p>
        <a className="about-link" href="https://github.com/ccnfrank" target="_blank" rel="noopener noreferrer">
          <GithubGlyph />
          <span>/ccnfrank</span>
        </a>
        <button type="button" className="ghost" autoFocus onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
}

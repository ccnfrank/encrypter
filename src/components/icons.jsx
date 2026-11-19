// Brand glyphs (help, info, check) are drawn here; general UI icons come from lucide-react.

export function HelpGlyph() {
  return (
    <svg className="help-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle className="help-ring" cx="12" cy="12" r="9.5" />
      <path className="help-mark" d="M9.4 9.4a2.7 2.7 0 1 1 3.8 2.5c-.8.35-1.2.95-1.2 1.8v.5" />
      <circle className="help-dot" cx="12" cy="17.1" r="1.25" />
    </svg>
  );
}

export function InfoGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle className="info-ring" cx="12" cy="12" r="10" />
      <circle className="info-dot" cx="12" cy="7.9" r="1.45" />
      <path className="info-bar" d="M12 11.3v5.4" />
    </svg>
  );
}

export function CheckGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3.5 8.5l3 3 6-6.5" />
    </svg>
  );
}

export function GithubGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

// Brand lock mark, as in icon.svg
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1.5 2.6" />
      <rect x="11" y="15" width="10" height="8" rx="2" fill="currentColor" />
      <path d="M13 15v-2.5a3 3 0 0 1 6 0V15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

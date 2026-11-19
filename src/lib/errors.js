// Errors carry a code, and the UI shows the matching translated message.
// Errors without a code (browser errors) show their own text, or a generic one.
export function coded(code, message = code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// Browser errors (DOMException) have numeric codes, e.g. 18 = SecurityError. Only our own
// text codes have a translation, so anything else shows the browser's message.
export function errorText(err, t, fallbackKey) {
  const key = typeof err?.code === "string" ? `err.${err.code}` : null;
  if (key) {
    const text = t(key);
    if (text !== key) return text;
  }
  return err?.message || t(fallbackKey);
}

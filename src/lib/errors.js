// Errors carry a code, and the UI shows the matching translated message.
// Errors without a code (browser errors) show their own text, or a generic one.
export function coded(code, message = code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export function errorText(err, t, fallbackKey) {
  if (err?.code) return t(`err.${err.code}`);
  return err?.message || t(fallbackKey);
}

import { MIN_LENGTH } from "./files.js";

export const LEVEL_TEXT = ["", "Very short", "Fair", "Good", "Strong"];

export function passwordScore(password) {
  if (!password) return 0;
  if (password.length < MIN_LENGTH) return 1;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  return 2 + (password.length >= 12 ? 1 : 0) + (classes >= 3 ? 1 : 0);
}

// Hint under the password field: { text, tone } where tone is '', 'ok' or 'error'
export function strengthHint(password) {
  if (!password) return { text: `Use at least ${MIN_LENGTH} characters.`, tone: "" };
  if (password.length < MIN_LENGTH) {
    return { text: `${MIN_LENGTH - password.length} more characters needed.`, tone: "error" };
  }
  const level = passwordScore(password);
  return { text: `Strength: ${LEVEL_TEXT[level].toLowerCase()}.`, tone: "ok" };
}

// Hint under the confirm field
export function matchHint(password, confirm) {
  if (!confirm) return { text: "", tone: "" };
  if (confirm === password) return { text: "Passwords match.", tone: "ok" };
  return { text: "Passwords don't match yet.", tone: "error" };
}

// Label and enabled state of the main button
export function submitState({ entries, mode, password, confirm }) {
  if (!entries.length) return { ok: false, label: "Choose a file" };
  if (mode === "decrypt") {
    if (entries.length > 1) return { ok: false, label: "Decrypt one file at a time" };
    if (!password) return { ok: false, label: "Enter the password" };
    return { ok: true, label: "Decrypt" };
  }
  if (password.length < MIN_LENGTH) return { ok: false, label: "Set a password" };
  if (confirm !== password) {
    return { ok: false, label: confirm ? "Passwords don't match" : "Confirm your password" };
  }
  return { ok: true, label: "Encrypt" };
}

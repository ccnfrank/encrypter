import { MIN_LENGTH } from "./files.js";

export function passwordScore(password) {
  if (!password) return 0;
  if (password.length < MIN_LENGTH) return 1;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  return 2 + (password.length >= 12 ? 1 : 0) + (classes >= 3 ? 1 : 0);
}

// Hint under the password field: { text, tone } where tone is '', 'ok' or 'error'
export function strengthHint(password, t, locale) {
  if (!password) return { text: t("pw.hintStart", { min: MIN_LENGTH }), tone: "" };
  if (password.length < MIN_LENGTH) {
    return { text: t("pw.hintMore", { count: MIN_LENGTH - password.length }), tone: "error" };
  }
  const level = passwordScore(password);
  const levelText = t(`level.${level}`).toLocaleLowerCase(locale);
  return { text: t("pw.hintStrength", { level: levelText }), tone: "ok" };
}

// Hint under the confirm field
export function matchHint(password, confirm, t) {
  if (!confirm) return { text: "", tone: "" };
  if (confirm === password) return { text: t("pw.match"), tone: "ok" };
  return { text: t("pw.noMatch"), tone: "error" };
}

// Label and enabled state of the main button
export function submitState({ entries, mode, password, confirm, t }) {
  if (!entries.length) return { ok: false, label: t("label.chooseFile") };
  if (mode === "decrypt") {
    if (entries.length > 1) return { ok: false, label: t("label.oneAtATime") };
    if (!password) return { ok: false, label: t("label.enterPassword") };
    return { ok: true, label: t("label.decrypt") };
  }
  if (password.length < MIN_LENGTH) return { ok: false, label: t("label.setPassword") };
  if (confirm !== password) {
    return { ok: false, label: confirm ? t("label.noMatch") : t("label.confirmPassword") };
  }
  return { ok: true, label: t("label.encrypt") };
}

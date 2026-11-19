// Password for opening the list of protected files. It guards the list in this browser
// only: it does not encrypt anything. Only a PBKDF2 hash is stored.
import { deleteSetting, getSetting, setSetting } from "./vault.js";

const KEY = "listPassword";
const ITERATIONS = 600_000;
export const MIN_LIST_PASSWORD = 8;

const bytesToB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const b64ToBytes = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(password, salt) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    material,
    256
  );
  return new Uint8Array(bits);
}

export async function hasListPassword() {
  return Boolean(await getSetting(KEY));
}

export async function setListPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  await setSetting(KEY, { salt: bytesToB64(salt), hash: bytesToB64(hash) });
}

export async function checkListPassword(password) {
  const stored = await getSetting(KEY);
  if (!stored) return true;
  const hash = await derive(password, b64ToBytes(stored.salt));
  const expected = b64ToBytes(stored.hash);
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ expected[i];
  return diff === 0;
}

export async function resetListPassword() {
  await deleteSetting(KEY);
}

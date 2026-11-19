import { test } from "node:test";
import assert from "node:assert/strict";
import en from "../src/i18n/en.mjs";
import de from "../src/i18n/de.mjs";
import pt from "../src/i18n/pt.mjs";
import es from "../src/i18n/es.mjs";
import { makeT, countKey, LANGUAGES } from "../src/i18n/index.mjs";

test("every language has exactly the same keys as English", () => {
  const keys = Object.keys(en).sort();
  assert.deepEqual(Object.keys(de).sort(), keys);
  assert.deepEqual(Object.keys(pt).sort(), keys);
  assert.deepEqual(Object.keys(es).sort(), keys);
});

test("placeholders in each language match the English ones", () => {
  const placeholders = (text) => (text.match(/\{\w+\}/g) || []).sort().join(" ");
  for (const key of Object.keys(en)) {
    assert.equal(placeholders(de[key]), placeholders(en[key]), `de: ${key}`);
    assert.equal(placeholders(pt[key]), placeholders(en[key]), `pt: ${key}`);
    assert.equal(placeholders(es[key]), placeholders(en[key]), `es: ${key}`);
  }
});

test("t() fills placeholders and falls back to English", () => {
  const tDe = makeT("de");
  assert.equal(tDe("status.done", { name: "a.txt.enc" }), "Fertig. Gespeichert als a.txt.enc");
  assert.equal(makeT("xx")("label.encrypt"), "Encrypt");
  assert.equal(makeT("en")("missing.key"), "missing.key");
});

test("count keys follow each language's plural rules", () => {
  assert.equal(countKey("en", 1), "count.one");
  assert.equal(countKey("en", 3), "count.other");
  assert.equal(countKey("de", 1), "count.one");
  assert.equal(countKey("pt", 2), "count.other");
});

test("language list offers English, German, Portuguese and Spanish", () => {
  assert.deepEqual(LANGUAGES.map((l) => l.code), ["en", "de", "pt", "es"]);
});

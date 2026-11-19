const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// crypto-core.js is a browser script: run it and take the global it exposes
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "src", "lib", "crypto-core.js"), "utf8"));
const { encryptBlob, decryptBlob, decryptFile, readName, isEncryptedBlob, HEADER_LEN } = globalThis.EncripterCore;

// name length field (4) + name block tag (16) when the name is empty
const NAME_BLOCK_EMPTY = 4 + 16;

async function bytesOf(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

function sampleData(size) {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) data[i] = (i * 31 + 7) & 0xff;
  return data;
}

test("round-trip of a small file", async () => {
  const original = new TextEncoder().encode("hello, secret world");
  const enc = await encryptBlob(new Blob([original]), "strong-pass-123");
  const dec = await decryptBlob(enc, "strong-pass-123");
  assert.deepEqual(await bytesOf(dec), original);
});

test("empty file yields one block with a tag and decrypts to empty", async () => {
  const enc = await encryptBlob(new Blob([]), "strong-pass-123");
  assert.equal(enc.size, HEADER_LEN + NAME_BLOCK_EMPTY + 16);
  const dec = await decryptBlob(enc, "strong-pass-123");
  assert.equal(dec.size, 0);
});

test("round-trip across multiple blocks (small chunkSize)", async () => {
  const original = sampleData(10_000);
  const enc = await encryptBlob(new Blob([original]), "pass", { chunkSize: 1024 });
  // 10 000 bytes in 1024-byte blocks → 10 blocks, each with a 16-byte tag
  assert.equal(enc.size, HEADER_LEN + NAME_BLOCK_EMPTY + 10_000 + 10 * 16);
  const dec = await decryptBlob(enc, "pass");
  assert.deepEqual(await bytesOf(dec), original);
});

test("size that is an exact multiple of the block does not add an extra block", async () => {
  const original = sampleData(4096);
  const enc = await encryptBlob(new Blob([original]), "pass", { chunkSize: 1024 });
  assert.equal(enc.size, HEADER_LEN + NAME_BLOCK_EMPTY + 4096 + 4 * 16);
  assert.deepEqual(await bytesOf(await decryptBlob(enc, "pass")), original);
});

test("wrong password is rejected", async () => {
  const enc = await encryptBlob(new Blob(["data"]), "right");
  await assert.rejects(decryptBlob(enc, "wrong"), /Wrong password/);
});

test("tampered header is rejected (AAD)", async () => {
  const enc = await encryptBlob(new Blob([sampleData(500)]), "pass", { chunkSize: 128 });
  const bytes = await bytesOf(enc);
  bytes[33] ^= 0x01; // changes the declared block size
  await assert.rejects(decryptBlob(new Blob([bytes]), "pass"));
});

test("tampered ciphertext is rejected", async () => {
  const enc = await encryptBlob(new Blob([sampleData(500)]), "pass");
  const bytes = await bytesOf(enc);
  bytes[HEADER_LEN + 10] ^= 0xff;
  await assert.rejects(decryptBlob(new Blob([bytes]), "pass"), /Wrong password|corrupted/);
});

test("file without the magic header is rejected", async () => {
  await assert.rejects(decryptBlob(new Blob([new Uint8Array(64)]), "pass"), /Invalid or corrupted/);
});

test("isEncryptedBlob detects the header only", async () => {
  const enc = await encryptBlob(new Blob(["x"]), "pass");
  assert.equal(await isEncryptedBlob(enc), true);
  assert.equal(await isEncryptedBlob(new Blob(["plain text file"])), false);
  assert.equal(await isEncryptedBlob(new Blob([])), false);
});

test("original file name, with its extension, is restored on decrypt", async () => {
  const original = new TextEncoder().encode("\x89PNG fake image bytes");
  const enc = await encryptBlob(new Blob([original]), "pass", { name: "texte.png" });
  assert.equal(await readName(enc, "pass"), "texte.png");
  const { blob, name } = await decryptFile(enc, "pass");
  assert.equal(name, "texte.png");
  assert.deepEqual(await bytesOf(blob), original);
});

test("names with accents and multi-block data keep their name", async () => {
  const original = sampleData(5000);
  const enc = await encryptBlob(new Blob([original]), "pass", {
    name: "Relatório final ção.pdf",
    chunkSize: 512,
  });
  const { blob, name } = await decryptFile(enc, "pass");
  assert.equal(name, "Relatório final ção.pdf");
  assert.deepEqual(await bytesOf(blob), original);
});

test("readName rejects a wrong password before anything is saved", async () => {
  const enc = await encryptBlob(new Blob(["data"]), "right", { name: "a.txt" });
  await assert.rejects(readName(enc, "wrong"), /Wrong password/);
});

test("each encryption uses a fresh salt and IV", async () => {
  const data = new Blob(["same content"]);
  const a = await bytesOf(await encryptBlob(data, "pass"));
  const b = await bytesOf(await encryptBlob(data, "pass"));
  assert.notDeepEqual(a.slice(5, 33), b.slice(5, 33));
  assert.notDeepEqual(a, b);
});

test("onProgress reaches 1 and is monotonic", async () => {
  const values = [];
  await encryptBlob(new Blob([sampleData(5000)]), "pass", {
    chunkSize: 1000,
    onProgress: (v) => values.push(v),
  });
  assert.equal(values[values.length - 1], 1);
  for (let i = 1; i < values.length; i++) assert.ok(values[i] >= values[i - 1]);
});

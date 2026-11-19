/*
 * Encripter — núcleo criptográfico
 *
 * Formato do arquivo .enc (versão 2):
 *   [ cabeçalho (37 bytes) ][ tamanho do nome (4) ][ bloco do nome ][ bloco 1 ] ... [ bloco N ]
 *
 *   cabeçalho:
 *     0..3    magic "ENC1"
 *     4       versão (2)
 *     5..20   salt (16 bytes) para PBKDF2
 *     21..32  IV base (12 bytes)
 *     33..36  tamanho do bloco em bytes (uint32, big-endian)
 *
 *   tamanho do nome: uint32 big-endian com o tamanho do bloco do nome (cifrado)
 *   bloco do nome: nome original do arquivo (com extensão), cifrado — índice 0
 *   blocos de dados: AES-256-GCM sobre até `chunkSize` bytes do original, com tag
 *   de 16 bytes — índices 1..N
 *
 *   O IV de cada bloco é o IV base com os últimos 4 bytes somados (XOR) ao índice
 *   do bloco. O cabeçalho inteiro é usado como dados adicionais (AAD), então
 *   adulterá-lo quebra a leitura.
 *
 *   Versão 1 (legado): igual, sem o bloco do nome. Continua sendo lida.
 *
 * A chave é derivada da senha com PBKDF2-SHA-256 (600 000 iterações).
 */
(function () {
  const MAGIC = new Uint8Array([0x45, 0x4e, 0x43, 0x31]); // "ENC1"
  const VERSION = 2;
  const LEGACY_VERSION = 1;
  const SALT_LEN = 16;
  const IV_LEN = 12;
  const TAG_LEN = 16;
  const HEADER_LEN = 4 + 1 + SALT_LEN + IV_LEN + 4; // 37
  const NAME_LEN_FIELD = 4;
  const DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1 MiB
  const ITERATIONS = 600000;

  const invalid = () => new Error("Invalid or corrupted file.");
  const wrongPassword = () => new Error("Wrong password or corrupted file.");

  async function deriveKey(password, salt) {
    const material = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  function chunkIv(baseIv, index) {
    const iv = baseIv.slice();
    const view = new DataView(iv.buffer, iv.byteOffset, iv.byteLength);
    const tail = view.getUint32(IV_LEN - 4);
    view.setUint32(IV_LEN - 4, (tail ^ index) >>> 0);
    return iv;
  }

  function readU32(bytes, at) {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at);
  }

  function buildHeader(salt, baseIv, chunkSize) {
    const header = new Uint8Array(HEADER_LEN);
    header.set(MAGIC, 0);
    header[4] = VERSION;
    header.set(salt, 5);
    header.set(baseIv, 5 + SALT_LEN);
    new DataView(header.buffer).setUint32(HEADER_LEN - 4, chunkSize);
    return header;
  }

  async function seal(key, baseIv, index, aad, plain) {
    const cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: chunkIv(baseIv, index), additionalData: aad, tagLength: TAG_LEN * 8 },
      key,
      plain
    );
    return new Uint8Array(cipher);
  }

  async function open(key, baseIv, index, aad, cipher) {
    try {
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: chunkIv(baseIv, index), additionalData: aad, tagLength: TAG_LEN * 8 },
        key,
        cipher
      );
      return new Uint8Array(plain);
    } catch (_) {
      throw wrongPassword();
    }
  }

  async function readBytes(blob, start, length) {
    return new Uint8Array(await blob.slice(start, start + length).arrayBuffer());
  }

  /**
   * Criptografa um Blob (arquivo) com a senha informada.
   * @param {Blob} blob
   * @param {string} password
   * @param {{ name?: string, onProgress?: (fraction: number) => void, chunkSize?: number }} [options]
   *   name: nome original do arquivo, com extensão (ex.: "texte.png"); fica dentro do arquivo cifrado.
   * @returns {Promise<Blob>}
   */
  async function encryptBlob(blob, password, options = {}) {
    const onProgress = options.onProgress || (() => {});
    const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
    const name = new TextEncoder().encode(options.name || "");

    const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
    const baseIv = crypto.getRandomValues(new Uint8Array(IV_LEN));
    const key = await deriveKey(password, salt);
    const header = buildHeader(salt, baseIv, chunkSize);

    const nameCipher = await seal(key, baseIv, 0, header, name);
    const nameLen = new Uint8Array(NAME_LEN_FIELD);
    new DataView(nameLen.buffer).setUint32(0, nameCipher.length);

    const parts = [header, nameLen, nameCipher];
    const total = blob.size;
    let offset = 0;
    let index = 1; // block 0 holds the name

    onProgress(0);
    do {
      const end = Math.min(offset + chunkSize, total);
      const plain = await readBytes(blob, offset, end - offset);
      parts.push(await seal(key, baseIv, index, header, plain));
      offset = end;
      index += 1;
      onProgress(total ? offset / total : 1);
    } while (offset < total);

    onProgress(1);
    return new Blob(parts, { type: "application/octet-stream" });
  }

  // Reads the header, derives the key and (for version 2) opens the name block.
  async function openEncrypted(blob, password) {
    if (blob.size < HEADER_LEN) throw invalid();
    const header = await readBytes(blob, 0, HEADER_LEN);
    for (let i = 0; i < MAGIC.length; i++) {
      if (header[i] !== MAGIC[i]) throw invalid();
    }
    const version = header[4];
    if (version !== VERSION && version !== LEGACY_VERSION) throw new Error("Unsupported file version.");

    const salt = header.slice(5, 5 + SALT_LEN);
    const baseIv = header.slice(5 + SALT_LEN, 5 + SALT_LEN + IV_LEN);
    const chunkSize = readU32(header, HEADER_LEN - 4);
    if (!chunkSize) throw invalid();

    const key = await deriveKey(password, salt);
    let offset = HEADER_LEN;
    let index = 0;
    let name = null;

    if (version === VERSION) {
      if (blob.size < offset + NAME_LEN_FIELD) throw invalid();
      const nameLen = readU32(await readBytes(blob, offset, NAME_LEN_FIELD), 0);
      offset += NAME_LEN_FIELD;
      if (nameLen < TAG_LEN || offset + nameLen > blob.size) throw invalid();
      const plain = await open(key, baseIv, 0, header, await readBytes(blob, offset, nameLen));
      name = new TextDecoder().decode(plain);
      offset += nameLen;
      index = 1;
    }

    return { version, header, key, baseIv, chunkSize, offset, index, name };
  }

  /**
   * Returns the original file name stored in an encrypted blob, checking the password.
   * Version 1 files have no stored name, so the result is null.
   * @param {Blob} blob
   * @param {string} password
   * @returns {Promise<string|null>}
   */
  async function readName(blob, password) {
    const state = await openEncrypted(blob, password);
    if (state.version === LEGACY_VERSION) {
      // Check the password against the first block, since there is no name block to check it
      const encLen = Math.min(state.chunkSize + TAG_LEN, blob.size - state.offset);
      if (encLen < TAG_LEN) throw invalid();
      await open(state.key, state.baseIv, 0, state.header, await readBytes(blob, state.offset, encLen));
    }
    return state.name;
  }

  /**
   * Descriptografa um Blob gerado por encryptBlob.
   * @param {Blob} blob
   * @param {string} password
   * @param {{ onProgress?: (fraction: number) => void }} [options]
   * @returns {Promise<{ blob: Blob, name: string|null }>} name is null for version 1 files
   */
  async function decryptFile(blob, password, options = {}) {
    const onProgress = options.onProgress || (() => {});
    const state = await openEncrypted(blob, password);
    const { header, key, baseIv, chunkSize } = state;

    const total = blob.size;
    const parts = [];
    let offset = state.offset;
    let index = state.index;

    onProgress(0);
    do {
      const encLen = Math.min(chunkSize + TAG_LEN, total - offset);
      const cipher = await readBytes(blob, offset, encLen);
      parts.push(await open(key, baseIv, index, header, cipher));
      offset += encLen;
      index += 1;
      onProgress(offset / total);
    } while (offset < total);

    onProgress(1);
    return { blob: new Blob(parts, { type: "application/octet-stream" }), name: state.name };
  }

  /**
   * Same as decryptFile, but returns only the Blob.
   * @returns {Promise<Blob>}
   */
  async function decryptBlob(blob, password, options = {}) {
    return (await decryptFile(blob, password, options)).blob;
  }

  // True when the blob starts with the Encripter header (magic "ENC1")
  async function isEncryptedBlob(blob) {
    if (blob.size < HEADER_LEN) return false;
    const head = new Uint8Array(await blob.slice(0, MAGIC.length).arrayBuffer());
    return MAGIC.every((byte, i) => head[i] === byte);
  }

  const api = {
    encryptBlob,
    decryptBlob,
    decryptFile,
    readName,
    isEncryptedBlob,
    HEADER_LEN,
    DEFAULT_CHUNK_SIZE,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    globalThis.EncripterCore = api;
  }
})();

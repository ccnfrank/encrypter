// crypto-core.js is a classic script: it sets globalThis.EncripterCore when it is not
// loaded as CommonJS (the tests load it with require).
import "./crypto-core.js";

export const EncripterCore = globalThis.EncripterCore;

# encrypter.app

Encrypt and decrypt files and folders with a password, right in the browser.
Nothing is uploaded: the file is processed on your computer.

Built with React and Vite. Encryption uses AES-256-GCM with a key derived from the
password via PBKDF2-SHA-256 (600,000 iterations).

## Develop

```bash
npm install
npm run dev      # local server with hot reload
npm test         # crypto tests (node:test)
npm run build    # production build in dist/
npm run preview  # serve dist/ locally
```

## Layout

- `src/App.jsx`: state and the flow that ties the pieces together
- `src/components/`: drop area and seal, file list, password fields, progress, dialogs
- `src/lib/crypto-core.js`: encryption format and primitives (`.enc` files)
- `src/lib/files.js`, `save.js`, `job.js`, `progress.js`: naming, saving, deleting originals, progress timing
- `src/lib/viz.js`: canvas animation shown while a job runs
- `src/i18n/`: interface texts in English (`en.mjs`), German (`de.mjs`), Portuguese (`pt.mjs`) and Spanish (`es.mjs`)
- `tests/`: unit tests for the crypto core and the translations

## Adding a language

Copy `src/i18n/en.mjs` to a new file with the language code, translate every value (keep the `{name}` placeholders),
then add the language to `LANGUAGES` and `DICTIONARIES` in `src/i18n/index.mjs`. `npm test` checks that the keys match.
The choice is saved in the browser; without one, the browser language is used when it is supported.

## Browser support

Saving to a chosen folder and deleting the originals need the File System Access API
(Chrome and Edge). Other browsers download the result and turn the delete option off.

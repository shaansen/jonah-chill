# EPUB Audiobook Reader - Project Context

## Overview
A PWA that converts EPUB files into audiobooks using Kokoro.js neural TTS (82M ONNX model, WASM) with Web Speech API fallback. Users upload EPUBs, which are parsed and read aloud with playback controls, chapter navigation, speed control, sleep timer, offline support, cloud sync via Supabase, and in-book text search.

## Tech Stack
- **Vite** build system with `vite-plugin-pwa` (Workbox auto-generation)
- **ES Modules** (no IIFE globals, tree-shakable imports)
- **Kokoro.js** (`kokoro-js` npm) for high-quality client-side neural TTS via ONNX/WASM
- **Web Speech API** as TTS fallback when Kokoro is unavailable
- **IndexedDB** for EPUB file data (singleton connection pool) and library metadata
- **localStorage** for user preferences
- **Supabase** (`@supabase/supabase-js` npm) for auth + cloud progress sync
- **JSZip** (`jszip` npm) for EPUB extraction
- **Vitest** + jsdom for unit testing

## Dev Commands
```bash
npm run dev        # Start Vite dev server
npm run build      # Production build -> dist/
npm run preview    # Preview production build
npm test           # Run vitest (single run)
npm run test:watch # Run vitest in watch mode
```

## File Structure
```
epub-reader/
  index.html                        - Single HTML page (single module entry)
  vite.config.js                    - Vite + PWA plugin config
  package.json                      - Dependencies + scripts
  css/styles.css                    - All styles (dark theme, safe-area-aware)
  icons/                            - SVG icons for PWA (192, 512, maskable)
  src/
    main.js                         - Entry point (init, wiring, event binding)
    store.js                        - Reactive state store (getState, setState, subscribe)
    storage.js                      - IDB + localStorage (pooled singleton connection)
    epub-parser.js                  - EPUB extraction and parsing (ES module)
    supabase-sync.js                - Supabase client (auth, progress push/pull)
    tts/
      text-chunker.js               - Sentence-aware text splitting (shared by both TTS engines)
      tts-adapter.js                - Interface documentation for TTS adapters
      kokoro-tts.js                 - Kokoro.js wrapper (82M ONNX model, deferred download)
      web-speech-tts.js             - Web Speech API fallback adapter
    ui/
      ui.js                         - Core UI (view switching, toast, loading, player elements)
      player-ui.js                  - Player view bindings + keyboard shortcuts
      library-ui.js                 - Upload view + library rendering
      drawer-ui.js                  - Chapter/search/auth/sleep drawers
    playback/
      playback-controller.js        - Orchestrates TTS + audio (double-buffering, fallback)
      audio-manager.js              - <audio> management, Media Session, keep-alive
      sleep-timer.js                - Timer/end-of-chapter sleep modes
    actions/
      book-actions.js               - loadFile, loadFromIDB, goToChapter, searchBook
      progress-actions.js           - saveProgress, refreshLibrary, mergeRemoteProgress
  tests/
    setup.js                        - Vitest setup (speechSynthesis, MediaSession mocks)
    store.test.js
    storage.test.js
    text-chunker.test.js
    playback-controller.test.js
  .github/workflows/deploy.yml      - GitHub Pages (npm ci, build, test, deploy dist/)
```

## Architecture

### Reactive State Store (`src/store.js`)
Central state replaces scattered closure variables. Per-key subscriptions:
```js
subscribe('playbackState', (state) => { /* update play/pause icon */ });
setState({ playbackState: 'playing' }); // triggers only playbackState subscribers
```

### TTS Dual-Engine
- **Kokoro path**: Generates WAV blobs, plays via real `<audio>` element, native background playback. Model (~86MB) downloaded on first play, cached by service worker.
- **Web Speech path**: Uses `speechSynthesis.speak()` + silent audio/oscillator keep-alive.
- **Playback controller**: Tries Kokoro first, auto-falls back to Web Speech. Pre-generates next 2 chunks (double-buffering).

### IDB Connection Pool (`src/storage.js`)
Singleton `getDB()` reuses a single IDB connection. Auto-reconnects on close.

### Views
- **Upload View** (`#upload-view`): File picker + library list + auth button
- **Player View** (`#player-view`): Chapter display, playback controls, progress bars
- Toggled via `showView('upload'|'player')` using CSS `.view.active`

### Data Flow
- **Upload**: File -> ArrayBuffer -> EpubParser.parse() -> book with lazy-loaded chapters
- **Storage**: EPUB ArrayBuffer in IDB `epubs` store, metadata in IDB `library` store
- **Progress**: Saved every 5 TTS chunks, on chapter change/pause, on app close
- **Cloud Sync**: Fire-and-forget push on save, pull on load, merge by `lastRead` timestamp

### Security
- **CSP**: Scripts self-only, connections to self + `*.supabase.co` + HuggingFace (Kokoro model)
- **No innerHTML**: All dynamic content uses `createElement`/`textContent`
- **EPUB guards**: Max 500MB compressed, 2GB decompressed, 10K files, path traversal blocked
- **Supabase RLS**: All `book_progress` rows scoped to `auth.uid() = user_id`

## Known Issues
- **Kokoro model**: ~86MB first download. Progress overlay shown. Cached by SW after.
- **WASM**: Kokoro requires WebAssembly. Falls back to Web Speech if unavailable.
- **Loading overlay CSS**: Must keep `.loading-overlay[hidden] { display: none; }`
- **iOS PWA**: Standalone mode uses separate storage/SW context from Safari
- **Build size**: Kokoro JS chunk ~2.2MB (ONNX runtime). WASM ~21MB excluded from precache.

## Common Tasks
- **New UI control**: HTML in `index.html`, style in `css/styles.css`, bind in `src/ui/*.js`, wire in `src/main.js`
- **New drawer**: Copy `.drawer` HTML, add to `src/ui/drawer-ui.js`, wire in `src/main.js`
- **TTS changes**: `src/tts/` for engines, `src/playback/playback-controller.js` for orchestration
- **Storage changes**: `src/storage.js` — IDB stores `epubs` + `library`, prefs key `epub-reader-prefs`
- **Tests**: Create `tests/*.test.js`, run `npm test`
- **PWA caching**: Update `vite.config.js` workbox config

# EPUB Audiobook Reader - Project Context

## Overview
A PWA that converts EPUB files into audiobooks using the Web Speech API (TTS). Users upload EPUBs, which are parsed and read aloud with playback controls, chapter navigation, speed control, sleep timer, and offline support.

## Tech Stack
- **Vanilla JS** (no framework, no build step)
- **Web Speech API** for text-to-speech
- **IndexedDB** for storing EPUB file data (ArrayBuffers)
- **localStorage** for user preferences, library metadata, and reading progress
- **Service Worker** for offline/PWA support (cache-first strategy)
- **JSZip** (CDN) for EPUB extraction
- **Web Worker** (`epub-worker.js`) for off-thread EPUB parsing

## File Structure
```
index.html          - Single HTML page with upload + player views
manifest.json       - PWA manifest (standalone, start_url: ./index.html)
sw.js               - Service worker (cache name: epub-reader-v3)
css/styles.css      - All styles (dark theme, safe-area-aware)
js/app.js           - Main orchestrator (init, loadFile, loadFromIDB, refreshLibrary, TTS wiring)
js/ui.js            - All DOM manipulation (views, loading overlay, library, player controls)
js/storage.js       - localStorage + IndexedDB persistence
js/epub-parser.js   - EPUB extraction and parsing logic
js/tts-engine.js    - Web Speech API wrapper (chunking, play/pause, skip)
js/epub-worker.js   - Web Worker for background EPUB parsing
icons/              - SVG icons for PWA (192, 512)
```

## Architecture

### Views
- **Upload View** (`#upload-view`): File picker + library list. Shown by default.
- **Player View** (`#player-view`): Chapter display, playback controls, progress bars.
- Toggled via `UI.showView('upload'|'player')` using CSS `.view.active`.

### Initialization Flow (app.js `init()`)
1. Register service worker (non-blocking)
2. Initialize web worker for EPUB parsing
3. `await TTSEngine.loadVoices()` (2s timeout fallback)
4. Load user prefs from localStorage, populate voice UI
5. `refreshLibrary()` - validates IDB entries sequentially (can be slow)
6. Bind events + keyboard shortcuts + Media Session API
7. Wire TTS callbacks (highlight, progress, chapter advance)

### Data Flow
- **Upload**: File -> ArrayBuffer -> EpubParser.parse() -> book object with lazy-loaded chapters
- **Storage**: EPUB ArrayBuffer saved to IndexedDB (key: `book_<hash>`), metadata to localStorage
- **Resume**: Library click -> loadFromIDB() -> retrieves ArrayBuffer -> re-parses -> restores chapter/chunk position
- **Progress**: Saved every 5 TTS chunks and on chapter change/pause

### Key Patterns
- Chapters use **lazy loading** (`ch.load()`) - text extracted on demand from the stored zip
- TTS text is split into chunks; progress tracked by chunk index
- `refreshLibrary()` validates each library entry against IDB (sequential awaits, no timeout)
- Loading overlay uses `hidden` attribute + explicit CSS `[hidden]` rule (fixed: CSS `display:flex` was overriding `hidden`)

## Known Issues / Watch Out For
- **Loading overlay CSS**: Must keep `.loading-overlay[hidden] { display: none; }` or the overlay shows through in PWA mode
- **Service worker cache version**: Bump `CACHE_NAME` in `sw.js` whenever any cached asset changes
- **Voice loading**: `TTSEngine.loadVoices()` has a 2s timeout; `voiceschanged` event unreliable on some devices
- **refreshLibrary()**: Opens a new IDB connection per book (sequential, no timeout) - could be slow with many books
- **iOS PWA**: Standalone mode uses separate storage/SW context from Safari; first open requires network

## Common Tasks
- **Adding a new UI control**: Add HTML in `index.html`, style in `styles.css`, bind in `ui.js`, wire in `app.js:bindEvents()`
- **Changing caching**: Update `ASSETS` array and `CACHE_NAME` in `sw.js`
- **Modifying TTS behavior**: `js/tts-engine.js` handles chunking, playback, rate, voice selection
- **Storage schema changes**: `js/storage.js` - IDB store is `epubs`, localStorage keys are `epub-reader-library` and `epub-reader-prefs`

# EPUB Audiobook Reader - Project Context

## Overview
A PWA that converts EPUB files into audiobooks using the Web Speech API (TTS). Users upload EPUBs, which are parsed and read aloud with playback controls, chapter navigation, speed control, sleep timer, offline support, cloud sync via Supabase, and in-book text search.

## Tech Stack
- **Vanilla JS** (no framework, no build step)
- **Web Speech API** for text-to-speech
- **IndexedDB** for storing EPUB file data (ArrayBuffers) and library metadata
- **localStorage** for user preferences
- **Service Worker** for offline/PWA support (cache-first strategy)
- **JSZip** (CDN, SRI-verified) for EPUB extraction
- **Supabase** (CDN, SRI-verified) for auth + cloud progress sync (best-effort, local IDB is source of truth)
- **Web Worker** (`epub-worker.js`) for off-thread EPUB parsing

## File Structure
```
index.html              - Single HTML page with upload + player views, auth drawer, search drawer
manifest.json           - PWA manifest (standalone, start_url: ./index.html)
sw.js                   - Service worker (cache name: epub-reader-v7)
css/styles.css          - All styles (dark theme, safe-area-aware)
js/app.js               - Main orchestrator (init, loadFile, loadFromIDB, refreshLibrary, TTS wiring, auth, search)
js/ui.js                - All DOM manipulation (views, loading overlay, library, player, auth drawer, search drawer)
js/storage.js           - localStorage + IndexedDB persistence
js/supabase-sync.js     - Supabase client wrapper (auth, progress push/pull)
js/epub-parser.js       - EPUB extraction and parsing logic (with size/path guards)
js/tts-engine.js        - Web Speech API wrapper (chunking, play/pause, skip)
js/epub-worker.js       - Web Worker for background EPUB parsing
supabase-setup.md       - SQL for creating book_progress table + RLS policies
icons/                  - SVG icons for PWA (192, 512)
```

## Architecture

### Views
- **Upload View** (`#upload-view`): File picker + library list + "Sign in to sync" auth button. Shown by default.
- **Player View** (`#player-view`): Chapter display, playback controls, progress bars, search button.
- Toggled via `UI.showView('upload'|'player')` using CSS `.view.active`.

### Drawers (slide-in panels, reuse `.drawer` pattern)
- **Chapter Drawer**: Chapter list with search filter
- **Auth Drawer**: Email/password sign-in/sign-up form, sign-out view
- **Search Drawer**: In-book text search with results list

### Initialization Flow (app.js `init()`)
1. Register service worker (non-blocking)
2. Initialize web worker for EPUB parsing
3. `SupabaseSync.init()` + `initAuth()` — check auth state, wire auth change listener
4. `await TTSEngine.loadVoices()` (2s timeout fallback)
5. Load user prefs from localStorage, populate voice UI
6. `refreshLibrary()` - validates IDB entries sequentially (can be slow)
7. Bind events + keyboard shortcuts + Media Session API
8. Wire TTS callbacks (highlight, progress, chapter advance)

### Data Flow
- **Upload**: File -> ArrayBuffer -> EpubParser.parse() -> book object with lazy-loaded chapters
- **Storage**: EPUB ArrayBuffer saved to IndexedDB (key: `book_<hash>`), metadata to IDB `library` store
- **Resume**: Library click -> loadFromIDB() -> retrieves ArrayBuffer -> re-parses -> restores chapter/chunk position
- **Progress**: Saved every 5 TTS chunks and on chapter change/pause
- **Cloud Sync**: On save, fire-and-forget `SupabaseSync.pushProgress()`. On load, `pullProgress()` and use whichever has later `lastRead` timestamp. On sign-in, `pullAllProgress()` merges remote into local.

### Supabase Cloud Sync (`js/supabase-sync.js`)
- **Project**: `ebihzaqncthtbrzhjnrg.supabase.co`
- **Auth**: email/password via `signUp()`, `signIn()`, `signOut()`
- **Sync model**: Local IDB is always source of truth; cloud is best-effort supplementary
- **Table**: `book_progress` with RLS (user_id = auth.uid()) — see `supabase-setup.md` for SQL
- **Push**: upsert on `(user_id, book_id)` after every local save
- **Pull**: single row fetch on book load; full table fetch on sign-in for merge

### In-Book Text Search (app.js `searchBook()`)
- Iterates all chapters, lazy-loads text as needed
- Case-insensitive substring search, returns up to 50 results with `{ chapterIndex, chapterTitle, snippet, charOffset }`
- Debounced (300ms) search input in search drawer
- On result click: `goToChapter()` with estimated start chunk via `findChunkForOffset()`

### Background Playback & Lock Screen
- **Two-layer audio keep-alive**: Silent `<audio>` loop (1s WAV) + Web Audio API oscillator keep the OS audio session active
- `startAudioKeepAlive()` / `stopAudioKeepAlive()` in app.js, toggled via `updateMediaSessionState()`
- **Media Session API**: Lock screen controls (play/pause/prev/next/skip) wired in `setupMediaSession()`
- **Auto-resume**: `visibilitychange` listener in tts-engine.js detects if speech died in background and restarts current chunk
- AudioContext must be created on user gesture (happens naturally via play button click)

### Security
- **CSP**: Meta tag restricts scripts to self + CDNs, connections to self + `*.supabase.co`
- **SRI**: Both CDN scripts (JSZip, Supabase) have `integrity` + `crossorigin` attributes
- **No innerHTML**: All dynamic content uses `createElement`/`textContent` (no XSS vectors)
- **EPUB size guards**: Max 500MB compressed, 2GB decompressed, 10K files, 100MB per file
- **Path traversal blocked**: `getZipFile()` rejects paths containing `..` or starting with `/`
- **Supabase RLS**: All `book_progress` rows scoped to `auth.uid() = user_id`

### Key Patterns
- Chapters use **lazy loading** (`ch.load()`) - text extracted on demand from the stored zip
- TTS text is split into chunks; progress tracked by chunk index
- `refreshLibrary()` validates each library entry against IDB (sequential awaits, no timeout)
- Loading overlay uses `hidden` attribute + explicit CSS `[hidden]` rule (fixed: CSS `display:flex` was overriding `hidden`)
- All drawers follow the same pattern: `.drawer` with `.drawer-backdrop` + `.drawer-content`, show/hide via `hidden` attribute

## Known Issues / Watch Out For
- **Loading overlay CSS**: Must keep `.loading-overlay[hidden] { display: none; }` or the overlay shows through in PWA mode
- **Service worker cache version**: Bump `CACHE_NAME` in `sw.js` whenever any cached asset changes
- **Voice loading**: `TTSEngine.loadVoices()` has a 2s timeout; `voiceschanged` event unreliable on some devices
- **refreshLibrary()**: Opens a new IDB connection per book (sequential, no timeout) - could be slow with many books
- **iOS PWA**: Standalone mode uses separate storage/SW context from Safari; first open requires network
- **SRI hashes**: Must regenerate if CDN library versions are bumped (use `curl URL | openssl dgst -sha384 -binary | openssl base64 -A`)
- **Supabase anon key**: Committed in `supabase-sync.js` — this is safe (it's a public key), but RLS must be properly configured

## Common Tasks
- **Adding a new UI control**: Add HTML in `index.html`, style in `styles.css`, bind in `ui.js`, wire in `app.js:bindEvents()`
- **Adding a new drawer**: Copy the `.drawer` HTML pattern, add elements in `ui.js`, wire backdrop/close events
- **Changing caching**: Update `ASSETS` array and `CACHE_NAME` in `sw.js`
- **Modifying TTS behavior**: `js/tts-engine.js` handles chunking, playback, rate, voice selection
- **Storage schema changes**: `js/storage.js` - IDB store is `epubs`, localStorage keys are `epub-reader-library` and `epub-reader-prefs`
- **Supabase schema changes**: Update `supabase-setup.md` SQL + `supabase-sync.js` push/pull column mappings

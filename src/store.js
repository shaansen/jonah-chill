/**
 * Reactive state store with per-key subscriptions.
 * Replaces scattered closure state across app.js, tts-engine.js, and ui.js.
 */

const state = {
  book: null,
  bookId: null,
  currentChapter: 0,
  playbackState: 'stopped', // 'stopped' | 'playing' | 'paused'
  currentChunkIndex: 0,
  totalChunks: 0,
  speed: 1.0,
  selectedVoiceId: null,
  ttsEngine: 'kokoro', // 'kokoro' | 'webSpeech'
  kokoroModelLoaded: false,
  kokoroDownloadProgress: 0,
  chapterWordCounts: [],
  chapterCharCounts: [],
  totalChars: 0,
  sleepMode: 'off', // 'off' | 'timer' | 'chapter'
  sleepTimerEnd: 0,
  activeView: 'upload', // 'upload' | 'player'
  loading: false,
  loadingMessage: '',
  library: [],
  prefs: {},
};

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

/** @type {Set<Function>} */
const globalListeners = new Set();

export function getState() {
  return state;
}

export function setState(partial) {
  const changedKeys = [];
  for (const key of Object.keys(partial)) {
    if (state[key] !== partial[key]) {
      state[key] = partial[key];
      changedKeys.push(key);
    }
  }
  // Notify per-key subscribers
  for (const key of changedKeys) {
    const subs = listeners.get(key);
    if (subs) {
      for (const fn of subs) {
        fn(state);
      }
    }
  }
  // Notify global subscribers
  if (changedKeys.length > 0) {
    for (const fn of globalListeners) {
      fn(state, changedKeys);
    }
  }
}

/**
 * Subscribe to changes on a specific key.
 * @param {string} key - State key to watch
 * @param {Function} fn - Callback receiving full state
 * @returns {Function} Unsubscribe function
 */
export function subscribe(key, fn) {
  if (!listeners.has(key)) {
    listeners.set(key, new Set());
  }
  listeners.get(key).add(fn);
  return () => listeners.get(key).delete(fn);
}

/**
 * Subscribe to any state change.
 * @param {Function} fn - Callback receiving (state, changedKeys)
 * @returns {Function} Unsubscribe function
 */
export function subscribeAll(fn) {
  globalListeners.add(fn);
  return () => globalListeners.delete(fn);
}

/**
 * Main entry point — initializes all modules and wires them together.
 */
import '../css/styles.css';

import { getState, setState } from './store.js';
import * as Storage from './storage.js';
import * as SupabaseSync from './supabase-sync.js';
import * as PlaybackController from './playback/playback-controller.js';
import * as AudioManager from './playback/audio-manager.js';
import * as SleepTimer from './playback/sleep-timer.js';
import * as KokoroTTS from './tts/kokoro-tts.js';
import * as WebSpeechTTS from './tts/web-speech-tts.js';
import * as UI from './ui/ui.js';
import * as PlayerUI from './ui/player-ui.js';
import * as LibraryUI from './ui/library-ui.js';
import * as DrawerUI from './ui/drawer-ui.js';
import { loadFile, loadFromIDB, goToChapter, searchBook, findChunkForOffset } from './actions/book-actions.js';
import { saveProgress, refreshLibrary, mergeRemoteProgress, updateBookProgressBar, updateTimeRemainingDisplay } from './actions/progress-actions.js';

async function init() {
  // Initialize Supabase sync
  SupabaseSync.init();
  initAuth();

  // Load voices — try Kokoro voices first, fall back to Web Speech
  await WebSpeechTTS.init();
  const prefs = Storage.getPrefs();

  // Determine initial TTS engine
  const preferredEngine = prefs.ttsEngine || (KokoroTTS.isAvailable() ? 'kokoro' : 'webSpeech');
  setState({ ttsEngine: preferredEngine, speed: prefs.rate || 1.0 });

  // Populate voice selector
  populateVoiceSelector(preferredEngine, prefs.voiceURI);

  if (prefs.rate) UI.setSpeed(prefs.rate);
  setState({ prefs });

  // Render library
  refreshLibrary();

  // Bind UI events
  bindAllEvents();

  // Wire playback callbacks
  PlaybackController.setCallbacks({
    chunkStart: (index, text, total) => {
      const state = getState();
      const chapter = state.book?.chapters[state.currentChapter];
      if (chapter) {
        UI.highlightCurrentText(chapter.text, text);
      }
      const percent = total > 0 ? Math.round((index / total) * 100) : 0;
      UI.updateProgress(percent, state.currentChapter + 1, state.book?.chapters.length || 1);
      updateBookProgressBar(percent);
      updateTimeRemainingDisplay();
    },
    chunkEnd: (index, total) => {
      if (index % 5 === 0) saveProgress();
    },
    finished: () => {
      const state = getState();

      if (SleepTimer.isEndOfChapter()) {
        SleepTimer.clearTimer();
        PlaybackController.stop();
        UI.setPlayState(false);
        UI.toast('Sleep timer: paused at end of chapter');
        saveProgress();
        return;
      }

      if (state.currentChapter < (state.book?.chapters.length || 0) - 1) {
        goToChapter(state.currentChapter + 1, true);
      } else {
        UI.setPlayState(false);
        UI.toast('Finished reading!');
        saveProgress();
      }
    },
    stateChange: (playState) => {
      UI.setPlayState(playState === 'playing');
      AudioManager.updateMediaSessionPlaybackState(playState);
      if (playState === 'paused') {
        saveProgress();
      }
    },
  });

  // Sleep timer
  SleepTimer.setCountdownUpdater((text) => DrawerUI.updateSleepCountdown(text));
  SleepTimer.onExpired((type) => {
    PlaybackController.pause();
    UI.toast('Sleep timer: paused');
    saveProgress();
  });

  // Save progress on close
  window.addEventListener('beforeunload', () => saveProgress());
  window.addEventListener('pagehide', () => saveProgress());

  // Visibility change
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && PlaybackController.getIsPaused() && getState().book) {
      UI.toast('Playback paused. Tap play to resume.');
    }
  });
}

function populateVoiceSelector(engine, savedVoiceURI) {
  if (engine === 'kokoro') {
    const voices = KokoroTTS.listVoices();
    UI.populateVoices(voices, savedVoiceURI);
  } else {
    const voices = WebSpeechTTS.listVoices();
    UI.populateVoices(voices, savedVoiceURI);
  }
}

async function initAuth() {
  if (!SupabaseSync.isEnabled()) return;
  try {
    const user = await SupabaseSync.getUser();
    DrawerUI.setAuthState(user);
  } catch { /* ignore */ }
  SupabaseSync.onAuthChange((user) => {
    DrawerUI.setAuthState(user);
    if (user) mergeRemoteProgress();
  });
}

function bindAllEvents() {
  // Library / upload
  LibraryUI.bindEvents({ onFileUpload: loadFile });

  // Player controls
  PlayerUI.bindEvents({
    onBack: () => {
      PlaybackController.stop();
      saveProgress();
      UI.showView('upload');
      setState({ activeView: 'upload' });
      refreshLibrary();
    },
    onSave: () => saveProgress(true),
    onPlayPause: () => {
      if (PlaybackController.getIsPlaying()) {
        PlaybackController.pause();
      } else {
        PlaybackController.play();
      }
    },
    onPrev: () => {
      const state = getState();
      if (state.currentChapter > 0) goToChapter(state.currentChapter - 1);
    },
    onNext: () => {
      const state = getState();
      if (state.book && state.currentChapter < state.book.chapters.length - 1) {
        goToChapter(state.currentChapter + 1);
      }
    },
    onSkipBack: () => skipTime(-30),
    onSkipForward: () => skipTime(30),
    onSpeedChange: (val, delta) => {
      const state = getState();
      let newRate;
      if (delta !== undefined && delta !== null) {
        const current = state.speed || 1;
        newRate = Math.max(0.5, Math.min(3, +(current + delta).toFixed(1)));
      } else {
        newRate = val;
      }
      UI.setSpeed(newRate);
      PlaybackController.setRate(newRate);
      Storage.savePrefs({ rate: newRate });
      setState({ speed: newRate });
      updateTimeRemainingDisplay();
    },
    onVoiceChange: (voiceId) => {
      PlaybackController.setVoice(voiceId);
      Storage.savePrefs({ voiceURI: voiceId });
      setState({ selectedVoiceId: voiceId });
    },
    onProgressSeek: (pct) => {
      const state = getState();
      if (!state.book) return;
      const progress = PlaybackController.getProgress();
      const targetChunk = Math.floor(pct * progress.totalChunks);
      const wasPlaying = PlaybackController.getIsPlaying();
      PlaybackController.stop();
      PlaybackController.setText(state.book.chapters[state.currentChapter].text, targetChunk);
      if (wasPlaying) PlaybackController.play();
    },
    getBook: () => getState().book,
  });

  // Chapter drawer
  DrawerUI.bindChapterDrawer({
    onChapterSelect: (index) => goToChapter(index),
    getBook: () => getState().book,
    getCurrentChapter: () => getState().currentChapter,
    getChapterWordCounts: () => getState().chapterWordCounts,
    getRate: () => getState().speed || Storage.getPrefs().rate || 1,
  });

  // Auth drawer
  DrawerUI.bindAuthDrawer({
    onSignIn: async (email, pw) => {
      await SupabaseSync.signIn(email, pw);
      UI.toast('Signed in');
    },
    onSignUp: async (email, pw) => {
      await SupabaseSync.signUp(email, pw);
      UI.toast('Check your email to confirm sign-up');
    },
    onSignOut: async () => {
      await SupabaseSync.signOut();
      DrawerUI.setAuthState(null);
      UI.toast('Signed out');
    },
  });

  // Search drawer
  DrawerUI.bindSearchDrawer({
    onSearch: (query) => searchBook(query),
    onResultSelect: (r) => {
      const state = getState();
      goToChapter(r.chapterIndex, true, findChunkForOffset(
        state.book.chapters[r.chapterIndex].text || '', r.charOffset
      ));
    },
  });

  // Sleep timer
  DrawerUI.bindSleepTimer({
    onTimerSet: (mins) => {
      SleepTimer.startTimer(mins);
      UI.toast(`Sleep timer: ${mins} minutes`);
    },
    onEndOfChapter: () => {
      SleepTimer.startEndOfChapter();
      UI.toast('Sleep: end of chapter');
    },
    onTimerOff: () => {
      SleepTimer.clearTimer();
      UI.toast('Sleep timer off');
    },
  });

  // Media session
  AudioManager.setupMediaSession({
    play: () => PlaybackController.play(),
    pause: () => PlaybackController.pause(),
    previoustrack: () => {
      const state = getState();
      if (state.currentChapter > 0) goToChapter(state.currentChapter - 1);
    },
    nexttrack: () => {
      const state = getState();
      if (state.book && state.currentChapter < state.book.chapters.length - 1) {
        goToChapter(state.currentChapter + 1);
      }
    },
    seekbackward: () => skipTime(-30),
    seekforward: () => skipTime(30),
  });
}

function skipTime(seconds) {
  const state = getState();
  if (!state.book) return;
  const targetChunk = PlaybackController.skipBySeconds(seconds);
  const wasPlaying = PlaybackController.getIsPlaying();
  PlaybackController.stop();
  PlaybackController.setText(state.book.chapters[state.currentChapter].text, targetChunk);
  if (wasPlaying) PlaybackController.play();
}

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

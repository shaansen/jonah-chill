/**
 * Audio session management: silent audio keep-alive, Media Session API,
 * and real <audio> element for Kokoro TTS playback.
 */
import { getState } from '../store.js';

let audioCtx = null;
let silentSource = null;
let silentAudio = null;
let kokoroAudioEl = null;

/**
 * Create a looping silent audio element for media session + background keep-alive.
 */
export function setupMediaSession(handlers) {
  // Create silent audio for Web Speech keep-alive
  silentAudio = document.createElement('audio');
  silentAudio.src = createSilentWavUrl();
  silentAudio.loop = true;
  silentAudio.volume = 0.01;

  // Create the Kokoro audio element for real WAV playback
  kokoroAudioEl = document.createElement('audio');
  kokoroAudioEl.preload = 'auto';

  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    if (handlers.play) ms.setActionHandler('play', handlers.play);
    if (handlers.pause) ms.setActionHandler('pause', handlers.pause);
    if (handlers.previoustrack) ms.setActionHandler('previoustrack', handlers.previoustrack);
    if (handlers.nexttrack) ms.setActionHandler('nexttrack', handlers.nexttrack);
    try {
      if (handlers.seekbackward) ms.setActionHandler('seekbackward', handlers.seekbackward);
      if (handlers.seekforward) ms.setActionHandler('seekforward', handlers.seekforward);
    } catch { /* Not all browsers support seek handlers */ }
  }
}

export function updateMediaSessionMetadata(title, artist, album) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album });
}

export function updateMediaSessionPlaybackState(state) {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = state === 'playing' ? 'playing' : 'paused';
  }

  if (state === 'playing') {
    startAudioKeepAlive();
  } else {
    stopAudioKeepAlive();
  }
}

export function startAudioKeepAlive() {
  if (silentAudio) {
    silentAudio.play().catch(() => {});
  }

  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return; }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  if (!silentSource) {
    const oscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    gain.gain.value = 0.001;
    oscillator.connect(gain);
    gain.connect(audioCtx.destination);
    oscillator.start();
    silentSource = oscillator;
  }
}

export function stopAudioKeepAlive() {
  if (silentAudio) {
    silentAudio.pause();
  }
  if (silentSource) {
    try { silentSource.stop(); } catch { /* ignore */ }
    silentSource = null;
  }
}

/**
 * Play a WAV blob via the Kokoro audio element.
 * Returns a promise that resolves when playback ends.
 */
export function playAudioBlob(blob, { playbackRate = 1.0 } = {}) {
  return new Promise((resolve, reject) => {
    if (!kokoroAudioEl) {
      kokoroAudioEl = document.createElement('audio');
      kokoroAudioEl.preload = 'auto';
    }

    const url = URL.createObjectURL(blob);
    kokoroAudioEl.src = url;
    kokoroAudioEl.playbackRate = playbackRate;

    kokoroAudioEl.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    kokoroAudioEl.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };

    kokoroAudioEl.play().catch(reject);
  });
}

export function stopKokoroAudio() {
  if (kokoroAudioEl) {
    kokoroAudioEl.pause();
    kokoroAudioEl.src = '';
  }
}

export function pauseKokoroAudio() {
  if (kokoroAudioEl) kokoroAudioEl.pause();
}

export function resumeKokoroAudio() {
  if (kokoroAudioEl) kokoroAudioEl.play().catch(() => {});
}

export function setKokoroPlaybackRate(rate) {
  if (kokoroAudioEl) kokoroAudioEl.playbackRate = rate;
}

export function getKokoroAudioEl() {
  return kokoroAudioEl;
}

// --- Helpers ---

function createSilentWavUrl() {
  const sampleRate = 8000;
  const numSamples = sampleRate;
  const dataSize = numSamples;
  const fileSize = 44 + dataSize;
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  const bytes = new Uint8Array(buffer, 44);
  bytes.fill(128);

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

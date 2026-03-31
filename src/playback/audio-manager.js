/**
 * Audio session management: silent audio keep-alive, Media Session API,
 * and real <audio> element for Piper TTS playback.
 */
import { getState } from '../store.js';

let audioCtx = null;
let silentSource = null;
let silentAudio = null;
let piperAudioEl = null;

/**
 * Create a looping silent audio element for media session + background keep-alive.
 */
export function setupMediaSession(handlers) {
  // Create silent audio for Web Speech keep-alive
  silentAudio = document.createElement('audio');
  silentAudio.src = createSilentWavUrl();
  silentAudio.loop = true;
  silentAudio.volume = 0.01;

  // Create the Piper audio element for real WAV playback
  piperAudioEl = document.createElement('audio');
  piperAudioEl.preload = 'auto';

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

export function updateMediaSessionPlaybackState(state, { keepAlive = false } = {}) {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = state === 'playing' ? 'playing' : 'paused';
  }

  // Only start the silent audio/oscillator keep-alive for Web Speech.
  // Piper uses a real <audio> element and doesn't need it.
  if (state === 'playing' && keepAlive) {
    startAudioKeepAlive();
  } else if (state !== 'playing') {
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
    gain.gain.value = 0.0001;
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
 * Play a WAV blob via the Piper audio element.
 * Returns a promise that resolves when playback ends.
 */
export function playAudioBlob(blob, { playbackRate = 1.0 } = {}) {
  return new Promise((resolve, reject) => {
    if (!piperAudioEl) {
      piperAudioEl = document.createElement('audio');
      piperAudioEl.preload = 'auto';
    }

    const url = URL.createObjectURL(blob);
    piperAudioEl.src = url;
    piperAudioEl.playbackRate = playbackRate;

    piperAudioEl.onended = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    piperAudioEl.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };

    piperAudioEl.play().catch(reject);
  });
}

export function stopPiperAudio() {
  if (piperAudioEl) {
    piperAudioEl.pause();
    piperAudioEl.src = '';
  }
}

export function pausePiperAudio() {
  if (piperAudioEl) piperAudioEl.pause();
}

export function resumePiperAudio() {
  if (piperAudioEl) piperAudioEl.play().catch(() => {});
}

export function setPiperPlaybackRate(rate) {
  if (piperAudioEl) piperAudioEl.playbackRate = rate;
}

export function getPiperAudioEl() {
  return piperAudioEl;
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

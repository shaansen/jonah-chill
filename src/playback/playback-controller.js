/**
 * Playback controller — orchestrates TTS engines + audio playback.
 * Tries Kokoro first, falls back to Web Speech.
 * For Kokoro: generates WAV blobs → plays via <audio> element.
 * For Web Speech: uses speechSynthesis.speak() + silent audio keep-alive.
 * Pre-generates next 2 chunks while current plays (double-buffering).
 */
import { getState, setState } from '../store.js';
import { splitIntoChunks, KOKORO_CHUNK_LENGTH } from '../tts/text-chunker.js';
import * as KokoroTTS from '../tts/kokoro-tts.js';
import * as WebSpeechTTS from '../tts/web-speech-tts.js';
import * as AudioManager from './audio-manager.js';

let chunks = [];
let currentChunkIndex = 0;
let isPlaying = false;
let isPaused = false;
let stopped = false;

// Double-buffering queue for Kokoro
let audioQueue = []; // Array of { blob: Blob, chunkIndex: number }

// Callbacks
let onChunkStart = null;
let onChunkEnd = null;
let onFinished = null;
let onStateChange = null;

export function setCallbacks({ chunkStart, chunkEnd, finished, stateChange }) {
  onChunkStart = chunkStart || null;
  onChunkEnd = chunkEnd || null;
  onFinished = finished || null;
  onStateChange = stateChange || null;
}

export function setText(text, startChunkIndex = 0) {
  stop();
  const state = getState();
  const maxLen = state.ttsEngine === 'kokoro' ? KOKORO_CHUNK_LENGTH : undefined;
  chunks = splitIntoChunks(text, maxLen);
  currentChunkIndex = Math.min(startChunkIndex, chunks.length - 1);
  audioQueue = [];
  prefetchPromises.clear();
  setState({ currentChunkIndex, totalChunks: chunks.length });
}

export async function play() {
  if (isPaused) {
    const state = getState();
    if (state.ttsEngine === 'kokoro') {
      AudioManager.resumeKokoroAudio();
    } else {
      WebSpeechTTS.resume();
    }
    isPaused = false;
    isPlaying = true;
    emitStateChange('playing');
    return;
  }

  if (isPlaying) return;
  if (chunks.length === 0) return;

  isPlaying = true;
  isPaused = false;
  stopped = false;
  emitStateChange('playing');

  const state = getState();

  // Try Kokoro first
  if (state.ttsEngine === 'kokoro' && KokoroTTS.isAvailable()) {
    try {
      if (!KokoroTTS.isReady()) {
        await KokoroTTS.init();
      }
      await playKokoroLoop();
      return;
    } catch (err) {
      console.warn('Kokoro TTS failed, falling back to Web Speech:', err);
      setState({ ttsEngine: 'webSpeech' });
    }
  }

  // Web Speech fallback
  playWebSpeechLoop();
}

async function playKokoroLoop() {
  // Kick off prefetch for the first few chunks immediately
  prefetchKokoroChunks(currentChunkIndex, 5);

  while (isPlaying && !stopped && currentChunkIndex < chunks.length) {
    const idx = currentChunkIndex;
    const text = chunks[idx];

    onChunkStart?.(idx, text, chunks.length);

    // Wait for pre-fetched blob, or generate if not ready
    let audioBlob = await waitForPrefetch(idx);
    if (!audioBlob) {
      const state = getState();
      const voice = state.selectedVoiceId || 'af_sky';
      const speed = state.speed || 1.0;
      const result = await KokoroTTS.generate(text, { voice, speed });
      audioBlob = result.audio;
    }

    if (!isPlaying || stopped) break;

    // Pre-fetch ahead while current chunk plays
    prefetchKokoroChunks(idx + 1, 5);

    // Play the audio blob
    try {
      const state = getState();
      await AudioManager.playAudioBlob(audioBlob, { playbackRate: state.speed || 1.0 });
    } catch (err) {
      if (!isPlaying || stopped) break;
      console.warn('Audio playback error:', err);
    }

    if (!isPlaying || stopped) break;

    onChunkEnd?.(idx, chunks.length);
    currentChunkIndex = idx + 1;
    setState({ currentChunkIndex });
  }

  if (isPlaying && !stopped && currentChunkIndex >= chunks.length) {
    isPlaying = false;
    emitStateChange('stopped');
    onFinished?.();
  }
}

// Track in-flight prefetch promises so we can await them
let prefetchPromises = new Map(); // chunkIndex -> Promise<Blob>

function prefetchKokoroChunks(startIdx, count) {
  const state = getState();
  const voice = state.selectedVoiceId || 'af_sky';
  const speed = state.speed || 1.0;

  for (let i = startIdx; i < startIdx + count && i < chunks.length; i++) {
    const idx = i;
    if (audioQueue.some(q => q.chunkIndex === idx)) continue;
    if (prefetchPromises.has(idx)) continue;

    const promise = KokoroTTS.generate(chunks[idx], { voice, speed }).then(result => {
      prefetchPromises.delete(idx);
      if (!stopped) {
        audioQueue.push({ chunkIndex: idx, blob: result.audio });
      }
      return result.audio;
    }).catch((err) => {
      prefetchPromises.delete(idx);
      return null;
    });
    prefetchPromises.set(idx, promise);
  }
}

async function waitForPrefetch(idx) {
  // Check if already in the completed queue
  const queued = audioQueue.find(q => q.chunkIndex === idx);
  if (queued) {
    audioQueue = audioQueue.filter(q => q.chunkIndex !== idx);
    return queued.blob;
  }
  // Check if there's an in-flight prefetch we can await
  const pending = prefetchPromises.get(idx);
  if (pending) {
    const blob = await pending;
    // Remove from queue since we're consuming it directly
    audioQueue = audioQueue.filter(q => q.chunkIndex !== idx);
    return blob;
  }
  return null;
}

function playWebSpeechLoop() {
  if (!isPlaying || stopped || currentChunkIndex >= chunks.length) {
    if (isPlaying && currentChunkIndex >= chunks.length) {
      isPlaying = false;
      emitStateChange('stopped');
      onFinished?.();
    }
    return;
  }

  const idx = currentChunkIndex;
  const text = chunks[idx];

  onChunkStart?.(idx, text, chunks.length);

  WebSpeechTTS.speakChunk(text, {
    onEnd: () => {
      onChunkEnd?.(idx, chunks.length);
      if (isPlaying && !isPaused && !stopped) {
        currentChunkIndex = idx + 1;
        setState({ currentChunkIndex });
        playWebSpeechLoop();
      }
    },
    onError: (err) => {
      if (isPlaying && !isPaused && !stopped) {
        currentChunkIndex = idx + 1;
        setState({ currentChunkIndex });
        playWebSpeechLoop();
      }
    },
  });
}

export function pause() {
  if (!isPlaying) return;
  const state = getState();
  if (state.ttsEngine === 'kokoro') {
    AudioManager.pauseKokoroAudio();
  } else {
    WebSpeechTTS.pause();
  }
  isPaused = true;
  isPlaying = false;
  emitStateChange('paused');
}

export function stop() {
  stopped = true;
  isPlaying = false;
  isPaused = false;
  audioQueue = [];
  prefetchPromises.clear();
  AudioManager.stopKokoroAudio();
  WebSpeechTTS.stop();
  WebSpeechTTS.clearKeepAlive();
  emitStateChange('stopped');
}

export function setRate(newRate) {
  const state = getState();
  if (state.ttsEngine === 'kokoro') {
    AudioManager.setKokoroPlaybackRate(newRate);
    // Clear pre-fetch queue to regenerate at new speed
    audioQueue = [];
  } else {
    WebSpeechTTS.setRate(newRate);
    if (isPlaying) {
      WebSpeechTTS.stop();
      playWebSpeechLoop();
    }
  }
}

export function setVoice(voiceId) {
  const state = getState();
  setState({ selectedVoiceId: voiceId });
  if (state.ttsEngine === 'webSpeech') {
    WebSpeechTTS.setVoice(voiceId);
    if (isPlaying) {
      WebSpeechTTS.stop();
      playWebSpeechLoop();
    }
  } else {
    // Clear pre-fetch queue to regenerate with new voice
    audioQueue = [];
  }
}

export function getProgress() {
  return {
    chunkIndex: currentChunkIndex,
    totalChunks: chunks.length,
    percent: chunks.length > 0 ? Math.round((currentChunkIndex / chunks.length) * 100) : 0,
  };
}

export function getPlaybackState() {
  if (isPlaying) return 'playing';
  if (isPaused) return 'paused';
  return 'stopped';
}

/**
 * Skip forward or backward by approximate seconds.
 */
export function skipBySeconds(seconds) {
  if (chunks.length === 0) return currentChunkIndex;

  const state = getState();
  const rate = state.speed || 1.0;
  const wpm = 150 * rate;
  const wordsPerSecond = wpm / 60;
  const wordsToSkip = Math.abs(seconds) * wordsPerSecond;

  const direction = seconds > 0 ? 1 : -1;
  let wordsCount = 0;
  let targetIndex = currentChunkIndex;

  if (direction > 0) {
    for (let i = currentChunkIndex; i < chunks.length; i++) {
      const wordCount = chunks[i].split(/\s+/).length;
      wordsCount += wordCount;
      if (wordsCount >= wordsToSkip) {
        targetIndex = Math.min(i + 1, chunks.length - 1);
        break;
      }
      targetIndex = Math.min(i + 1, chunks.length - 1);
    }
  } else {
    for (let i = currentChunkIndex; i >= 0; i--) {
      const wordCount = chunks[i].split(/\s+/).length;
      wordsCount += wordCount;
      if (wordsCount >= wordsToSkip) {
        targetIndex = Math.max(i, 0);
        break;
      }
      targetIndex = Math.max(i - 1, 0);
    }
  }

  return targetIndex;
}

export { splitIntoChunks };

export function getCurrentChunkIndex() {
  return currentChunkIndex;
}

export function getIsPlaying() {
  return isPlaying;
}

export function getIsPaused() {
  return isPaused;
}

function emitStateChange(state) {
  setState({ playbackState: state });
  onStateChange?.(state);
}

// Auto-resume TTS when returning from background/lock screen
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isPlaying) {
      const state = getState();
      if (state.ttsEngine === 'webSpeech') {
        const synth = window.speechSynthesis;
        if (synth && !synth.speaking && !synth.pending) {
          playWebSpeechLoop();
        }
      }
    }
  });
}

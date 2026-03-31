/**
 * Web Speech API TTS adapter — fallback when Kokoro.js is unavailable.
 * Wraps speechSynthesis with the same adapter interface.
 */

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let selectedVoice = null;
let currentRate = 1.0;
let nativeVoices = [];

export async function init() {
  nativeVoices = await loadVoices();
}

export function loadVoices() {
  return new Promise((resolve) => {
    if (!synth) { resolve([]); return; }
    let voices = synth.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    const handler = () => {
      voices = synth.getVoices();
      if (voices.length > 0) {
        synth.removeEventListener('voiceschanged', handler);
        resolve(voices);
      }
    };
    synth.addEventListener('voiceschanged', handler);
    setTimeout(() => {
      synth.removeEventListener('voiceschanged', handler);
      resolve(synth.getVoices());
    }, 2000);
  });
}

export function listVoices() {
  return nativeVoices.map(v => ({
    id: v.voiceURI,
    name: v.name,
    lang: v.lang,
    _native: v,
  }));
}

export function generate(text, { voice, speed = 1.0 } = {}) {
  return new Promise((resolve, reject) => {
    if (!synth) { reject(new Error('speechSynthesis not available')); return; }

    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) {
      const nativeVoice = nativeVoices.find(v => v.voiceURI === voice);
      if (nativeVoice) utterance.voice = nativeVoice;
    } else if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    utterance.rate = speed;
    utterance.pitch = 1;

    utterance.onend = () => resolve({ audio: null }); // No blob for Web Speech
    utterance.onerror = (e) => {
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        reject(new Error(e.error));
      } else {
        resolve({ audio: null });
      }
    };

    synth.speak(utterance);
  });
}

export async function* stream(text, opts) {
  // Web Speech doesn't support streaming — single generate
  yield { text, audio: null };
}

export function isAvailable() {
  return !!synth;
}

export function isReady() {
  return !!synth && nativeVoices.length > 0;
}

export function setVoice(voice) {
  if (typeof voice === 'string') {
    selectedVoice = nativeVoices.find(v => v.voiceURI === voice) || null;
  } else {
    selectedVoice = voice;
  }
}

export function setRate(rate) {
  currentRate = rate;
}

export function stop() {
  if (synth) synth.cancel();
}

export function pause() {
  if (synth) synth.pause();
}

export function resume() {
  if (synth) synth.resume();
}

export function getSelectedVoice() {
  return selectedVoice;
}

export function getRate() {
  return currentRate;
}

export function getNativeVoices() {
  return nativeVoices;
}

/**
 * Speak a single chunk via Web Speech API.
 * Returns a promise that resolves when the chunk finishes.
 */
export function speakChunk(text, { onStart, onEnd, onError } = {}) {
  return new Promise((resolve) => {
    if (!synth) { resolve(); return; }

    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = currentRate;
    utterance.pitch = 1;

    utterance.onstart = () => onStart?.();
    utterance.onend = () => { onEnd?.(); resolve(); };
    utterance.onerror = (e) => {
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        onError?.(e.error);
      }
      resolve();
    };

    synth.speak(utterance);
    safariKeepAlive();
  });
}

let keepAliveTimer = null;
function safariKeepAlive() {
  clearInterval(keepAliveTimer);
  keepAliveTimer = setInterval(() => {
    if (synth && synth.speaking && !synth.paused) {
      synth.pause();
      synth.resume();
    } else if (synth && !synth.speaking) {
      clearInterval(keepAliveTimer);
    }
  }, 10000);
}

export function clearKeepAlive() {
  clearInterval(keepAliveTimer);
}

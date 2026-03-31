/**
 * Piper TTS adapter — client-side neural TTS using en_US-amy-medium voice.
 * Uses @mintplex-labs/piper-tts-web (~63MB ONNX model via WASM).
 * Model download is deferred to first play (not page load).
 */
import { setState } from '../store.js';

let piperModule = null;
let initialized = false;
let initializing = false;

export async function init() {
  if (initialized || initializing) return;
  initializing = true;

  try {
    piperModule = await import('@mintplex-labs/piper-tts-web');

    setState({ piperDownloadProgress: 0 });

    await piperModule.download('en_US-amy-medium', (progress) => {
      if (progress.total) {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        setState({ piperDownloadProgress: pct });
      }
    });

    initialized = true;
    setState({
      piperModelLoaded: true,
      piperDownloadProgress: 100,
    });
  } catch (err) {
    console.error('PiperTTS: init failed', err);
    initializing = false;
    throw err;
  }
}

export function listVoices() {
  return [
    { id: 'en_US-amy-medium', name: 'Amy (Female, Piper)', lang: 'en-US' },
  ];
}

export async function generate(text, { voice = 'en_US-amy-medium', speed = 1.0 } = {}) {
  if (!piperModule || !initialized) await init();

  const wavBlob = await piperModule.predict({ text, voiceId: voice });
  return { audio: wavBlob };
}

export function isAvailable() {
  return typeof WebAssembly !== 'undefined';
}

export function isReady() {
  return initialized;
}

export function stop() {
  // No-op for generation-based TTS — audio element handles stop
}

/**
 * Kokoro.js TTS adapter — high-quality client-side neural TTS.
 * Uses the 82M ONNX model via WASM for natural speech synthesis.
 * Model download is deferred to first play (not page load).
 */
import { getState, setState } from '../store.js';

let ttsInstance = null;
let voices = [];
let initialized = false;
let initializing = false;

export async function init() {
  if (initialized || initializing) return;
  initializing = true;

  try {
    // Dynamic import to avoid loading 86MB model at page load
    const { KokoroTTS } = await import('kokoro-js');

    setState({ kokoroDownloadProgress: 0 });

    ttsInstance = await KokoroTTS.from_pretrained(
      'onnx-community/Kokoro-82M-ONNX',
      {
        dtype: 'q8',
        progress_callback: (progress) => {
          if (progress.status === 'progress' && progress.total) {
            const pct = Math.round((progress.loaded / progress.total) * 100);
            setState({ kokoroDownloadProgress: pct });
          }
        },
      }
    );

    voices = ttsInstance.voices || [];
    initialized = true;
    setState({
      kokoroModelLoaded: true,
      kokoroDownloadProgress: 100,
    });
  } catch (err) {
    console.error('KokoroTTS: init failed', err);
    initializing = false;
    throw err;
  }
}

export function listVoices() {
  if (!ttsInstance || !voices.length) {
    // Return default voices before model loads
    return [
      { id: 'af_sky', name: 'Sky (Female)', lang: 'en-US' },
      { id: 'af_bella', name: 'Bella (Female)', lang: 'en-US' },
      { id: 'am_adam', name: 'Adam (Male)', lang: 'en-US' },
      { id: 'am_michael', name: 'Michael (Male)', lang: 'en-US' },
      { id: 'bf_emma', name: 'Emma (Female, British)', lang: 'en-GB' },
      { id: 'bm_george', name: 'George (Male, British)', lang: 'en-GB' },
    ];
  }
  return voices.map(v => ({
    id: v.id || v.name,
    name: v.name || v.id,
    lang: v.language || 'en-US',
  }));
}

export async function generate(text, { voice = 'af_sky', speed = 1.0 } = {}) {
  if (!ttsInstance) await init();

  const result = await ttsInstance.generate(text, { voice, speed });
  const wavData = result.toWav();
  const blob = new Blob([wavData], { type: 'audio/wav' });
  return { audio: blob };
}

export async function* stream(text, { voice = 'af_sky', speed = 1.0 } = {}) {
  if (!ttsInstance) await init();

  // If the model supports streaming, use it; otherwise fall back to full generate
  if (ttsInstance.stream) {
    const streamer = ttsInstance.stream(text, { voice, speed });
    for await (const chunk of streamer) {
      const wavData = chunk.toWav();
      const blob = new Blob([wavData], { type: 'audio/wav' });
      yield { text: chunk.text || text, audio: blob };
    }
  } else {
    const result = await generate(text, { voice, speed });
    yield { text, audio: result.audio };
  }
}

export function isAvailable() {
  // Kokoro requires WASM support
  return typeof WebAssembly !== 'undefined';
}

export function isReady() {
  return initialized;
}

export function stop() {
  // No-op for generation-based TTS — audio element handles stop
}

/**
 * Piper TTS adapter — client-side neural TTS using en_US-amy-medium voice.
 * Uses @mintplex-labs/piper-tts-web (~63MB ONNX model via WASM).
 * Model download is deferred to first play (not page load).
 */
import { setState } from '../store.js';

let piperModule = null;
let session = null;
let initialized = false;
let initializing = false;

// Serve ONNX WASM from same origin (public/onnx/) to avoid CORS + SW issues
const ONNX_WASM_PATH = import.meta.env.BASE_URL + 'onnx/';

const WASM_PATHS = {
  onnxWasm: ONNX_WASM_PATH,
  piperData: 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.data',
  piperWasm: 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.wasm',
};

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

    session = new piperModule.TtsSession({
      voiceId: 'en_US-amy-medium',
      wasmPaths: WASM_PATHS,
    });
    await session.waitReady;

    initialized = true;
    setState({
      piperModelLoaded: true,
      piperDownloadProgress: 100,
    });
  } catch (err) {
    console.error('PiperTTS: init failed, flushing cache and retrying...', err);
    try {
      await piperModule.flush().catch(() => {});
      await piperModule.download('en_US-amy-medium', (progress) => {
        if (progress.total) {
          const pct = Math.round((progress.loaded / progress.total) * 100);
          setState({ piperDownloadProgress: pct });
        }
      });
      session = new piperModule.TtsSession({
        voiceId: 'en_US-amy-medium',
        wasmPaths: WASM_PATHS,
      });
      await session.waitReady;
      initialized = true;
      setState({
        piperModelLoaded: true,
        piperDownloadProgress: 100,
      });
    } catch (retryErr) {
      console.error('PiperTTS: retry after flush also failed', retryErr);
      initializing = false;
      throw retryErr;
    }
  }
}

export function listVoices() {
  return [
    { id: 'en_US-amy-medium', name: 'Amy (Female, Piper)', lang: 'en-US' },
  ];
}

export async function generate(text, { voice = 'en_US-amy-medium', speed = 1.0 } = {}) {
  if (!session || !initialized) await init();

  const wavBlob = await session.predict(text);
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

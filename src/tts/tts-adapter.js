/**
 * TTS Adapter interface documentation.
 * Both KokoroTTS and WebSpeechTTS implement this interface.
 *
 * @typedef {Object} TTSVoice
 * @property {string} id
 * @property {string} name
 * @property {string} lang
 *
 * @typedef {Object} TTSAdapter
 * @property {() => Promise<void>} init - Initialize the engine
 * @property {() => TTSVoice[]} listVoices - List available voices
 * @property {(text: string, opts: { voice?: string, speed?: number }) => Promise<{ audio: Blob }>} generate
 * @property {(text: string, opts: { voice?: string, speed?: number }) => AsyncGenerator<{ text: string, audio: Blob }>} stream
 * @property {() => boolean} isAvailable - Check if engine can be used
 * @property {() => void} stop - Stop any current generation
 */

// This file is documentation-only. No runtime exports needed.

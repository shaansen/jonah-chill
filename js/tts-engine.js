/**
 * Text-to-Speech engine wrapping the Web Speech API.
 * Handles chunking, queueing, and iOS Safari workarounds.
 */
const TTSEngine = (() => {
  const synth = window.speechSynthesis;
  const MAX_CHUNK_LENGTH = 180;

  let chunks = [];
  let currentChunkIndex = 0;
  let isPlaying = false;
  let isPaused = false;
  let currentUtterance = null;
  let selectedVoice = null;
  let rate = 1.0;

  // Callbacks
  let onChunkStart = null;
  let onChunkEnd = null;
  let onFinished = null;
  let onStateChange = null;

  /**
   * Load available voices with Safari workaround.
   */
  function loadVoices() {
    return new Promise((resolve) => {
      let voices = synth.getVoices();
      if (voices.length > 0) {
        resolve(voices);
        return;
      }
      // Safari loads voices asynchronously
      const handler = () => {
        voices = synth.getVoices();
        if (voices.length > 0) {
          synth.removeEventListener('voiceschanged', handler);
          resolve(voices);
        }
      };
      synth.addEventListener('voiceschanged', handler);
      // Timeout fallback
      setTimeout(() => {
        synth.removeEventListener('voiceschanged', handler);
        resolve(synth.getVoices());
      }, 2000);
    });
  }

  /**
   * Split text into chunks at sentence boundaries, keeping each under MAX_CHUNK_LENGTH.
   */
  function splitIntoChunks(text) {
    const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];
    const result = [];
    let buffer = '';

    for (const sentence of sentences) {
      if (buffer.length + sentence.length > MAX_CHUNK_LENGTH && buffer.length > 0) {
        result.push(buffer.trim());
        buffer = '';
      }
      if (sentence.length > MAX_CHUNK_LENGTH) {
        if (buffer) {
          result.push(buffer.trim());
          buffer = '';
        }
        // Split long sentence by commas or spaces
        const parts = sentence.match(/.{1,180}(?:\s|$)/g) || [sentence];
        for (const part of parts) {
          if (part.trim()) result.push(part.trim());
        }
      } else {
        buffer += sentence;
      }
    }
    if (buffer.trim()) result.push(buffer.trim());
    return result.length > 0 ? result : [''];
  }

  /**
   * Set the text to speak (call before play).
   */
  function setText(text, startChunkIndex = 0) {
    stop();
    chunks = splitIntoChunks(text);
    currentChunkIndex = Math.min(startChunkIndex, chunks.length - 1);
  }

  /**
   * Start or resume playback.
   */
  function play() {
    if (isPaused && synth.paused) {
      synth.resume();
      isPaused = false;
      isPlaying = true;
      onStateChange?.('playing');
      return;
    }

    if (isPlaying) return;
    if (chunks.length === 0) return;

    isPlaying = true;
    isPaused = false;
    onStateChange?.('playing');
    speakChunk(currentChunkIndex);
  }

  function speakChunk(index) {
    if (index >= chunks.length) {
      isPlaying = false;
      onStateChange?.('stopped');
      onFinished?.();
      return;
    }

    // Safari workaround: cancel any pending utterances
    synth.cancel();

    currentChunkIndex = index;
    const utterance = new SpeechSynthesisUtterance(chunks[index]);
    currentUtterance = utterance;

    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = rate;
    utterance.pitch = 1;

    utterance.onstart = () => {
      onChunkStart?.(index, chunks[index], chunks.length);
    };

    utterance.onend = () => {
      onChunkEnd?.(index, chunks.length);
      if (isPlaying && !isPaused) {
        speakChunk(index + 1);
      }
    };

    utterance.onerror = (e) => {
      // 'interrupted' and 'canceled' are expected when stopping/changing chapters
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.warn('TTS error:', e.error);
      }
      // Try next chunk on error (except when intentionally stopped)
      if (isPlaying && !isPaused && e.error !== 'canceled') {
        speakChunk(index + 1);
      }
    };

    synth.speak(utterance);

    // Safari workaround: sometimes synth gets stuck, nudge it
    safariKeepAlive();
  }

  /**
   * Safari can pause synth after ~15s. Periodically resume to prevent this.
   */
  let keepAliveTimer = null;
  function safariKeepAlive() {
    clearInterval(keepAliveTimer);
    keepAliveTimer = setInterval(() => {
      if (synth.speaking && !synth.paused && isPlaying) {
        synth.pause();
        synth.resume();
      } else if (!synth.speaking && !isPaused) {
        clearInterval(keepAliveTimer);
      }
    }, 10000);
  }

  function pause() {
    if (!isPlaying) return;
    synth.pause();
    isPaused = true;
    isPlaying = false;
    onStateChange?.('paused');
  }

  function stop() {
    isPlaying = false;
    isPaused = false;
    synth.cancel();
    clearInterval(keepAliveTimer);
    onStateChange?.('stopped');
  }

  function setRate(newRate) {
    rate = newRate;
    // If currently playing, restart current chunk with new rate
    if (isPlaying) {
      synth.cancel();
      speakChunk(currentChunkIndex);
    }
  }

  function setVoice(voice) {
    selectedVoice = voice;
    if (isPlaying) {
      synth.cancel();
      speakChunk(currentChunkIndex);
    }
  }

  function getProgress() {
    return {
      chunkIndex: currentChunkIndex,
      totalChunks: chunks.length,
      percent: chunks.length > 0 ? Math.round((currentChunkIndex / chunks.length) * 100) : 0
    };
  }

  function getState() {
    if (isPlaying) return 'playing';
    if (isPaused) return 'paused';
    return 'stopped';
  }

  // Handle visibility change (tab switching / background)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isPlaying) {
      // Some browsers stop TTS in background — nothing we can do
    } else if (!document.hidden && isPaused && synth.paused) {
      // Offer to resume (handled by UI)
    }
  });

  return {
    loadVoices,
    setText,
    play,
    pause,
    stop,
    setRate,
    setVoice,
    getProgress,
    getState,
    get isPlaying() { return isPlaying; },
    get isPaused() { return isPaused; },
    get currentChunkIndex() { return currentChunkIndex; },
    set onChunkStart(fn) { onChunkStart = fn; },
    set onChunkEnd(fn) { onChunkEnd = fn; },
    set onFinished(fn) { onFinished = fn; },
    set onStateChange(fn) { onStateChange = fn; }
  };
})();

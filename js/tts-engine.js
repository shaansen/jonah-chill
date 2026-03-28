/**
 * Text-to-Speech engine wrapping the Web Speech API.
 * Handles chunking, queueing, and iOS Safari workarounds.
 */
const TTSEngine = (() => {
  const synth = window.speechSynthesis;
  const MAX_CHUNK_LENGTH = 180;

  // Abbreviations that shouldn't trigger sentence splits
  const ABBREVIATIONS = new Set([
    'dr', 'mr', 'mrs', 'ms', 'prof', 'sr', 'jr', 'st', 'ave', 'blvd',
    'gen', 'gov', 'sgt', 'cpl', 'pvt', 'capt', 'lt', 'col', 'maj',
    'vs', 'etc', 'inc', 'ltd', 'co', 'corp', 'dept', 'est', 'approx',
    'vol', 'no', 'fig', 'eq', 'rev', 'ed', 'al', 'ph'
  ]);

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

  function loadVoices() {
    return new Promise((resolve) => {
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

  /**
   * Check if a period at position i in text is part of an abbreviation,
   * decimal number, ellipsis, or initials (J. K. Rowling).
   */
  function isNonSentenceEnd(text, dotIndex) {
    if (dotIndex <= 0) return false;

    // Ellipsis: ...
    if (text[dotIndex - 1] === '.' || (dotIndex + 1 < text.length && text[dotIndex + 1] === '.')) {
      return true;
    }

    // Decimal number: 3.14
    if (/\d/.test(text[dotIndex - 1]) && dotIndex + 1 < text.length && /\d/.test(text[dotIndex + 1])) {
      return true;
    }

    // Single letter initial: J. K.
    if (dotIndex >= 1 && /^[A-Z]$/.test(text[dotIndex - 1])) {
      if (dotIndex < 2 || /[\s(]/.test(text[dotIndex - 2])) {
        return true;
      }
    }

    // Known abbreviation: Dr. Mr. U.S.
    // Walk back to find the word before the dot
    let wordStart = dotIndex - 1;
    while (wordStart > 0 && /[a-zA-Z.]/.test(text[wordStart - 1])) {
      wordStart--;
    }
    const word = text.substring(wordStart, dotIndex).replace(/\./g, '').toLowerCase();
    if (ABBREVIATIONS.has(word)) return true;

    // U.S.A. style (letters separated by dots)
    const dotted = text.substring(wordStart, dotIndex + 1);
    if (/^([A-Za-z]\.){2,}$/.test(dotted)) return true;

    return false;
  }

  /**
   * Split text into chunks at sentence boundaries, keeping each under MAX_CHUNK_LENGTH.
   * Handles abbreviations, decimals, ellipsis, and initials.
   */
  function splitIntoChunks(text) {
    if (!text || !text.trim()) return [''];

    // Split into sentences, respecting abbreviations
    const sentences = [];
    let current = '';

    for (let i = 0; i < text.length; i++) {
      current += text[i];

      if ((text[i] === '.' || text[i] === '!' || text[i] === '?') && !isNonSentenceEnd(text, i)) {
        // Consume trailing whitespace
        while (i + 1 < text.length && /\s/.test(text[i + 1])) {
          i++;
          current += text[i];
        }
        // Only split if next char is uppercase, end of text, or next sentence
        const nextChar = text[i + 1];
        if (!nextChar || /[A-Z"'\u201C\u2018(]/.test(nextChar)) {
          sentences.push(current);
          current = '';
        }
      }
    }
    if (current.trim()) sentences.push(current);

    // Combine sentences into chunks under MAX_CHUNK_LENGTH
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
        // Split oversized sentence at clause boundaries first
        splitLongSentence(sentence, result);
      } else {
        buffer += sentence;
      }
    }
    if (buffer.trim()) result.push(buffer.trim());
    return result.length > 0 ? result : [''];
  }

  /**
   * Split an oversized sentence at clause boundaries (commas, semicolons, colons, em-dashes).
   */
  function splitLongSentence(sentence, result) {
    // Try splitting at clause boundaries
    const clausePattern = /[,;:\u2014]\s*/g;
    const clauses = [];
    let lastIdx = 0;
    let match;

    while ((match = clausePattern.exec(sentence)) !== null) {
      clauses.push(sentence.substring(lastIdx, match.index + match[0].length));
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < sentence.length) {
      clauses.push(sentence.substring(lastIdx));
    }

    if (clauses.length > 1) {
      let buffer = '';
      for (const clause of clauses) {
        if (buffer.length + clause.length > MAX_CHUNK_LENGTH && buffer.length > 0) {
          result.push(buffer.trim());
          buffer = '';
        }
        if (clause.length > MAX_CHUNK_LENGTH) {
          if (buffer) { result.push(buffer.trim()); buffer = ''; }
          // Last resort: split at word boundaries
          const words = clause.match(/.{1,180}(?:\s|$)/g) || [clause];
          for (const w of words) {
            if (w.trim()) result.push(w.trim());
          }
        } else {
          buffer += clause;
        }
      }
      if (buffer.trim()) result.push(buffer.trim());
    } else {
      // No clause boundaries; split at word boundaries
      const parts = sentence.match(/.{1,180}(?:\s|$)/g) || [sentence];
      for (const part of parts) {
        if (part.trim()) result.push(part.trim());
      }
    }
  }

  function setText(text, startChunkIndex = 0) {
    stop();
    chunks = splitIntoChunks(text);
    currentChunkIndex = Math.min(startChunkIndex, chunks.length - 1);
  }

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
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.warn('TTS error:', e.error);
      }
      if (isPlaying && !isPaused && e.error !== 'canceled') {
        speakChunk(index + 1);
      }
    };

    synth.speak(utterance);
    safariKeepAlive();
  }

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

  /**
   * Skip forward or backward by approximate seconds.
   * Estimates word offset based on WPM at current rate.
   * Returns the new chunk index.
   */
  function skipBySeconds(seconds) {
    if (chunks.length === 0) return currentChunkIndex;

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

  // Auto-resume TTS when returning from background/lock screen.
  // The OS may kill speechSynthesis while the screen is off;
  // detect this and restart from the current chunk.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isPlaying) {
      // Check if speech was killed while we thought we were playing
      if (!synth.speaking && !synth.pending) {
        // Speech died in background — restart current chunk
        speakChunk(currentChunkIndex);
      }
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
    skipBySeconds,
    splitIntoChunks,
    get isPlaying() { return isPlaying; },
    get isPaused() { return isPaused; },
    get currentChunkIndex() { return currentChunkIndex; },
    get rate() { return rate; },
    set onChunkStart(fn) { onChunkStart = fn; },
    set onChunkEnd(fn) { onChunkEnd = fn; },
    set onFinished(fn) { onFinished = fn; },
    set onStateChange(fn) { onStateChange = fn; }
  };
})();

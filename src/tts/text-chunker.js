/**
 * Text chunking for TTS — split text at sentence boundaries,
 * respecting abbreviations, decimals, ellipsis, and initials.
 * Shared by both Kokoro and Web Speech TTS adapters.
 */

export const MAX_CHUNK_LENGTH = 180;

export const ABBREVIATIONS = new Set([
  'dr', 'mr', 'mrs', 'ms', 'prof', 'sr', 'jr', 'st', 'ave', 'blvd',
  'gen', 'gov', 'sgt', 'cpl', 'pvt', 'capt', 'lt', 'col', 'maj',
  'vs', 'etc', 'inc', 'ltd', 'co', 'corp', 'dept', 'est', 'approx',
  'vol', 'no', 'fig', 'eq', 'rev', 'ed', 'al', 'ph',
]);

/**
 * Check if a period at position dotIndex is part of an abbreviation,
 * decimal number, ellipsis, or initials (J. K. Rowling).
 */
export function isNonSentenceEnd(text, dotIndex) {
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

  // Known abbreviation
  let wordStart = dotIndex - 1;
  while (wordStart > 0 && /[a-zA-Z.]/.test(text[wordStart - 1])) {
    wordStart--;
  }
  const word = text.substring(wordStart, dotIndex).replace(/\./g, '').toLowerCase();
  if (ABBREVIATIONS.has(word)) return true;

  // U.S.A. style
  const dotted = text.substring(wordStart, dotIndex + 1);
  if (/^([A-Za-z]\.){2,}$/.test(dotted)) return true;

  return false;
}

/**
 * Split an oversized sentence at clause boundaries.
 */
export function splitLongSentence(sentence, result) {
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
    const parts = sentence.match(/.{1,180}(?:\s|$)/g) || [sentence];
    for (const part of parts) {
      if (part.trim()) result.push(part.trim());
    }
  }
}

/**
 * Split text into chunks at sentence boundaries, keeping each under MAX_CHUNK_LENGTH.
 */
export function splitIntoChunks(text) {
  if (!text || !text.trim()) return [''];

  const sentences = [];
  let current = '';

  for (let i = 0; i < text.length; i++) {
    current += text[i];

    if ((text[i] === '.' || text[i] === '!' || text[i] === '?') && !isNonSentenceEnd(text, i)) {
      while (i + 1 < text.length && /\s/.test(text[i + 1])) {
        i++;
        current += text[i];
      }
      const nextChar = text[i + 1];
      if (!nextChar || /[A-Z"'\u201C\u2018(]/.test(nextChar)) {
        sentences.push(current);
        current = '';
      }
    }
  }
  if (current.trim()) sentences.push(current);

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
      splitLongSentence(sentence, result);
    } else {
      buffer += sentence;
    }
  }
  if (buffer.trim()) result.push(buffer.trim());
  return result.length > 0 ? result : [''];
}

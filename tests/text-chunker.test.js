import { describe, it, expect } from 'vitest';
import { splitIntoChunks, isNonSentenceEnd } from '../src/tts/text-chunker.js';

describe('splitIntoChunks', () => {
  it('should split text into sentence-based chunks', () => {
    const text = 'First sentence. Second sentence. Third sentence.';
    const chunks = splitIntoChunks(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const joined = chunks.join(' ');
    expect(joined).toContain('First sentence');
    expect(joined).toContain('Third sentence');
  });

  it('should keep chunks under 200 characters', () => {
    const text = 'Short sentence. '.repeat(20);
    const chunks = splitIntoChunks(text);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200);
    }
  });

  it('should not split on abbreviations like Dr. and Mr.', () => {
    const text = 'Dr. Smith met Mr. Jones at the U.S. embassy.';
    const chunks = splitIntoChunks(text);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain('Dr. Smith');
    expect(chunks[0]).toContain('Mr. Jones');
  });

  it('should not split on decimal numbers like 3.14', () => {
    const text = 'The value of pi is 3.14159. It is irrational.';
    const chunks = splitIntoChunks(text);
    const joined = chunks.join(' ');
    expect(joined).toContain('3.14159');
  });

  it('should not split on ellipsis', () => {
    const text = 'Wait for it... The surprise was amazing.';
    const chunks = splitIntoChunks(text);
    const joined = chunks.join(' ');
    expect(joined).toContain('Wait for it...');
  });

  it('should handle initials like J. K. Rowling', () => {
    const text = 'J. K. Rowling wrote Harry Potter. It was popular.';
    const chunks = splitIntoChunks(text);
    const joined = chunks.join(' ');
    expect(joined).toContain('J. K. Rowling');
  });

  it('should handle empty text', () => {
    const chunks = splitIntoChunks('');
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe('');
  });

  it('should handle whitespace-only text', () => {
    const chunks = splitIntoChunks('   ');
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe('');
  });

  it('should split very long sentences at clause boundaries', () => {
    const long = 'This is a very long sentence that goes on and on, with many clauses separated by commas, and it just keeps going and going, never seeming to stop, until it finally reaches a period at the very end after many many words.';
    const chunks = splitIntoChunks(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200);
    }
  });

  it('should handle text with question marks', () => {
    const text = 'Is this working? Does it split correctly? Yes it does.';
    const chunks = splitIntoChunks(text);
    const joined = chunks.join(' ');
    expect(joined).toContain('Is this working?');
    expect(joined).toContain('Yes it does.');
  });

  it('should handle text with exclamation marks', () => {
    const text = 'Wow! Amazing! This is incredible!';
    const chunks = splitIntoChunks(text);
    const joined = chunks.join(' ');
    expect(joined).toContain('Wow!');
    expect(joined).toContain('incredible!');
  });
});

describe('isNonSentenceEnd', () => {
  it('should detect abbreviations', () => {
    expect(isNonSentenceEnd('Dr. Smith', 2)).toBe(true);
    expect(isNonSentenceEnd('Mr. Jones', 2)).toBe(true);
  });

  it('should detect decimals', () => {
    expect(isNonSentenceEnd('3.14', 1)).toBe(true);
  });

  it('should detect ellipsis', () => {
    expect(isNonSentenceEnd('wait...', 5)).toBe(true);
  });

  it('should detect initials', () => {
    expect(isNonSentenceEnd('J. K. Rowling', 1)).toBe(true);
  });

  it('should return false for real sentence ends', () => {
    expect(isNonSentenceEnd('The end. New start', 7)).toBe(false);
  });
});

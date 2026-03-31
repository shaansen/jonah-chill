import { describe, it, expect, beforeEach } from 'vitest';
import { generateBookId, getPrefs, savePrefs } from '../src/storage.js';

describe('generateBookId', () => {
  it('should generate consistent IDs for same input', () => {
    const id1 = generateBookId('My Book', 'Author');
    const id2 = generateBookId('My Book', 'Author');
    expect(id1).toBe(id2);
  });

  it('should generate different IDs for different input', () => {
    const id1 = generateBookId('Book A', 'Author A');
    const id2 = generateBookId('Book B', 'Author B');
    expect(id1).not.toBe(id2);
  });

  it('should start with "book_" prefix', () => {
    const id = generateBookId('Test', 'Author');
    expect(id.startsWith('book_')).toBe(true);
  });
});

describe('Preferences', () => {
  beforeEach(() => {
    localStorage.removeItem('epub-reader-prefs');
  });

  it('should save and retrieve preferences', () => {
    savePrefs({ rate: 1.5 });
    const prefs = getPrefs();
    expect(prefs.rate).toBe(1.5);
  });

  it('should merge preferences (not overwrite)', () => {
    savePrefs({ rate: 1.5 });
    savePrefs({ voiceURI: 'test-voice' });
    const prefs = getPrefs();
    expect(prefs.rate).toBe(1.5);
    expect(prefs.voiceURI).toBe('test-voice');
  });

  it('should return empty object for no prefs', () => {
    const prefs = getPrefs();
    expect(prefs).toEqual({});
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setText, getProgress, getPlaybackState, skipBySeconds } from '../src/playback/playback-controller.js';
import { setState } from '../src/store.js';

describe('PlaybackController', () => {
  beforeEach(() => {
    setState({ speed: 1.0, ttsEngine: 'webSpeech', selectedVoiceId: null });
  });

  it('should set text and create chunks', () => {
    setText('First sentence. Second sentence. Third sentence.');
    const progress = getProgress();
    expect(progress.totalChunks).toBeGreaterThanOrEqual(1);
    expect(progress.chunkIndex).toBe(0);
  });

  it('should start at given chunk index', () => {
    // Use enough text to produce multiple chunks
    const long = 'This is the first sentence with enough words to fill a chunk. This is the second sentence that also has plenty of words. And the third sentence continues the pattern with lots of text.';
    setText(long, 1);
    const progress = getProgress();
    expect(progress.chunkIndex).toBe(1);
  });

  it('should report stopped state initially', () => {
    expect(getPlaybackState()).toBe('stopped');
  });

  it('should calculate skip target forward', () => {
    setText('Word one. Word two. Word three. Word four. Word five.');
    const target = skipBySeconds(30);
    expect(target).toBeGreaterThanOrEqual(0);
  });

  it('should calculate skip target backward', () => {
    setText('Word one. Word two. Word three. Word four. Word five.', 3);
    const target = skipBySeconds(-30);
    expect(target).toBeLessThanOrEqual(3);
  });

  it('should handle empty text', () => {
    setText('');
    const progress = getProgress();
    expect(progress.totalChunks).toBe(1);
    expect(progress.percent).toBe(0);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { getState, setState, subscribe, subscribeAll } from '../src/store.js';

describe('Store', () => {
  beforeEach(() => {
    // Reset to defaults
    setState({
      book: null,
      bookId: null,
      currentChapter: 0,
      playbackState: 'stopped',
      currentChunkIndex: 0,
      totalChunks: 0,
      speed: 1.0,
      selectedVoiceId: null,
      ttsEngine: 'kokoro',
      kokoroModelLoaded: false,
      kokoroDownloadProgress: 0,
      chapterWordCounts: [],
      chapterCharCounts: [],
      totalChars: 0,
      sleepMode: 'off',
      sleepTimerEnd: 0,
      activeView: 'upload',
      loading: false,
      loadingMessage: '',
      library: [],
      prefs: {},
    });
  });

  it('should return initial state', () => {
    const state = getState();
    expect(state.playbackState).toBe('stopped');
    expect(state.speed).toBe(1.0);
    expect(state.book).toBeNull();
  });

  it('should update state via setState', () => {
    setState({ speed: 2.0 });
    expect(getState().speed).toBe(2.0);
  });

  it('should not notify subscribers when value unchanged', () => {
    let callCount = 0;
    subscribe('speed', () => callCount++);
    setState({ speed: 1.0 }); // Same value
    expect(callCount).toBe(0);
  });

  it('should notify per-key subscribers on change', () => {
    let received = null;
    subscribe('speed', (state) => { received = state.speed; });
    setState({ speed: 1.5 });
    expect(received).toBe(1.5);
  });

  it('should support unsubscribe', () => {
    let callCount = 0;
    const unsub = subscribe('speed', () => callCount++);
    setState({ speed: 1.5 });
    expect(callCount).toBe(1);
    unsub();
    setState({ speed: 2.0 });
    expect(callCount).toBe(1);
  });

  it('should notify global subscribers', () => {
    let changedKeys = [];
    subscribeAll((state, keys) => { changedKeys = keys; });
    setState({ speed: 2.0, playbackState: 'playing' });
    expect(changedKeys).toContain('speed');
    expect(changedKeys).toContain('playbackState');
  });

  it('should update multiple keys at once', () => {
    setState({ speed: 2.5, currentChapter: 3 });
    const state = getState();
    expect(state.speed).toBe(2.5);
    expect(state.currentChapter).toBe(3);
  });
});

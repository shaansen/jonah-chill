/**
 * Vitest setup — mocks for browser APIs not available in jsdom.
 */
import { vi } from 'vitest';

// Mock speechSynthesis
const mockSynth = {
  getVoices: vi.fn(() => []),
  speak: vi.fn(),
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  speaking: false,
  paused: false,
  pending: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};
global.speechSynthesis = mockSynth;
global.SpeechSynthesisUtterance = vi.fn(() => ({
  voice: null,
  rate: 1,
  pitch: 1,
  onstart: null,
  onend: null,
  onerror: null,
}));

// Mock MediaMetadata
global.MediaMetadata = vi.fn((opts) => opts);

// Mock navigator.mediaSession
if (!navigator.mediaSession) {
  Object.defineProperty(navigator, 'mediaSession', {
    value: {
      metadata: null,
      playbackState: 'none',
      setActionHandler: vi.fn(),
    },
    writable: true,
  });
}

// Mock AudioContext
global.AudioContext = vi.fn(() => ({
  state: 'running',
  resume: vi.fn(() => Promise.resolve()),
  createOscillator: vi.fn(() => ({
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  })),
  createGain: vi.fn(() => ({
    gain: { value: 0 },
    connect: vi.fn(),
  })),
  destination: {},
}));

/**
 * Sleep timer — pause playback after a set duration or at end of chapter.
 */
import { getState, setState } from '../store.js';

let sleepTimerInterval = null;
let sleepTimerEnd = 0;
let sleepEndOfChapter = false;
let onSleepExpired = null;

/**
 * Set callback for when sleep timer fires.
 * @param {Function} fn - Called with 'timer' | 'chapter'
 */
export function onExpired(fn) {
  onSleepExpired = fn;
}

export function startTimer(minutes) {
  clearTimer();
  sleepTimerEnd = Date.now() + minutes * 60 * 1000;
  sleepEndOfChapter = false;
  setState({ sleepMode: 'timer', sleepTimerEnd });

  sleepTimerInterval = setInterval(() => {
    const remaining = Math.max(0, sleepTimerEnd - Date.now());
    const mins = Math.ceil(remaining / 60000);

    // Update UI via callback (will be wired by drawer-ui)
    if (updateCountdownFn) updateCountdownFn(`${mins}m`);

    if (remaining <= 0) {
      clearTimer();
      onSleepExpired?.('timer');
    }
  }, 1000);

  if (updateCountdownFn) updateCountdownFn(`${minutes}m`);
}

export function startEndOfChapter() {
  clearTimer();
  sleepEndOfChapter = true;
  setState({ sleepMode: 'chapter' });
  if (updateCountdownFn) updateCountdownFn('Ch');
}

export function clearTimer() {
  clearInterval(sleepTimerInterval);
  sleepTimerInterval = null;
  sleepTimerEnd = 0;
  sleepEndOfChapter = false;
  setState({ sleepMode: 'off', sleepTimerEnd: 0 });
  if (updateCountdownFn) updateCountdownFn(null);
}

export function isEndOfChapter() {
  return sleepEndOfChapter;
}

// UI update callback
let updateCountdownFn = null;
export function setCountdownUpdater(fn) {
  updateCountdownFn = fn;
}

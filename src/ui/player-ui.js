/**
 * Player UI — player view bindings + keyboard shortcuts.
 */
import * as UI from './ui.js';

const btnBack = document.getElementById('btn-back');
const btnSave = document.getElementById('btn-save');
const btnPlay = document.getElementById('btn-play');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnSkipBack = document.getElementById('btn-skip-back');
const btnSkipForward = document.getElementById('btn-skip-forward');
const progressBar = document.getElementById('progress-bar');

export function bindEvents({
  onBack,
  onSave,
  onPlayPause,
  onPrev,
  onNext,
  onSkipBack,
  onSkipForward,
  onSpeedChange,
  onVoiceChange,
  onProgressSeek,
  getBook,
}) {
  btnBack.addEventListener('click', onBack);
  btnSave.addEventListener('click', onSave);
  btnPlay.addEventListener('click', onPlayPause);
  btnPrev.addEventListener('click', onPrev);
  btnNext.addEventListener('click', onNext);
  btnSkipBack.addEventListener('click', onSkipBack);
  btnSkipForward.addEventListener('click', onSkipForward);

  UI.elements.speedSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    UI.setSpeed(val);
    onSpeedChange(val);
  });

  UI.elements.voiceSelect.addEventListener('change', (e) => {
    onVoiceChange(e.target.value);
  });

  progressBar.addEventListener('click', (e) => {
    const rect = progressBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    onProgressSeek(pct);
  });

  bindKeyboardShortcuts({
    onPlayPause,
    onPrev,
    onNext,
    onSkipBack,
    onSkipForward,
    onSpeedChange,
    getBook,
  });
}

function bindKeyboardShortcuts({ onPlayPause, onPrev, onNext, onSkipBack, onSkipForward, onSpeedChange, getBook }) {
  document.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (!getBook()) return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        onPlayPause();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (e.shiftKey) onSkipBack();
        else onPrev();
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (e.shiftKey) onSkipForward();
        else onNext();
        break;
      case 'ArrowUp':
        e.preventDefault();
        onSpeedChange(null, 0.1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        onSpeedChange(null, -0.1);
        break;
    }
  });
}

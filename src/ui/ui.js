/**
 * Core UI module — view switching, toast, loading overlay.
 */

const uploadView = document.getElementById('upload-view');
const playerView = document.getElementById('player-view');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const toastEl = document.getElementById('toast');

let toastTimer = null;

export function showView(name) {
  uploadView.classList.toggle('active', name === 'upload');
  playerView.classList.toggle('active', name === 'player');
}

export function toast(message, duration = 3000) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.hidden = false;
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, duration);
}

export function showLoading(message) {
  loadingMessage.textContent = message || 'Loading...';
  loadingOverlay.hidden = false;
}

export function hideLoading() {
  loadingOverlay.hidden = true;
}

export function setLoading(loading) {
  uploadView.classList.toggle('loading', loading);
}

// Player elements exposed for other UI modules
export const elements = {
  bookTitle: document.getElementById('book-title'),
  bookAuthor: document.getElementById('book-author'),
  chapterTitle: document.getElementById('chapter-title'),
  currentText: document.getElementById('current-text'),
  iconPlay: document.getElementById('icon-play'),
  iconPause: document.getElementById('icon-pause'),
  btnPlay: document.getElementById('btn-play'),
  progressFill: document.getElementById('progress-fill'),
  progressPercent: document.getElementById('progress-percent'),
  chapterProgress: document.getElementById('chapter-progress'),
  bookProgressFill: document.getElementById('book-progress-fill'),
  timeRemaining: document.getElementById('time-remaining'),
  speedSlider: document.getElementById('speed-slider'),
  speedValue: document.getElementById('speed-value'),
  voiceSelect: document.getElementById('voice-select'),
};

export function setBookInfo(title, author) {
  elements.bookTitle.textContent = title;
  elements.bookAuthor.textContent = author;
}

export function setChapterTitle(title) {
  elements.chapterTitle.textContent = title;
}

export function setCurrentText(text) {
  elements.currentText.textContent = text;
}

export function highlightCurrentText(fullText, chunkText) {
  const ct = elements.currentText;
  if (!chunkText) {
    ct.textContent = fullText;
    return;
  }
  const idx = fullText.indexOf(chunkText);
  if (idx < 0) {
    ct.textContent = chunkText;
    return;
  }
  const before = fullText.substring(Math.max(0, idx - 100), idx);
  const after = fullText.substring(idx + chunkText.length, idx + chunkText.length + 100);

  ct.innerHTML = '';
  if (before) {
    const spanBefore = document.createElement('span');
    spanBefore.textContent = (idx > 100 ? '...' : '') + before;
    ct.appendChild(spanBefore);
  }
  const spanHighlight = document.createElement('span');
  spanHighlight.className = 'highlight';
  spanHighlight.textContent = chunkText;
  ct.appendChild(spanHighlight);
  if (after) {
    const spanAfter = document.createElement('span');
    spanAfter.textContent = after + (idx + chunkText.length + 100 < fullText.length ? '...' : '');
    ct.appendChild(spanAfter);
  }
}

export function setPlayState(playing) {
  elements.iconPlay.hidden = playing;
  elements.iconPause.hidden = !playing;
  elements.btnPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');
}

export function updateProgress(percent, chapterNum, totalChapters) {
  elements.progressFill.style.width = percent + '%';
  elements.progressPercent.textContent = percent + '%';
  elements.chapterProgress.textContent = `Ch ${chapterNum} / ${totalChapters}`;
}

export function updateBookProgress(percent) {
  elements.bookProgressFill.style.width = percent + '%';
}

export function updateTimeRemaining(text) {
  elements.timeRemaining.textContent = text;
}

export function populateVoices(voices, selectedUri) {
  const select = elements.voiceSelect;
  select.innerHTML = '';
  voices.forEach(voice => {
    const opt = document.createElement('option');
    opt.value = voice.id || voice.voiceURI;
    opt.textContent = `${voice.name} (${voice.lang})`;
    if ((voice.id || voice.voiceURI) === selectedUri) opt.selected = true;
    select.appendChild(opt);
  });
}

export function setSpeed(val) {
  elements.speedSlider.value = val;
  elements.speedValue.textContent = parseFloat(val).toFixed(1) + 'x';
}

/**
 * UI module — all DOM manipulation.
 */
const UI = (() => {
  // Views
  const uploadView = document.getElementById('upload-view');
  const playerView = document.getElementById('player-view');

  // Loading overlay
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingMessage = document.getElementById('loading-message');

  // Upload
  const fileInput = document.getElementById('file-input');
  const librarySection = document.getElementById('library-section');
  const libraryList = document.getElementById('library-list');

  // Player header
  const bookTitle = document.getElementById('book-title');
  const bookAuthor = document.getElementById('book-author');
  const btnBack = document.getElementById('btn-back');
  const btnChapters = document.getElementById('btn-chapters');

  // Book progress
  const bookProgressFill = document.getElementById('book-progress-fill');

  // Player content
  const chapterTitle = document.getElementById('chapter-title');
  const currentText = document.getElementById('current-text');

  // Controls
  const btnPlay = document.getElementById('btn-play');
  const iconPlay = document.getElementById('icon-play');
  const iconPause = document.getElementById('icon-pause');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const btnSkipBack = document.getElementById('btn-skip-back');
  const btnSkipForward = document.getElementById('btn-skip-forward');
  const progressBar = document.getElementById('progress-bar');
  const progressFill = document.getElementById('progress-fill');
  const progressPercent = document.getElementById('progress-percent');
  const timeRemaining = document.getElementById('time-remaining');
  const chapterProgress = document.getElementById('chapter-progress');
  const speedSlider = document.getElementById('speed-slider');
  const speedValue = document.getElementById('speed-value');
  const voiceSelect = document.getElementById('voice-select');

  // Sleep timer
  const btnSleep = document.getElementById('btn-sleep');
  const sleepMenu = document.getElementById('sleep-menu');
  const sleepCountdown = document.getElementById('sleep-countdown');

  // Chapter drawer
  const chapterDrawer = document.getElementById('chapter-drawer');
  const chapterList = document.getElementById('chapter-list');
  const chapterSearch = document.getElementById('chapter-search');

  // Toast
  const toastEl = document.getElementById('toast');
  let toastTimer = null;

  function showView(name) {
    uploadView.classList.toggle('active', name === 'upload');
    playerView.classList.toggle('active', name === 'player');
  }

  function setBookInfo(title, author) {
    bookTitle.textContent = title;
    bookAuthor.textContent = author;
  }

  function setChapterTitle(title) {
    chapterTitle.textContent = title;
  }

  function setCurrentText(text) {
    currentText.textContent = text;
  }

  function highlightCurrentText(fullText, chunkText) {
    if (!chunkText) {
      currentText.textContent = fullText;
      return;
    }
    const idx = fullText.indexOf(chunkText);
    if (idx < 0) {
      currentText.textContent = chunkText;
      return;
    }
    const before = fullText.substring(Math.max(0, idx - 100), idx);
    const after = fullText.substring(idx + chunkText.length, idx + chunkText.length + 100);

    currentText.innerHTML = '';
    if (before) {
      const spanBefore = document.createElement('span');
      spanBefore.textContent = (idx > 100 ? '...' : '') + before;
      currentText.appendChild(spanBefore);
    }
    const spanHighlight = document.createElement('span');
    spanHighlight.className = 'highlight';
    spanHighlight.textContent = chunkText;
    currentText.appendChild(spanHighlight);
    if (after) {
      const spanAfter = document.createElement('span');
      spanAfter.textContent = after + (idx + chunkText.length + 100 < fullText.length ? '...' : '');
      currentText.appendChild(spanAfter);
    }
  }

  function setPlayState(playing) {
    iconPlay.hidden = playing;
    iconPause.hidden = !playing;
    btnPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }

  function updateProgress(percent, chapterNum, totalChapters) {
    progressFill.style.width = percent + '%';
    progressPercent.textContent = percent + '%';
    chapterProgress.textContent = `Ch ${chapterNum} / ${totalChapters}`;
  }

  function updateBookProgress(percent) {
    bookProgressFill.style.width = percent + '%';
  }

  function updateTimeRemaining(text) {
    timeRemaining.textContent = text;
  }

  function populateVoices(voices, selectedUri) {
    voiceSelect.innerHTML = '';
    voices.forEach(voice => {
      const opt = document.createElement('option');
      opt.value = voice.voiceURI;
      opt.textContent = `${voice.name} (${voice.lang})`;
      if (voice.voiceURI === selectedUri) opt.selected = true;
      voiceSelect.appendChild(opt);
    });
  }

  function setSpeed(val) {
    speedSlider.value = val;
    speedValue.textContent = parseFloat(val).toFixed(1) + 'x';
  }

  function populateChapterList(chapters, activeIndex, chapterWordCounts, rate) {
    chapterList.innerHTML = '';
    chapters.forEach((ch, i) => {
      const li = document.createElement('li');
      li.dataset.index = i;
      const titleSpan = document.createElement('span');
      titleSpan.textContent = ch.title;
      li.appendChild(titleSpan);

      // Show per-chapter time estimate
      if (chapterWordCounts && chapterWordCounts[i] !== undefined && rate) {
        const mins = Math.ceil(chapterWordCounts[i] / (150 * rate));
        const timeSpan = document.createElement('span');
        timeSpan.className = 'chapter-time';
        timeSpan.textContent = `~${mins} min`;
        li.appendChild(timeSpan);
      }

      if (i === activeIndex) li.classList.add('active');
      li.addEventListener('click', () => {
        chapterDrawer.hidden = true;
        onChapterSelect?.(i);
      });
      chapterList.appendChild(li);
    });

    // Reset search
    if (chapterSearch) chapterSearch.value = '';
  }

  function showChapterDrawer() {
    chapterDrawer.hidden = false;
    if (chapterSearch) {
      chapterSearch.value = '';
      filterChapters('');
    }
  }

  function hideChapterDrawer() {
    chapterDrawer.hidden = true;
  }

  function filterChapters(query) {
    const items = chapterList.querySelectorAll('li');
    const q = query.toLowerCase();
    items.forEach(li => {
      const text = li.textContent.toLowerCase();
      li.classList.toggle('hidden', q !== '' && !text.includes(q));
    });
  }

  function renderLibrary(books, onResume, onDelete) {
    if (books.length === 0) {
      librarySection.hidden = true;
      return;
    }
    librarySection.hidden = false;
    libraryList.innerHTML = '';

    const sorted = [...books].sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0));
    sorted.forEach(book => {
      const div = document.createElement('div');
      div.className = 'library-item';

      const info = document.createElement('div');
      info.className = 'library-item-info';
      info.innerHTML = `<div class="library-item-title">${escapeHtml(book.title)}</div>
        <div class="library-item-author">${escapeHtml(book.author)}</div>`;

      const progress = document.createElement('span');
      progress.className = 'library-item-progress';
      progress.textContent = `Ch ${(book.chapter || 0) + 1}/${book.totalChapters || '?'}`;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'library-item-delete';
      deleteBtn.innerHTML = '&times;';
      deleteBtn.title = 'Remove from library';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onDelete(book.id);
      });

      div.appendChild(info);
      div.appendChild(progress);
      div.appendChild(deleteBtn);

      div.addEventListener('click', () => onResume(book));
      libraryList.appendChild(div);
    });
  }

  function toast(message, duration = 3000) {
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.hidden = false;
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, duration);
  }

  function showLoading(message) {
    loadingMessage.textContent = message || 'Loading...';
    loadingOverlay.hidden = false;
  }

  function hideLoading() {
    loadingOverlay.hidden = true;
  }

  function setLoading(loading) {
    uploadView.classList.toggle('loading', loading);
  }

  // Sleep timer UI
  function showSleepMenu() {
    sleepMenu.hidden = false;
  }

  function hideSleepMenu() {
    sleepMenu.hidden = true;
  }

  function updateSleepCountdown(text) {
    if (text) {
      sleepCountdown.textContent = text;
      sleepCountdown.hidden = false;
      btnSleep.classList.add('active');
    } else {
      sleepCountdown.hidden = true;
      btnSleep.classList.remove('active');
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Event binding
  let onChapterSelect = null;

  // Drawer backdrop close
  chapterDrawer.querySelector('.drawer-backdrop')?.addEventListener('click', hideChapterDrawer);
  chapterDrawer.querySelector('.drawer-close')?.addEventListener('click', hideChapterDrawer);

  // Chapter search filter
  if (chapterSearch) {
    chapterSearch.addEventListener('input', (e) => {
      filterChapters(e.target.value);
    });
  }

  return {
    showView,
    setBookInfo,
    setChapterTitle,
    setCurrentText,
    highlightCurrentText,
    setPlayState,
    updateProgress,
    updateBookProgress,
    updateTimeRemaining,
    populateVoices,
    setSpeed,
    populateChapterList,
    showChapterDrawer,
    hideChapterDrawer,
    renderLibrary,
    toast,
    showLoading,
    hideLoading,
    setLoading,
    showSleepMenu,
    hideSleepMenu,
    updateSleepCountdown,
    // Elements for event binding
    fileInput,
    btnBack,
    btnChapters,
    btnPlay,
    btnPrev,
    btnNext,
    btnSkipBack,
    btnSkipForward,
    btnSleep,
    sleepMenu,
    progressBar,
    speedSlider,
    voiceSelect,
    set onChapterSelect(fn) { onChapterSelect = fn; }
  };
})();

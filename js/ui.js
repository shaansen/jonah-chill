/**
 * UI module — all DOM manipulation.
 */
const UI = (() => {
  // Views
  const uploadView = document.getElementById('upload-view');
  const playerView = document.getElementById('player-view');

  // Upload
  const fileInput = document.getElementById('file-input');
  const librarySection = document.getElementById('library-section');
  const libraryList = document.getElementById('library-list');

  // Player header
  const bookTitle = document.getElementById('book-title');
  const bookAuthor = document.getElementById('book-author');
  const btnBack = document.getElementById('btn-back');
  const btnChapters = document.getElementById('btn-chapters');

  // Player content
  const chapterTitle = document.getElementById('chapter-title');
  const currentText = document.getElementById('current-text');

  // Controls
  const btnPlay = document.getElementById('btn-play');
  const iconPlay = document.getElementById('icon-play');
  const iconPause = document.getElementById('icon-pause');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const progressBar = document.getElementById('progress-bar');
  const progressFill = document.getElementById('progress-fill');
  const progressPercent = document.getElementById('progress-percent');
  const chapterProgress = document.getElementById('chapter-progress');
  const speedSlider = document.getElementById('speed-slider');
  const speedValue = document.getElementById('speed-value');
  const voiceSelect = document.getElementById('voice-select');

  // Chapter drawer
  const chapterDrawer = document.getElementById('chapter-drawer');
  const chapterList = document.getElementById('chapter-list');

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
    // Show a window around the current chunk
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

  function populateChapterList(chapters, activeIndex) {
    chapterList.innerHTML = '';
    chapters.forEach((ch, i) => {
      const li = document.createElement('li');
      li.textContent = ch.title;
      if (i === activeIndex) li.classList.add('active');
      li.addEventListener('click', () => {
        chapterDrawer.hidden = true;
        onChapterSelect?.(i);
      });
      chapterList.appendChild(li);
    });
  }

  function showChapterDrawer() {
    chapterDrawer.hidden = false;
  }

  function hideChapterDrawer() {
    chapterDrawer.hidden = true;
  }

  function renderLibrary(books, onResume, onDelete) {
    if (books.length === 0) {
      librarySection.hidden = true;
      return;
    }
    librarySection.hidden = false;
    libraryList.innerHTML = '';

    // Sort by most recently read
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

  function setLoading(loading) {
    uploadView.classList.toggle('loading', loading);
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

  return {
    showView,
    setBookInfo,
    setChapterTitle,
    setCurrentText,
    highlightCurrentText,
    setPlayState,
    updateProgress,
    populateVoices,
    setSpeed,
    populateChapterList,
    showChapterDrawer,
    hideChapterDrawer,
    renderLibrary,
    toast,
    setLoading,
    // Elements for event binding
    fileInput,
    btnBack,
    btnChapters,
    btnPlay,
    btnPrev,
    btnNext,
    progressBar,
    speedSlider,
    voiceSelect,
    set onChapterSelect(fn) { onChapterSelect = fn; }
  };
})();

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
  const btnSave = document.getElementById('btn-save');
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

  // Auth
  const btnAuth = document.getElementById('btn-auth');
  const authDrawer = document.getElementById('auth-drawer');
  const authDrawerTitle = document.getElementById('auth-drawer-title');
  const authEmail = document.getElementById('auth-email');
  const authPassword = document.getElementById('auth-password');
  const authSubmit = document.getElementById('auth-submit');
  const authToggleText = document.getElementById('auth-toggle-text');
  const authToggleBtn = document.getElementById('auth-toggle-btn');
  const authError = document.getElementById('auth-error');
  const authForm = document.getElementById('auth-form');
  const authSignedIn = document.getElementById('auth-signed-in');
  const authUserEmail = document.getElementById('auth-user-email');
  const authSignout = document.getElementById('auth-signout');
  let authIsSignUp = false;

  // Search drawer
  const btnSearch = document.getElementById('btn-search');
  const searchDrawer = document.getElementById('search-drawer');
  const bookSearchInput = document.getElementById('book-search-input');
  const searchResults = document.getElementById('search-results');
  const searchStatus = document.getElementById('search-status');

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
      const titleDiv = document.createElement('div');
      titleDiv.className = 'library-item-title';
      titleDiv.textContent = book.title;
      const authorDiv = document.createElement('div');
      authorDiv.className = 'library-item-author';
      authorDiv.textContent = book.author;
      info.appendChild(titleDiv);
      info.appendChild(authorDiv);

      const progress = document.createElement('span');
      progress.className = 'library-item-progress';
      progress.textContent = `Ch ${(book.chapter || 0) + 1}/${book.totalChapters || '?'}`;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'library-item-delete';
      deleteBtn.textContent = '\u00d7';
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

  // --- Auth Drawer ---

  function showAuthDrawer() {
    authDrawer.hidden = false;
    authError.hidden = true;
    authEmail.value = '';
    authPassword.value = '';
  }

  function hideAuthDrawer() {
    authDrawer.hidden = true;
  }

  function setAuthMode(isSignUp) {
    authIsSignUp = isSignUp;
    authDrawerTitle.textContent = isSignUp ? 'Sign Up' : 'Sign In';
    authSubmit.textContent = isSignUp ? 'Sign Up' : 'Sign In';
    authToggleText.textContent = isSignUp ? 'Already have an account?' : "Don't have an account?";
    authToggleBtn.textContent = isSignUp ? 'Sign In' : 'Sign Up';
    authError.hidden = true;
  }

  function setAuthState(user) {
    if (user) {
      btnAuth.textContent = user.email;
      btnAuth.classList.add('signed-in');
      authForm.hidden = true;
      authSignedIn.hidden = false;
      authUserEmail.textContent = user.email;
    } else {
      btnAuth.textContent = 'Sign in to sync';
      btnAuth.classList.remove('signed-in');
      authForm.hidden = false;
      authSignedIn.hidden = true;
    }
  }

  function showAuthError(msg) {
    authError.textContent = msg;
    authError.hidden = false;
  }

  // --- Search Drawer ---

  function showSearchDrawer() {
    searchDrawer.hidden = false;
    bookSearchInput.value = '';
    searchResults.innerHTML = '';
    searchStatus.hidden = true;
    setTimeout(() => bookSearchInput.focus(), 100);
  }

  function hideSearchDrawer() {
    searchDrawer.hidden = true;
  }

  function renderSearchResults(results, onSelect) {
    searchResults.innerHTML = '';
    if (results.length === 0) {
      searchStatus.textContent = 'No results found';
      searchStatus.hidden = false;
      return;
    }
    searchStatus.textContent = `${results.length} result${results.length !== 1 ? 's' : ''}`;
    searchStatus.hidden = false;

    results.forEach((r, i) => {
      const li = document.createElement('li');
      li.className = 'search-result-item';

      const chTitle = document.createElement('div');
      chTitle.className = 'search-result-chapter';
      chTitle.textContent = r.chapterTitle;
      li.appendChild(chTitle);

      const snippet = document.createElement('div');
      snippet.className = 'search-result-snippet';
      snippet.textContent = r.snippet;
      li.appendChild(snippet);

      li.addEventListener('click', () => {
        hideSearchDrawer();
        onSelect(r);
      });
      searchResults.appendChild(li);
    });
  }

  // Event binding
  let onChapterSelect = null;
  let onSearchSelect = null;

  // Drawer backdrop close
  chapterDrawer.querySelector('.drawer-backdrop')?.addEventListener('click', hideChapterDrawer);
  chapterDrawer.querySelector('.drawer-close')?.addEventListener('click', hideChapterDrawer);

  // Auth drawer events
  authDrawer.querySelector('.drawer-backdrop')?.addEventListener('click', hideAuthDrawer);
  authDrawer.querySelector('.drawer-close')?.addEventListener('click', hideAuthDrawer);
  authToggleBtn?.addEventListener('click', () => setAuthMode(!authIsSignUp));

  // Search drawer events
  searchDrawer.querySelector('.drawer-backdrop')?.addEventListener('click', hideSearchDrawer);
  searchDrawer.querySelector('.drawer-close')?.addEventListener('click', hideSearchDrawer);

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
    // Auth
    showAuthDrawer,
    hideAuthDrawer,
    setAuthMode,
    setAuthState,
    showAuthError,
    // Search
    showSearchDrawer,
    hideSearchDrawer,
    renderSearchResults,
    // Elements for event binding
    fileInput,
    btnBack,
    btnSave,
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
    btnAuth,
    authSubmit,
    authEmail,
    authPassword,
    authSignout,
    authIsSignUp: () => authIsSignUp,
    btnSearch,
    bookSearchInput,
    set onChapterSelect(fn) { onChapterSelect = fn; },
    set onSearchSelect(fn) { onSearchSelect = fn; }
  };
})();

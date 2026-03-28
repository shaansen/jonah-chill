/**
 * Main app orchestrator — wires together parser, TTS, storage, and UI.
 */
const App = (() => {
  let book = null;           // { title, author, chapters: [{ title, text, load() }] }
  let bookId = null;
  let currentChapter = 0;
  let voices = [];
  let autoSaveTimer = null;

  // Chapter word counts for time estimates and book progress
  let chapterWordCounts = [];
  let chapterCharCounts = [];
  let totalChars = 0;

  // Sleep timer state
  let sleepTimerMinutes = 0;
  let sleepTimerEnd = 0;
  let sleepTimerInterval = null;
  let sleepEndOfChapter = false;

  // Silent audio for Media Session
  let silentAudio = null;

  // Web Worker for EPUB parsing
  let epubWorker = null;

  async function init() {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(err =>
        console.warn('SW registration failed:', err)
      );
    }

    // Initialize web worker
    initWorker();

    // Load voices
    voices = await TTSEngine.loadVoices();
    const prefs = Storage.getPrefs();
    UI.populateVoices(voices, prefs.voiceURI);
    if (prefs.rate) UI.setSpeed(prefs.rate);

    // Render library
    refreshLibrary();

    // Wire up events
    bindEvents();
    bindKeyboardShortcuts();
    setupMediaSession();

    // Wire TTS callbacks
    TTSEngine.onChunkStart = (index, text, total) => {
      const chapter = book.chapters[currentChapter];
      UI.highlightCurrentText(chapter.text, text);
      const percent = total > 0 ? Math.round((index / total) * 100) : 0;
      UI.updateProgress(percent, currentChapter + 1, book.chapters.length);
      updateBookProgressBar(percent);
      updateTimeRemainingDisplay();
    };

    TTSEngine.onChunkEnd = (index, total) => {
      if (index % 5 === 0) saveProgress();
    };

    TTSEngine.onFinished = () => {
      // Sleep timer: end-of-chapter mode
      if (sleepEndOfChapter) {
        clearSleepTimer();
        TTSEngine.stop();
        UI.setPlayState(false);
        UI.toast('Sleep timer: paused at end of chapter');
        saveProgress();
        return;
      }

      // Move to next chapter
      if (currentChapter < book.chapters.length - 1) {
        goToChapter(currentChapter + 1, true);
      } else {
        UI.setPlayState(false);
        UI.toast('Finished reading!');
        saveProgress();
      }
    };

    TTSEngine.onStateChange = (state) => {
      UI.setPlayState(state === 'playing');
      updateMediaSessionState(state);
    };
  }

  function initWorker() {
    try {
      epubWorker = new Worker('js/epub-worker.js');
    } catch {
      epubWorker = null;
    }
  }

  function workerRequest(action, data) {
    if (!epubWorker) return Promise.reject(new Error('Worker not available'));
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      const handler = (e) => {
        if (e.data.id === id) {
          epubWorker.removeEventListener('message', handler);
          if (e.data.error) reject(new Error(e.data.error));
          else resolve(e.data.result);
        }
      };
      epubWorker.addEventListener('message', handler);
      epubWorker.postMessage({ id, action, data });
    });
  }

  function bindEvents() {
    // File upload
    UI.fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await loadFile(file);
    });

    // Back button
    UI.btnBack.addEventListener('click', () => {
      TTSEngine.stop();
      saveProgress();
      UI.showView('upload');
      refreshLibrary();
    });

    // Play/Pause
    UI.btnPlay.addEventListener('click', () => {
      if (TTSEngine.isPlaying) {
        TTSEngine.pause();
      } else {
        TTSEngine.play();
      }
    });

    // Previous/Next chapter
    UI.btnPrev.addEventListener('click', () => {
      if (currentChapter > 0) goToChapter(currentChapter - 1);
    });
    UI.btnNext.addEventListener('click', () => {
      if (book && currentChapter < book.chapters.length - 1) goToChapter(currentChapter + 1);
    });

    // Skip forward/back 30s
    UI.btnSkipBack.addEventListener('click', () => skipTime(-30));
    UI.btnSkipForward.addEventListener('click', () => skipTime(30));

    // Chapter drawer
    UI.btnChapters.addEventListener('click', () => {
      if (book) {
        const rate = Storage.getPrefs().rate || 1;
        UI.populateChapterList(book.chapters, currentChapter, chapterWordCounts, rate);
        UI.showChapterDrawer();
      }
    });
    UI.onChapterSelect = (index) => {
      goToChapter(index);
    };

    // Speed slider
    UI.speedSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      UI.setSpeed(val);
      TTSEngine.setRate(val);
      Storage.savePrefs({ rate: val });
      updateTimeRemainingDisplay();
    });

    // Voice selector
    UI.voiceSelect.addEventListener('change', (e) => {
      const voice = voices.find(v => v.voiceURI === e.target.value);
      if (voice) {
        TTSEngine.setVoice(voice);
        Storage.savePrefs({ voiceURI: voice.voiceURI });
      }
    });

    // Progress bar click to seek
    UI.progressBar.addEventListener('click', (e) => {
      if (!book) return;
      const rect = UI.progressBar.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const progress = TTSEngine.getProgress();
      const targetChunk = Math.floor(pct * progress.totalChunks);
      const wasPlaying = TTSEngine.isPlaying;
      TTSEngine.stop();
      TTSEngine.setText(book.chapters[currentChapter].text, targetChunk);
      if (wasPlaying) TTSEngine.play();
    });

    // Sleep timer
    UI.btnSleep.addEventListener('click', (e) => {
      e.stopPropagation();
      UI.sleepMenu.hidden ? UI.showSleepMenu() : UI.hideSleepMenu();
    });

    UI.sleepMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const val = btn.dataset.minutes;
      UI.hideSleepMenu();

      if (val === 'off') {
        clearSleepTimer();
        UI.toast('Sleep timer off');
      } else if (val === 'chapter') {
        clearSleepTimer();
        sleepEndOfChapter = true;
        UI.updateSleepCountdown('Ch');
        UI.toast('Sleep: end of chapter');
      } else {
        const mins = parseInt(val, 10);
        startSleepTimer(mins);
        UI.toast(`Sleep timer: ${mins} minutes`);
      }
    });

    // Close sleep menu on outside click
    document.addEventListener('click', () => {
      UI.hideSleepMenu();
    });

    // Handle visibility change for TTS resume
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && TTSEngine.isPaused && book) {
        UI.toast('Playback paused. Tap play to resume.');
      }
    });
  }

  function bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Skip if user is in an input field
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (!book) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (TTSEngine.isPlaying) TTSEngine.pause();
          else TTSEngine.play();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) {
            skipTime(-30);
          } else if (currentChapter > 0) {
            goToChapter(currentChapter - 1);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) {
            skipTime(30);
          } else if (currentChapter < book.chapters.length - 1) {
            goToChapter(currentChapter + 1);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          adjustSpeed(0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          adjustSpeed(-0.1);
          break;
      }
    });
  }

  function adjustSpeed(delta) {
    const prefs = Storage.getPrefs();
    const current = prefs.rate || 1;
    const newRate = Math.max(0.5, Math.min(3, +(current + delta).toFixed(1)));
    UI.setSpeed(newRate);
    TTSEngine.setRate(newRate);
    Storage.savePrefs({ rate: newRate });
    updateTimeRemainingDisplay();
  }

  function skipTime(seconds) {
    if (!book) return;
    const targetChunk = TTSEngine.skipBySeconds(seconds);
    const wasPlaying = TTSEngine.isPlaying;
    TTSEngine.stop();
    TTSEngine.setText(book.chapters[currentChapter].text, targetChunk);
    if (wasPlaying) TTSEngine.play();
  }

  // --- Media Session API ---

  function setupMediaSession() {
    if (!('mediaSession' in navigator)) return;

    // Create silent audio element as carrier for lock screen controls
    silentAudio = document.createElement('audio');
    silentAudio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    silentAudio.loop = true;
    silentAudio.volume = 0.01;

    navigator.mediaSession.setActionHandler('play', () => TTSEngine.play());
    navigator.mediaSession.setActionHandler('pause', () => TTSEngine.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      if (currentChapter > 0) goToChapter(currentChapter - 1);
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      if (book && currentChapter < book.chapters.length - 1) goToChapter(currentChapter + 1);
    });

    try {
      navigator.mediaSession.setActionHandler('seekbackward', () => skipTime(-30));
      navigator.mediaSession.setActionHandler('seekforward', () => skipTime(30));
    } catch {}
  }

  function updateMediaSessionMetadata() {
    if (!('mediaSession' in navigator) || !book) return;
    const chapter = book.chapters[currentChapter];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: chapter.title,
      artist: book.author,
      album: book.title
    });
  }

  function updateMediaSessionState(state) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = state === 'playing' ? 'playing' : 'paused';

    // Start/stop silent audio to keep media session active
    if (silentAudio) {
      if (state === 'playing') {
        silentAudio.play().catch(() => {});
      } else {
        silentAudio.pause();
      }
    }
  }

  // --- Sleep Timer ---

  function startSleepTimer(minutes) {
    clearSleepTimer();
    sleepTimerMinutes = minutes;
    sleepTimerEnd = Date.now() + minutes * 60 * 1000;
    sleepEndOfChapter = false;

    sleepTimerInterval = setInterval(() => {
      const remaining = Math.max(0, sleepTimerEnd - Date.now());
      const mins = Math.ceil(remaining / 60000);
      UI.updateSleepCountdown(`${mins}m`);

      if (remaining <= 0) {
        clearSleepTimer();
        TTSEngine.pause();
        UI.toast('Sleep timer: paused');
        saveProgress();
      }
    }, 1000);

    UI.updateSleepCountdown(`${minutes}m`);
  }

  function clearSleepTimer() {
    clearInterval(sleepTimerInterval);
    sleepTimerInterval = null;
    sleepTimerEnd = 0;
    sleepTimerMinutes = 0;
    sleepEndOfChapter = false;
    UI.updateSleepCountdown(null);
  }

  // --- Book Progress & Time Estimates ---

  function computeChapterStats() {
    chapterWordCounts = [];
    chapterCharCounts = [];
    totalChars = 0;
    for (const ch of book.chapters) {
      const text = ch.text || '';
      const words = text.split(/\s+/).filter(Boolean).length;
      chapterWordCounts.push(words);
      chapterCharCounts.push(text.length);
      totalChars += text.length;
    }
  }

  function updateBookProgressBar(chapterPercent) {
    if (!book || totalChars === 0) return;
    // Characters read in completed chapters
    let charsRead = 0;
    for (let i = 0; i < currentChapter; i++) {
      charsRead += chapterCharCounts[i];
    }
    // Add fraction of current chapter
    charsRead += (chapterPercent / 100) * (chapterCharCounts[currentChapter] || 0);
    const bookPercent = Math.round((charsRead / totalChars) * 100);
    UI.updateBookProgress(bookPercent);
  }

  function updateTimeRemainingDisplay() {
    if (!book || chapterWordCounts.length === 0) return;
    const rate = Storage.getPrefs().rate || 1;
    const wpm = 150 * rate;

    // Remaining words in current chapter
    const progress = TTSEngine.getProgress();
    const currentWords = chapterWordCounts[currentChapter] || 0;
    const chunkFraction = progress.totalChunks > 0 ? progress.chunkIndex / progress.totalChunks : 0;
    let remainingWords = currentWords * (1 - chunkFraction);

    // Words in remaining chapters
    for (let i = currentChapter + 1; i < book.chapters.length; i++) {
      remainingWords += chapterWordCounts[i];
    }

    const remainingMins = Math.ceil(remainingWords / wpm);
    if (remainingMins >= 60) {
      const hrs = Math.floor(remainingMins / 60);
      const mins = remainingMins % 60;
      UI.updateTimeRemaining(`~${hrs}h ${mins}m left`);
    } else {
      UI.updateTimeRemaining(`~${remainingMins}m left`);
    }
  }

  // --- File Loading ---

  async function loadFile(file) {
    UI.showLoading('Parsing EPUB...');
    UI.setLoading(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      book = await EpubParser.parse(arrayBuffer);
      bookId = Storage.generateBookId(book.title, book.author);

      // Save EPUB data to IndexedDB for later resume
      try {
        await Storage.saveEpubData(bookId, arrayBuffer);
      } catch (err) {
        console.warn('Failed to save EPUB to IndexedDB:', err);
      }

      // Load all chapters (lazy loading — load first + prefetch)
      await loadChapterText(0);

      // Check for saved progress
      const saved = Storage.getBookProgress(bookId);
      currentChapter = saved?.chapter || 0;
      const startChunk = saved?.chunkIndex || 0;

      // Ensure current chapter is loaded
      await loadChapterText(currentChapter);

      openBook(startChunk);

      if (saved) {
        UI.toast(`Resuming: Chapter ${currentChapter + 1}`);
      }
    } catch (err) {
      UI.toast('Error: ' + err.message, 5000);
      console.error('EPUB parse error:', err);
    } finally {
      UI.hideLoading();
      UI.setLoading(false);
      UI.fileInput.value = '';
    }
  }

  async function loadFromIDB(bookEntry) {
    UI.showLoading('Loading from library...');
    UI.setLoading(true);

    try {
      const arrayBuffer = await Storage.getEpubData(bookEntry.id);
      if (!arrayBuffer) {
        UI.toast('EPUB data not found. Please re-upload the file.');
        return;
      }

      book = await EpubParser.parse(arrayBuffer);
      bookId = bookEntry.id;

      currentChapter = bookEntry.chapter || 0;
      const startChunk = bookEntry.chunkIndex || 0;

      await loadChapterText(currentChapter);

      openBook(startChunk);
      UI.toast(`Resuming: Chapter ${currentChapter + 1}`);
    } catch (err) {
      UI.toast('Error: ' + err.message, 5000);
      console.error('EPUB load error:', err);
    } finally {
      UI.hideLoading();
      UI.setLoading(false);
    }
  }

  async function loadChapterText(index) {
    if (!book || index < 0 || index >= book.chapters.length) return;
    const ch = book.chapters[index];
    if (ch.text) return; // Already loaded
    await ch.load();

    // Prefetch next chapter
    if (index + 1 < book.chapters.length && !book.chapters[index + 1].text) {
      book.chapters[index + 1].load().catch(() => {});
    }
  }

  function openBook(startChunk = 0) {
    UI.setBookInfo(book.title, book.author);
    UI.showView('player');

    // Compute stats once we start loading chapters
    loadAllChapterTextsInBackground().then(() => {
      computeChapterStats();
      updateTimeRemainingDisplay();
    });

    goToChapter(currentChapter, false, startChunk);

    // Apply saved preferences
    const prefs = Storage.getPrefs();
    if (prefs.rate) {
      TTSEngine.setRate(prefs.rate);
      UI.setSpeed(prefs.rate);
    }
    if (prefs.voiceURI) {
      const voice = voices.find(v => v.voiceURI === prefs.voiceURI);
      if (voice) TTSEngine.setVoice(voice);
    }

    // Update media session
    updateMediaSessionMetadata();

    saveProgress();
  }

  async function loadAllChapterTextsInBackground() {
    if (!book) return;
    for (let i = 0; i < book.chapters.length; i++) {
      if (!book.chapters[i].text) {
        try { await book.chapters[i].load(); } catch {}
      }
    }
  }

  async function goToChapter(index, autoPlay = false, startChunk = 0) {
    if (!book || index < 0 || index >= book.chapters.length) return;

    const wasPlaying = TTSEngine.isPlaying || autoPlay;
    TTSEngine.stop();

    currentChapter = index;

    // Ensure chapter text is loaded
    await loadChapterText(index);

    const chapter = book.chapters[currentChapter];
    const text = chapter.text || '';

    UI.setChapterTitle(chapter.title);
    UI.setCurrentText(text.substring(0, 300) + (text.length > 300 ? '...' : ''));
    UI.updateProgress(0, currentChapter + 1, book.chapters.length);
    updateBookProgressBar(0);
    updateTimeRemainingDisplay();

    TTSEngine.setText(text, startChunk);

    if (wasPlaying) {
      TTSEngine.play();
    }

    updateMediaSessionMetadata();
    saveProgress();
  }

  function saveProgress() {
    if (!book || !bookId) return;
    const progress = TTSEngine.getProgress();
    Storage.saveBookProgress(bookId, {
      title: book.title,
      author: book.author,
      chapter: currentChapter,
      chunkIndex: progress.chunkIndex,
      totalChapters: book.chapters.length
    });
  }

  function refreshLibrary() {
    const books = Storage.getLibrary();
    UI.renderLibrary(
      books,
      // On resume: try loading from IDB
      (bookEntry) => {
        loadFromIDB(bookEntry);
      },
      // On delete
      (id) => {
        Storage.removeBook(id);
        Storage.removeEpubData(id).catch(() => {});
        refreshLibrary();
      }
    );
  }

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init };
})();

/**
 * Main app orchestrator — wires together parser, TTS, storage, and UI.
 */
const App = (() => {
  let book = null;           // { title, author, chapters: [{ title, text }] }
  let bookId = null;
  let currentChapter = 0;
  let voices = [];
  let autoSaveTimer = null;

  async function init() {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(err =>
        console.warn('SW registration failed:', err)
      );
    }

    // Load voices
    voices = await TTSEngine.loadVoices();
    const prefs = Storage.getPrefs();
    UI.populateVoices(voices, prefs.voiceURI);
    if (prefs.rate) UI.setSpeed(prefs.rate);

    // Render library
    refreshLibrary();

    // Wire up events
    bindEvents();

    // Wire TTS callbacks
    TTSEngine.onChunkStart = (index, text, total) => {
      const chapter = book.chapters[currentChapter];
      UI.highlightCurrentText(chapter.text, text);
      const percent = total > 0 ? Math.round((index / total) * 100) : 0;
      UI.updateProgress(percent, currentChapter + 1, book.chapters.length);
    };

    TTSEngine.onChunkEnd = (index, total) => {
      // Auto-save periodically
      if (index % 5 === 0) saveProgress();
    };

    TTSEngine.onFinished = () => {
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
    };
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

    // Chapter drawer
    UI.btnChapters.addEventListener('click', () => {
      if (book) {
        UI.populateChapterList(book.chapters, currentChapter);
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

    // Handle visibility change for TTS resume
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && TTSEngine.isPaused && book) {
        UI.toast('Playback paused. Tap play to resume.');
      }
    });
  }

  async function loadFile(file) {
    UI.setLoading(true);
    UI.toast('Parsing EPUB...');

    try {
      const arrayBuffer = await file.arrayBuffer();
      book = await EpubParser.parse(arrayBuffer);
      bookId = Storage.generateBookId(book.title, book.author);

      // Check for saved progress
      const saved = Storage.getBookProgress(bookId);
      currentChapter = saved?.chapter || 0;
      const startChunk = saved?.chunkIndex || 0;

      openBook(startChunk);

      if (saved) {
        UI.toast(`Resuming: Chapter ${currentChapter + 1}`);
      }
    } catch (err) {
      UI.toast('Error: ' + err.message, 5000);
      console.error('EPUB parse error:', err);
    } finally {
      UI.setLoading(false);
      UI.fileInput.value = '';
    }
  }

  function openBook(startChunk = 0) {
    UI.setBookInfo(book.title, book.author);
    UI.showView('player');
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

    // Save to library
    saveProgress();
  }

  function goToChapter(index, autoPlay = false, startChunk = 0) {
    if (!book || index < 0 || index >= book.chapters.length) return;

    const wasPlaying = TTSEngine.isPlaying || autoPlay;
    TTSEngine.stop();

    currentChapter = index;
    const chapter = book.chapters[currentChapter];

    UI.setChapterTitle(chapter.title);
    UI.setCurrentText(chapter.text.substring(0, 300) + (chapter.text.length > 300 ? '...' : ''));
    UI.updateProgress(0, currentChapter + 1, book.chapters.length);

    TTSEngine.setText(chapter.text, startChunk);

    if (wasPlaying) {
      TTSEngine.play();
    }

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
      // On resume: user must re-upload the file (we don't store EPUB data)
      (bookEntry) => {
        UI.toast('Please upload the EPUB file to resume reading');
      },
      // On delete
      (id) => {
        Storage.removeBook(id);
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

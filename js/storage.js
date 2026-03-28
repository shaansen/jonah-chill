/**
 * localStorage persistence for bookmarks, preferences, and library.
 */
const Storage = (() => {
  const LIBRARY_KEY = 'epub-reader-library';
  const PREFS_KEY = 'epub-reader-prefs';

  function getLibrary() {
    try {
      return JSON.parse(localStorage.getItem(LIBRARY_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveLibrary(library) {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
  }

  /**
   * Save or update a book entry in the library.
   * Each book is identified by a hash of its title+author.
   */
  function saveBookProgress(bookId, data) {
    const library = getLibrary();
    const idx = library.findIndex(b => b.id === bookId);
    const entry = {
      id: bookId,
      title: data.title || 'Unknown',
      author: data.author || 'Unknown',
      chapter: data.chapter ?? 0,
      chunkIndex: data.chunkIndex ?? 0,
      totalChapters: data.totalChapters ?? 1,
      lastRead: Date.now()
    };
    if (idx >= 0) {
      library[idx] = { ...library[idx], ...entry };
    } else {
      library.push(entry);
    }
    saveLibrary(library);
  }

  function getBookProgress(bookId) {
    const library = getLibrary();
    return library.find(b => b.id === bookId) || null;
  }

  function removeBook(bookId) {
    const library = getLibrary().filter(b => b.id !== bookId);
    saveLibrary(library);
  }

  function getPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    } catch {
      return {};
    }
  }

  function savePrefs(prefs) {
    const existing = getPrefs();
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...existing, ...prefs }));
  }

  /**
   * Generate a simple hash ID from title + author.
   */
  function generateBookId(title, author) {
    const str = `${title}::${author}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return 'book_' + Math.abs(hash).toString(36);
  }

  return {
    getLibrary,
    saveBookProgress,
    getBookProgress,
    removeBook,
    getPrefs,
    savePrefs,
    generateBookId
  };
})();

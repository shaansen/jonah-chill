/**
 * localStorage persistence for bookmarks, preferences, and library.
 * IndexedDB persistence for EPUB file data.
 */
const Storage = (() => {
  const LIBRARY_KEY = 'epub-reader-library';
  const PREFS_KEY = 'epub-reader-prefs';
  const IDB_NAME = 'epub-reader-db';
  const IDB_VERSION = 1;
  const IDB_STORE = 'epubs';

  // --- IndexedDB ---

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveEpubData(bookId, arrayBuffer) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(arrayBuffer, bookId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getEpubData(bookId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(bookId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function removeEpubData(bookId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(bookId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- localStorage ---

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
    generateBookId,
    openDB,
    saveEpubData,
    getEpubData,
    removeEpubData
  };
})();

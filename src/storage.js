/**
 * localStorage persistence for preferences.
 * IndexedDB persistence for EPUB file data and library metadata.
 * Uses singleton IDB connection pool.
 */

const PREFS_KEY = 'epub-reader-prefs';
const IDB_NAME = 'epub-reader-db';
const IDB_VERSION = 2;
const IDB_STORE = 'epubs';
const IDB_LIBRARY_STORE = 'library';

// --- IDB Connection Pool (singleton) ---

let dbInstance = null;
let dbPromise = null;

function getDB() {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
      if (!db.objectStoreNames.contains(IDB_LIBRARY_STORE)) {
        db.createObjectStore(IDB_LIBRARY_STORE, { keyPath: 'id' });
      }
      // Migrate localStorage library to IDB on upgrade
      if (event.oldVersion < 2) {
        try {
          const existing = JSON.parse(localStorage.getItem('epub-reader-library')) || [];
          if (existing.length > 0) {
            const tx = req.transaction;
            const store = tx.objectStore(IDB_LIBRARY_STORE);
            existing.forEach(entry => store.put(entry));
          }
        } catch { /* ignore migration errors */ }
      }
    };
    req.onsuccess = () => {
      dbInstance = req.result;
      dbInstance.onclose = () => {
        dbInstance = null;
        dbPromise = null;
      };
      resolve(dbInstance);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

// --- EPUB Data (IndexedDB) ---

export async function saveEpubData(bookId, arrayBuffer) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(arrayBuffer, bookId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getEpubData(bookId) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(bookId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function removeEpubData(bookId) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(bookId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Library (IndexedDB) ---

export async function getLibrary() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_LIBRARY_STORE, 'readonly');
    const req = tx.objectStore(IDB_LIBRARY_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function saveBookProgress(bookId, data) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_LIBRARY_STORE, 'readwrite');
    const store = tx.objectStore(IDB_LIBRARY_STORE);
    const getReq = store.get(bookId);
    getReq.onsuccess = () => {
      const existing = getReq.result || {};
      const entry = {
        ...existing,
        id: bookId,
        title: data.title || 'Unknown',
        author: data.author || 'Unknown',
        chapter: data.chapter ?? 0,
        chunkIndex: data.chunkIndex ?? 0,
        totalChapters: data.totalChapters ?? 1,
        lastRead: Date.now(),
      };
      store.put(entry);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getBookProgress(bookId) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_LIBRARY_STORE, 'readonly');
    const req = tx.objectStore(IDB_LIBRARY_STORE).get(bookId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function removeBook(bookId) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_LIBRARY_STORE, 'readwrite');
    tx.objectStore(IDB_LIBRARY_STORE).delete(bookId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Preferences (localStorage) ---

export function getPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
}

export function savePrefs(prefs) {
  const existing = getPrefs();
  localStorage.setItem(PREFS_KEY, JSON.stringify({ ...existing, ...prefs }));
}

export function generateBookId(title, author) {
  const str = `${title}::${author}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return 'book_' + Math.abs(hash).toString(36);
}

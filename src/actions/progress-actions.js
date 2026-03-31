/**
 * Progress actions — save/load progress, library management, time estimates.
 */
import { getState, setState } from '../store.js';
import * as Storage from '../storage.js';
import * as SupabaseSync from '../supabase-sync.js';
import * as PlaybackController from '../playback/playback-controller.js';
import * as UI from '../ui/ui.js';
import * as LibraryUI from '../ui/library-ui.js';
import { loadFromIDB } from './book-actions.js';

export function saveProgress(showToast = false) {
  const state = getState();
  const { book, bookId } = state;
  if (!book || !bookId) return;

  const progress = PlaybackController.getProgress();
  const data = {
    title: book.title,
    author: book.author,
    chapter: state.currentChapter,
    chunkIndex: progress.chunkIndex,
    totalChapters: book.chapters.length,
  };

  Storage.saveBookProgress(bookId, data).then(() => {
    if (showToast) UI.toast('Progress saved');
    SupabaseSync.pushProgress(bookId, { ...data, lastRead: Date.now() });
  }).catch(err => {
    console.warn('Failed to save progress:', err);
    if (showToast) UI.toast('Failed to save progress');
  });
}

export function computeChapterStats() {
  const state = getState();
  const book = state.book;
  if (!book) return;

  const chapterWordCounts = [];
  const chapterCharCounts = [];
  let totalChars = 0;
  for (const ch of book.chapters) {
    const text = ch.text || '';
    const words = text.split(/\s+/).filter(Boolean).length;
    chapterWordCounts.push(words);
    chapterCharCounts.push(text.length);
    totalChars += text.length;
  }
  setState({ chapterWordCounts, chapterCharCounts, totalChars });
}

export function updateBookProgressBar(chapterPercent) {
  const state = getState();
  if (!state.book || state.totalChars === 0) return;

  let charsRead = 0;
  for (let i = 0; i < state.currentChapter; i++) {
    charsRead += state.chapterCharCounts[i];
  }
  charsRead += (chapterPercent / 100) * (state.chapterCharCounts[state.currentChapter] || 0);
  const bookPercent = Math.round((charsRead / state.totalChars) * 100);
  UI.updateBookProgress(bookPercent);
}

export function updateTimeRemainingDisplay() {
  const state = getState();
  if (!state.book || state.chapterWordCounts.length === 0) return;

  const rate = state.speed || Storage.getPrefs().rate || 1;
  const wpm = 150 * rate;

  const progress = PlaybackController.getProgress();
  const currentWords = state.chapterWordCounts[state.currentChapter] || 0;
  const chunkFraction = progress.totalChunks > 0 ? progress.chunkIndex / progress.totalChunks : 0;
  let remainingWords = currentWords * (1 - chunkFraction);

  for (let i = state.currentChapter + 1; i < state.book.chapters.length; i++) {
    remainingWords += state.chapterWordCounts[i];
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

export async function refreshLibrary() {
  const books = await Storage.getLibrary();

  const validBooks = [];
  for (const b of books) {
    try {
      const data = await Storage.getEpubData(b.id);
      if (data) {
        validBooks.push(b);
      } else {
        await Storage.removeBook(b.id);
      }
    } catch {
      validBooks.push(b);
    }
  }

  LibraryUI.renderLibrary(
    validBooks,
    (bookEntry) => loadFromIDB(bookEntry),
    async (id) => {
      await Storage.removeBook(id);
      Storage.removeEpubData(id).catch(() => {});
      refreshLibrary();
    }
  );
}

export async function mergeRemoteProgress() {
  try {
    const remote = await SupabaseSync.pullAllProgress();
    if (!remote || remote.length === 0) return;
    for (const r of remote) {
      const local = await Storage.getBookProgress(r.id);
      if (!local || (r.lastRead && r.lastRead > (local.lastRead || 0))) {
        await Storage.saveBookProgress(r.id, {
          title: r.title,
          author: r.author,
          chapter: r.chapter,
          chunkIndex: r.chunkIndex,
          totalChapters: r.totalChapters,
        });
      }
    }
    refreshLibrary();
  } catch (err) {
    console.warn('mergeRemoteProgress failed:', err);
  }
}

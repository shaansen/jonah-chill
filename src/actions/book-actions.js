/**
 * Book actions — loading, chapter navigation, searching.
 */
import { getState, setState } from '../store.js';
import * as Storage from '../storage.js';
import * as EpubParser from '../epub-parser.js';
import * as SupabaseSync from '../supabase-sync.js';
import * as PlaybackController from '../playback/playback-controller.js';
import * as AudioManager from '../playback/audio-manager.js';
import * as UI from '../ui/ui.js';
import { splitIntoChunks } from '../tts/text-chunker.js';
import { saveProgress, computeChapterStats, updateBookProgressBar, updateTimeRemainingDisplay } from './progress-actions.js';

export async function loadFile(file) {
  UI.showLoading('Parsing EPUB...');
  UI.setLoading(true);

  try {
    const arrayBuffer = await file.arrayBuffer();
    const book = await EpubParser.parse(arrayBuffer);
    const bookId = Storage.generateBookId(book.title, book.author);
    setState({ book, bookId });

    try {
      await Storage.saveEpubData(bookId, arrayBuffer);
    } catch (err) {
      console.warn('Failed to save EPUB to IndexedDB:', err);
    }

    // Check for saved progress (local + remote merge)
    let saved = await Storage.getBookProgress(bookId);
    try {
      const remote = await SupabaseSync.pullProgress(bookId);
      if (remote && remote.lastRead && (!saved || remote.lastRead > (saved.lastRead || 0))) {
        saved = remote;
      }
    } catch { /* ignore */ }

    await loadChapterText(book, 0);

    const currentChapter = saved?.chapter || 0;
    const startChunk = saved?.chunkIndex || 0;
    setState({ currentChapter });

    await loadChapterText(book, currentChapter);
    openBook(book, bookId, startChunk);

    if (saved) {
      UI.toast(`Resuming: Chapter ${currentChapter + 1}`);
    }
  } catch (err) {
    UI.toast('Error: ' + err.message, 5000);
    console.error('EPUB parse error:', err);
  } finally {
    UI.hideLoading();
    UI.setLoading(false);
  }
}

export async function loadFromIDB(bookEntry) {
  UI.showLoading('Loading from library...');
  UI.setLoading(true);

  try {
    const arrayBuffer = await Storage.getEpubData(bookEntry.id);
    if (!arrayBuffer) {
      UI.toast('EPUB data not found. Please upload the file again.');
      return;
    }

    const book = await EpubParser.parse(arrayBuffer);
    const bookId = bookEntry.id;
    setState({ book, bookId });

    let saved = bookEntry;
    try {
      const remote = await SupabaseSync.pullProgress(bookId);
      if (remote && remote.lastRead && remote.lastRead > (saved.lastRead || 0)) {
        saved = remote;
      }
    } catch { /* ignore */ }

    const currentChapter = saved.chapter || 0;
    const startChunk = saved.chunkIndex || 0;
    setState({ currentChapter });

    await loadChapterText(book, currentChapter);
    openBook(book, bookId, startChunk);
    UI.toast(`Resuming: Chapter ${currentChapter + 1}`);
  } catch (err) {
    UI.toast('Error: ' + err.message, 5000);
    console.error('EPUB load error:', err);
  } finally {
    UI.hideLoading();
    UI.setLoading(false);
  }
}

export async function loadChapterText(book, index) {
  if (!book || index < 0 || index >= book.chapters.length) return;
  const ch = book.chapters[index];
  if (ch.text) return;
  await ch.load();

  // Prefetch next chapter
  if (index + 1 < book.chapters.length && !book.chapters[index + 1].text) {
    book.chapters[index + 1].load().catch(() => {});
  }
}

export function openBook(book, bookId, startChunk = 0) {
  const state = getState();
  UI.setBookInfo(book.title, book.author);
  UI.showView('player');
  setState({ activeView: 'player' });

  loadAllChapterTextsInBackground(book).then(() => {
    computeChapterStats();
    updateTimeRemainingDisplay();
  });

  goToChapter(state.currentChapter, false, startChunk);

  const prefs = Storage.getPrefs();
  if (prefs.rate) {
    PlaybackController.setRate(prefs.rate);
    UI.setSpeed(prefs.rate);
    setState({ speed: prefs.rate });
  }
  if (prefs.voiceURI) {
    PlaybackController.setVoice(prefs.voiceURI);
    setState({ selectedVoiceId: prefs.voiceURI });
  }

  AudioManager.updateMediaSessionMetadata(
    book.chapters[state.currentChapter]?.title || book.title,
    book.author,
    book.title
  );

  saveProgress();
}

async function loadAllChapterTextsInBackground(book) {
  if (!book) return;
  for (let i = 0; i < book.chapters.length; i++) {
    if (!book.chapters[i].text) {
      try { await book.chapters[i].load(); } catch { /* ignore */ }
    }
  }
}

export async function goToChapter(index, autoPlay = false, startChunk = 0) {
  const state = getState();
  const book = state.book;
  if (!book || index < 0 || index >= book.chapters.length) return;

  const wasPlaying = PlaybackController.getIsPlaying() || autoPlay;
  PlaybackController.stop();

  setState({ currentChapter: index });

  await loadChapterText(book, index);

  const chapter = book.chapters[index];
  const text = chapter.text || '';

  UI.setChapterTitle(chapter.title);
  UI.setCurrentText(text.substring(0, 300) + (text.length > 300 ? '...' : ''));
  UI.updateProgress(0, index + 1, book.chapters.length);
  updateBookProgressBar(0);
  updateTimeRemainingDisplay();

  PlaybackController.setText(text, startChunk);

  if (wasPlaying) {
    PlaybackController.play();
  }

  AudioManager.updateMediaSessionMetadata(chapter.title, book.author, book.title);
  saveProgress();
}

// --- Search ---

export async function searchBook(query) {
  const state = getState();
  const book = state.book;
  if (!book || !query || query.length < 2) return [];
  const q = query.toLowerCase();
  const results = [];
  const maxResults = 50;

  for (let ci = 0; ci < book.chapters.length; ci++) {
    if (results.length >= maxResults) break;
    await loadChapterText(book, ci);
    const ch = book.chapters[ci];
    const text = ch.text || '';
    const lower = text.toLowerCase();
    let pos = 0;
    while (pos < lower.length && results.length < maxResults) {
      const idx = lower.indexOf(q, pos);
      if (idx === -1) break;
      const snippetStart = Math.max(0, idx - 40);
      const snippetEnd = Math.min(text.length, idx + query.length + 40);
      const snippet = (snippetStart > 0 ? '...' : '') +
        text.substring(snippetStart, snippetEnd) +
        (snippetEnd < text.length ? '...' : '');
      results.push({
        chapterIndex: ci,
        chapterTitle: ch.title,
        snippet,
        charOffset: idx,
      });
      pos = idx + query.length;
    }
  }
  return results;
}

export function findChunkForOffset(text, charOffset) {
  const chunks = splitIntoChunks(text);
  if (!chunks || chunks.length === 0) return 0;

  let searchPos = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunkStart = text.indexOf(chunks[i], searchPos);
    if (chunkStart === -1) continue;
    const chunkEnd = chunkStart + chunks[i].length;
    if (charOffset < chunkEnd) return i;
    searchPos = chunkEnd;
  }
  return chunks.length - 1;
}

/**
 * Drawer UI — chapter, search, and auth drawers.
 */

// --- Chapter Drawer ---
const chapterDrawer = document.getElementById('chapter-drawer');
const chapterList = document.getElementById('chapter-list');
const chapterSearch = document.getElementById('chapter-search');
const btnChapters = document.getElementById('btn-chapters');

let onChapterSelectFn = null;

export function bindChapterDrawer({ onChapterSelect, getBook, getCurrentChapter, getChapterWordCounts, getRate }) {
  onChapterSelectFn = onChapterSelect;

  btnChapters.addEventListener('click', () => {
    const book = getBook();
    if (book) {
      populateChapterList(book.chapters, getCurrentChapter(), getChapterWordCounts(), getRate());
      showChapterDrawer();
    }
  });

  chapterDrawer.querySelector('.drawer-backdrop')?.addEventListener('click', hideChapterDrawer);
  chapterDrawer.querySelector('.drawer-close')?.addEventListener('click', hideChapterDrawer);

  if (chapterSearch) {
    chapterSearch.addEventListener('input', (e) => filterChapters(e.target.value));
  }
}

function populateChapterList(chapters, activeIndex, chapterWordCounts, rate) {
  chapterList.innerHTML = '';
  chapters.forEach((ch, i) => {
    const li = document.createElement('li');
    li.dataset.index = i;
    const titleSpan = document.createElement('span');
    titleSpan.textContent = ch.title;
    li.appendChild(titleSpan);

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
      onChapterSelectFn?.(i);
    });
    chapterList.appendChild(li);
  });

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

// --- Auth Drawer ---
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

export function bindAuthDrawer({ onSignIn, onSignUp, onSignOut }) {
  btnAuth.addEventListener('click', showAuthDrawer);

  authDrawer.querySelector('.drawer-backdrop')?.addEventListener('click', hideAuthDrawer);
  authDrawer.querySelector('.drawer-close')?.addEventListener('click', hideAuthDrawer);

  authToggleBtn?.addEventListener('click', () => setAuthMode(!authIsSignUp));

  authSubmit.addEventListener('click', async () => {
    const email = authEmail.value.trim();
    const pw = authPassword.value;
    if (!email || !pw) {
      showAuthError('Please enter email and password');
      return;
    }
    try {
      if (authIsSignUp) {
        await onSignUp(email, pw);
      } else {
        await onSignIn(email, pw);
        hideAuthDrawer();
      }
    } catch (err) {
      showAuthError(err.message || 'Auth failed');
    }
  });

  authSignout.addEventListener('click', async () => {
    await onSignOut();
    hideAuthDrawer();
  });
}

function showAuthDrawer() {
  authDrawer.hidden = false;
  authError.hidden = true;
  authEmail.value = '';
  authPassword.value = '';
}

export function hideAuthDrawer() {
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

export function setAuthState(user) {
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
const btnSearch = document.getElementById('btn-search');
const searchDrawer = document.getElementById('search-drawer');
const bookSearchInput = document.getElementById('book-search-input');
const searchResults = document.getElementById('search-results');
const searchStatus = document.getElementById('search-status');

let searchDebounce = null;

export function bindSearchDrawer({ onSearch, onResultSelect }) {
  btnSearch.addEventListener('click', showSearchDrawer);

  searchDrawer.querySelector('.drawer-backdrop')?.addEventListener('click', hideSearchDrawer);
  searchDrawer.querySelector('.drawer-close')?.addEventListener('click', hideSearchDrawer);

  bookSearchInput.addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const query = e.target.value.trim();
    if (query.length < 2) {
      renderSearchResults([], () => {});
      return;
    }
    searchDebounce = setTimeout(async () => {
      const results = await onSearch(query);
      renderSearchResults(results, onResultSelect);
    }, 300);
  });
}

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

  results.forEach((r) => {
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

// --- Sleep Timer UI ---
const btnSleep = document.getElementById('btn-sleep');
const sleepMenu = document.getElementById('sleep-menu');
const sleepCountdown = document.getElementById('sleep-countdown');

export function bindSleepTimer({ onTimerSet, onEndOfChapter, onTimerOff }) {
  btnSleep.addEventListener('click', (e) => {
    e.stopPropagation();
    sleepMenu.hidden = !sleepMenu.hidden;
  });

  sleepMenu.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const val = btn.dataset.minutes;
    sleepMenu.hidden = true;

    if (val === 'off') {
      onTimerOff();
    } else if (val === 'chapter') {
      onEndOfChapter();
    } else {
      onTimerSet(parseInt(val, 10));
    }
  });

  document.addEventListener('click', () => {
    sleepMenu.hidden = true;
  });
}

export function updateSleepCountdown(text) {
  if (text) {
    sleepCountdown.textContent = text;
    sleepCountdown.hidden = false;
    btnSleep.classList.add('active');
  } else {
    sleepCountdown.hidden = true;
    btnSleep.classList.remove('active');
  }
}

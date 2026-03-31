/**
 * Library UI — upload view + library rendering.
 */

const fileInput = document.getElementById('file-input');
const librarySection = document.getElementById('library-section');
const libraryList = document.getElementById('library-list');

export function bindEvents({ onFileUpload }) {
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await onFileUpload(file);
    fileInput.value = '';
  });
}

export function renderLibrary(books, onResume, onDelete) {
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

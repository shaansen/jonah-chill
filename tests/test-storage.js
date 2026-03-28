/**
 * Tests for Storage module.
 */
(() => {
  const { describe, beforeEach, it, assert } = TestRunner;

  describe('Storage — generateBookId', () => {

    it('should generate consistent IDs for same input', () => {
      const id1 = Storage.generateBookId('My Book', 'Author');
      const id2 = Storage.generateBookId('My Book', 'Author');
      assert.equal(id1, id2);
    });

    it('should generate different IDs for different input', () => {
      const id1 = Storage.generateBookId('Book A', 'Author A');
      const id2 = Storage.generateBookId('Book B', 'Author B');
      assert.ok(id1 !== id2, 'IDs should be different');
    });

    it('should start with "book_" prefix', () => {
      const id = Storage.generateBookId('Test', 'Author');
      assert.ok(id.startsWith('book_'));
    });

  });

  describe('Storage — Book Progress', () => {

    beforeEach(() => {
      // Clear test data
      localStorage.removeItem('epub-reader-library');
    });

    it('should save and retrieve book progress', () => {
      Storage.saveBookProgress('test_1', {
        title: 'Test Book',
        author: 'Author',
        chapter: 3,
        chunkIndex: 10,
        totalChapters: 20
      });
      const saved = Storage.getBookProgress('test_1');
      assert.ok(saved);
      assert.equal(saved.title, 'Test Book');
      assert.equal(saved.chapter, 3);
      assert.equal(saved.chunkIndex, 10);
      assert.equal(saved.totalChapters, 20);
    });

    it('should update existing book progress', () => {
      Storage.saveBookProgress('test_2', {
        title: 'Book', author: 'A', chapter: 0, chunkIndex: 0, totalChapters: 5
      });
      Storage.saveBookProgress('test_2', {
        title: 'Book', author: 'A', chapter: 2, chunkIndex: 15, totalChapters: 5
      });
      const saved = Storage.getBookProgress('test_2');
      assert.equal(saved.chapter, 2);
      assert.equal(saved.chunkIndex, 15);
    });

    it('should remove book from library', () => {
      Storage.saveBookProgress('test_3', {
        title: 'Temp', author: 'A', chapter: 0, chunkIndex: 0, totalChapters: 1
      });
      assert.ok(Storage.getBookProgress('test_3'));
      Storage.removeBook('test_3');
      assert.equal(Storage.getBookProgress('test_3'), null);
    });

    it('should return null for unknown book', () => {
      const result = Storage.getBookProgress('nonexistent_book_id');
      assert.equal(result, null);
    });

  });

  describe('Storage — Preferences', () => {

    beforeEach(() => {
      localStorage.removeItem('epub-reader-prefs');
    });

    it('should save and retrieve preferences', () => {
      Storage.savePrefs({ rate: 1.5 });
      const prefs = Storage.getPrefs();
      assert.equal(prefs.rate, 1.5);
    });

    it('should merge preferences (not overwrite)', () => {
      Storage.savePrefs({ rate: 1.5 });
      Storage.savePrefs({ voiceURI: 'test-voice' });
      const prefs = Storage.getPrefs();
      assert.equal(prefs.rate, 1.5);
      assert.equal(prefs.voiceURI, 'test-voice');
    });

    it('should return empty object for no prefs', () => {
      const prefs = Storage.getPrefs();
      assert.deepEqual(prefs, {});
    });

  });

  describe('Storage — IndexedDB', () => {

    it('should open database successfully', async () => {
      const db = await Storage.openDB();
      assert.ok(db);
      assert.ok(db.objectStoreNames.contains('epubs'));
      db.close();
    });

    it('should store and retrieve EPUB data', async () => {
      const testData = new ArrayBuffer(16);
      const view = new Uint8Array(testData);
      view[0] = 42;
      view[1] = 99;

      await Storage.saveEpubData('idb_test_1', testData);
      const retrieved = await Storage.getEpubData('idb_test_1');
      assert.ok(retrieved);
      const rView = new Uint8Array(retrieved);
      assert.equal(rView[0], 42);
      assert.equal(rView[1], 99);

      // Cleanup
      await Storage.removeEpubData('idb_test_1');
    });

    it('should return null for nonexistent IDB key', async () => {
      const result = await Storage.getEpubData('idb_nonexistent');
      assert.equal(result, null);
    });

    it('should remove EPUB data from IDB', async () => {
      const testData = new ArrayBuffer(8);
      await Storage.saveEpubData('idb_test_2', testData);
      await Storage.removeEpubData('idb_test_2');
      const result = await Storage.getEpubData('idb_test_2');
      assert.equal(result, null);
    });

  });

})();

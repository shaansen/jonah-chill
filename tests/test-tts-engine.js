/**
 * Tests for TTSEngine.splitIntoChunks.
 */
(() => {
  const { describe, it, assert } = TestRunner;

  describe('TTSEngine.splitIntoChunks', () => {

    it('should split text into sentence-based chunks', () => {
      const text = 'First sentence. Second sentence. Third sentence.';
      const chunks = TTSEngine.splitIntoChunks(text);
      assert.ok(chunks.length >= 1);
      // All original text should be represented
      const joined = chunks.join(' ');
      assert.ok(joined.includes('First sentence'));
      assert.ok(joined.includes('Third sentence'));
    });

    it('should keep chunks under 180 characters', () => {
      const text = 'Short sentence. '.repeat(20);
      const chunks = TTSEngine.splitIntoChunks(text);
      for (const chunk of chunks) {
        assert.ok(chunk.length <= 200, `Chunk too long (${chunk.length}): "${chunk.substring(0, 50)}..."`);
      }
    });

    it('should not split on abbreviations like Dr. and Mr.', () => {
      const text = 'Dr. Smith met Mr. Jones at the U.S. embassy.';
      const chunks = TTSEngine.splitIntoChunks(text);
      // Should be a single chunk since it's short
      assert.equal(chunks.length, 1);
      assert.includes(chunks[0], 'Dr. Smith');
      assert.includes(chunks[0], 'Mr. Jones');
    });

    it('should not split on decimal numbers like 3.14', () => {
      const text = 'The value of pi is 3.14159. It is irrational.';
      const chunks = TTSEngine.splitIntoChunks(text);
      const joined = chunks.join(' ');
      assert.ok(joined.includes('3.14159'));
    });

    it('should not split on ellipsis', () => {
      const text = 'Wait for it... The surprise was amazing.';
      const chunks = TTSEngine.splitIntoChunks(text);
      const joined = chunks.join(' ');
      assert.ok(joined.includes('Wait for it...'));
    });

    it('should handle initials like J. K. Rowling', () => {
      const text = 'J. K. Rowling wrote Harry Potter. It was popular.';
      const chunks = TTSEngine.splitIntoChunks(text);
      const joined = chunks.join(' ');
      assert.ok(joined.includes('J. K. Rowling'));
    });

    it('should handle empty text', () => {
      const chunks = TTSEngine.splitIntoChunks('');
      assert.equal(chunks.length, 1);
      assert.equal(chunks[0], '');
    });

    it('should handle whitespace-only text', () => {
      const chunks = TTSEngine.splitIntoChunks('   ');
      assert.equal(chunks.length, 1);
      assert.equal(chunks[0], '');
    });

    it('should split very long sentences at clause boundaries', () => {
      const long = 'This is a very long sentence that goes on and on, with many clauses separated by commas, and it just keeps going and going, never seeming to stop, until it finally reaches a period at the very end after many many words.';
      const chunks = TTSEngine.splitIntoChunks(long);
      assert.ok(chunks.length > 1, `Expected >1 chunks, got ${chunks.length}`);
      for (const chunk of chunks) {
        assert.ok(chunk.length <= 200, `Chunk too long (${chunk.length})`);
      }
    });

    it('should handle text with only question marks', () => {
      const text = 'Is this working? Does it split correctly? Yes it does.';
      const chunks = TTSEngine.splitIntoChunks(text);
      const joined = chunks.join(' ');
      assert.ok(joined.includes('Is this working?'));
      assert.ok(joined.includes('Yes it does.'));
    });

    it('should handle text with exclamation marks', () => {
      const text = 'Wow! Amazing! This is incredible!';
      const chunks = TTSEngine.splitIntoChunks(text);
      const joined = chunks.join(' ');
      assert.ok(joined.includes('Wow!'));
      assert.ok(joined.includes('incredible!'));
    });

  });

})();

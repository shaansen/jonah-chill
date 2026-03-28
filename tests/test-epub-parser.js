/**
 * Tests for EpubParser module.
 */
(() => {
  const { describe, it, assert } = TestRunner;

  describe('EpubParser', () => {

    it('should extract metadata (title and author)', async () => {
      const epub = await TestHelpers.createMinimalEpub({
        title: 'My Book',
        author: 'Jane Doe'
      });
      const result = await EpubParser.parse(epub);
      assert.equal(result.title, 'My Book');
      assert.equal(result.author, 'Jane Doe');
    });

    it('should extract correct number of chapters', async () => {
      const epub = await TestHelpers.createMinimalEpub({
        chapters: [
          { title: 'Ch 1', body: 'First chapter text.' },
          { title: 'Ch 2', body: 'Second chapter text.' },
          { title: 'Ch 3', body: 'Third chapter text.' }
        ]
      });
      const result = await EpubParser.parse(epub);
      assert.equal(result.chapters.length, 3);
    });

    it('should extract chapter titles from TOC', async () => {
      const epub = await TestHelpers.createMinimalEpub({
        chapters: [
          { title: 'Introduction', body: 'Intro text.' },
          { title: 'The Journey', body: 'Journey text.' }
        ]
      });
      const result = await EpubParser.parse(epub);
      assert.equal(result.chapters[0].title, 'Introduction');
      assert.equal(result.chapters[1].title, 'The Journey');
    });

    it('should extract text content from chapters via load()', async () => {
      const epub = await TestHelpers.createMinimalEpub({
        chapters: [
          { title: 'Ch 1', body: 'Hello world. This is content.' }
        ]
      });
      const result = await EpubParser.parse(epub);
      const text = await result.chapters[0].load();
      assert.ok(text.includes('Hello world'));
      assert.ok(text.includes('This is content'));
    });

    it('should reject DRM-protected EPUBs (rights.xml)', async () => {
      const epub = await TestHelpers.createMinimalEpub({ addDRM: true });
      await assert.throws(
        () => EpubParser.parse(epub),
        'DRM-protected'
      );
    });

    it('should reject EPUBs with real encryption', async () => {
      const epub = await TestHelpers.createMinimalEpub({ addEncryption: true });
      await assert.throws(
        () => EpubParser.parse(epub),
        'DRM-protected'
      );
    });

    it('should allow font obfuscation (not real DRM)', async () => {
      const epub = await TestHelpers.createMinimalEpub({ addFontObfuscation: true });
      const result = await EpubParser.parse(epub);
      assert.ok(result.chapters.length > 0);
    });

    it('should reject invalid ZIP data', async () => {
      const data = TestHelpers.createInvalidZip();
      await assert.throws(
        () => EpubParser.parse(data),
        '' // JSZip throws its own error
      );
    });

    it('should handle URL-encoded paths', async () => {
      const epub = await TestHelpers.createMinimalEpub({
        urlEncodedPaths: true,
        chapters: [
          { title: 'Encoded Ch', body: 'Content with encoded path.' }
        ]
      });
      const result = await EpubParser.parse(epub);
      assert.ok(result.chapters.length > 0);
      const text = await result.chapters[0].load();
      assert.ok(text.includes('Content with encoded path'));
    });

  });

  describe('EpubParser.resolveHref', () => {

    it('should resolve relative paths', () => {
      const result = EpubParser.resolveHref('OEBPS/', 'chapter1.xhtml');
      assert.equal(result, 'OEBPS/chapter1.xhtml');
    });

    it('should handle parent directory references', () => {
      const result = EpubParser.resolveHref('OEBPS/text/', '../images/fig1.png');
      assert.equal(result, 'OEBPS/images/fig1.png');
    });

    it('should strip fragments from hrefs', () => {
      const result = EpubParser.resolveHref('OEBPS/', 'chapter1.xhtml#section1');
      assert.equal(result, 'OEBPS/chapter1.xhtml');
    });

    it('should handle URL-encoded hrefs', () => {
      const result = EpubParser.resolveHref('OEBPS/', 'chapter%201.xhtml');
      assert.equal(result, 'OEBPS/chapter 1.xhtml');
    });

    it('should handle base path with filename', () => {
      const result = EpubParser.resolveHref('OEBPS/content.opf', 'text/ch1.xhtml');
      assert.equal(result, 'OEBPS/text/ch1.xhtml');
    });

    it('should handle absolute hrefs', () => {
      const result = EpubParser.resolveHref('OEBPS/', '/root/file.xhtml');
      assert.equal(result, 'root/file.xhtml');
    });

  });

  describe('EpubParser.extractText', () => {

    it('should extract text from XHTML', () => {
      const html = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hello</p><p>World</p></body></html>`;
      const text = EpubParser.extractText(html);
      assert.ok(text.includes('Hello'));
      assert.ok(text.includes('World'));
    });

    it('should fallback to HTML parsing on XHTML error', () => {
      const html = `<html><body><p>Fallback test</p></body></html>`;
      const text = EpubParser.extractText(html);
      assert.ok(text.includes('Fallback test'));
    });

  });

})();

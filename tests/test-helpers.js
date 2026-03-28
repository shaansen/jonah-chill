/**
 * Test helpers — programmatic EPUB generation using JSZip.
 */
const TestHelpers = (() => {

  /**
   * Create a minimal valid EPUB as ArrayBuffer.
   * Options:
   *   title, author, chapters: [{title, body}],
   *   addDRM: boolean, addEncryption: boolean, addFontObfuscation: boolean,
   *   urlEncodedPaths: boolean
   */
  async function createMinimalEpub(options = {}) {
    const {
      title = 'Test Book',
      author = 'Test Author',
      chapters = [{ title: 'Chapter 1', body: 'Hello world. This is test content.' }],
      addDRM = false,
      addEncryption = false,
      addFontObfuscation = false,
      urlEncodedPaths = false
    } = options;

    const zip = new JSZip();

    // mimetype (must be first, uncompressed in real EPUBs but JSZip handles it)
    zip.file('mimetype', 'application/epub+zip');

    // META-INF/container.xml
    zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

    // DRM files
    if (addDRM) {
      zip.file('META-INF/rights.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rights xmlns="http://example.com/drm"><license>encrypted</license></rights>`);
    }

    if (addEncryption) {
      zip.file('META-INF/encryption.xml', `<?xml version="1.0" encoding="UTF-8"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"
            xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData>
    <enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes256-cbc"/>
    <enc:CipherData><enc:CipherValue>FAKE</enc:CipherValue></enc:CipherData>
  </enc:EncryptedData>
</encryption>`);
    }

    if (addFontObfuscation) {
      zip.file('META-INF/encryption.xml', `<?xml version="1.0" encoding="UTF-8"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"
            xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData>
    <enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>
    <enc:CipherData><enc:CipherValue>FAKE</enc:CipherValue></enc:CipherData>
  </enc:EncryptedData>
</encryption>`);
    }

    // Build manifest and spine entries
    const manifestItems = [];
    const spineItems = [];
    const navPoints = [];

    chapters.forEach((ch, i) => {
      const id = `ch${i + 1}`;
      let filename = `chapter${i + 1}.xhtml`;
      if (urlEncodedPaths) {
        filename = `chapter%20${i + 1}.xhtml`;
      }

      manifestItems.push(`<item id="${id}" href="${filename}" media-type="application/xhtml+xml"/>`);
      spineItems.push(`<itemref idref="${id}"/>`);

      const actualFilename = urlEncodedPaths ? `chapter ${i + 1}.xhtml` : filename;
      zip.file(`OEBPS/${actualFilename}`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${ch.title}</title></head>
<body>
<h1>${ch.title}</h1>
<p>${ch.body}</p>
</body>
</html>`);

      navPoints.push(`<navPoint id="nav${i + 1}" playOrder="${i + 1}">
  <navLabel><text>${ch.title}</text></navLabel>
  <content src="${filename}"/>
</navPoint>`);
    });

    // Add NCX for TOC
    manifestItems.push(`<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`);

    // content.opf
    zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:identifier id="uid">urn:uuid:12345</dc:identifier>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join('\n    ')}
  </spine>
</package>`);

    // toc.ncx
    zip.file('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:12345"/></head>
  <docTitle><text>${title}</text></docTitle>
  <navMap>
    ${navPoints.join('\n    ')}
  </navMap>
</ncx>`);

    return await zip.generateAsync({ type: 'arraybuffer' });
  }

  /**
   * Create invalid data (not a ZIP).
   */
  function createInvalidZip() {
    return new Uint8Array([0, 1, 2, 3, 4, 5]).buffer;
  }

  return { createMinimalEpub, createInvalidZip };
})();

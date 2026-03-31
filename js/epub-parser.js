/**
 * EPUB parser using JSZip.
 * Extracts metadata, chapter list, and text content from EPUB files.
 * Supports DRM detection, lazy chapter loading, and robust path resolution.
 */
const EpubParser = (() => {

  // Size limits to prevent zip bombs and excessive resource usage
  const MAX_COMPRESSED_SIZE = 500 * 1024 * 1024;   // 500 MB compressed
  const MAX_DECOMPRESSED_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB total decompressed
  const MAX_SINGLE_FILE_SIZE = 100 * 1024 * 1024;  // 100 MB per file
  const MAX_FILE_COUNT = 10000;

  // Known font obfuscation algorithms (not real DRM)
  const FONT_OBFUSCATION_ALGORITHMS = [
    'http://ns.adobe.com/pdf/enc#RC',
    'http://www.idpf.org/2008/embedding'
  ];

  /**
   * Try to get a file from the zip, handling URL-encoded paths.
   */
  function getZipFile(zip, path) {
    if (!path) return null;
    // Block path traversal attempts
    if (path.includes('..') || path.startsWith('/')) {
      console.warn('EpubParser: blocked suspicious path:', path);
      return null;
    }
    // Try exact path first
    let file = zip.file(path);
    if (file) return file;
    // Try decoded
    try {
      const decoded = decodeURIComponent(path);
      file = zip.file(decoded);
      if (file) return file;
    } catch {}
    // Try encoded
    const encoded = path.split('/').map(p => encodeURIComponent(p)).join('/');
    file = zip.file(encoded);
    if (file) return file;
    // Try case-insensitive search
    const lower = path.toLowerCase();
    const match = zip.file(new RegExp('^' + lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'));
    return match.length > 0 ? match[0] : null;
  }

  /**
   * Resolve a relative href against a base path.
   * Handles URL-encoded paths, fragments, and file-path bases.
   */
  function resolveHref(base, href) {
    if (!href) return base || '';
    // Strip fragment
    const hashIdx = href.indexOf('#');
    const cleanHref = hashIdx >= 0 ? href.substring(0, hashIdx) : href;
    if (!cleanHref) return base || '';
    // Decode for resolution
    let decodedHref;
    try { decodedHref = decodeURIComponent(cleanHref); } catch { decodedHref = cleanHref; }

    if (!base || decodedHref.startsWith('/')) return decodedHref;

    // Ensure base is a directory (strip filename if present)
    let baseDir = base;
    if (baseDir && !baseDir.endsWith('/')) {
      const lastSlash = baseDir.lastIndexOf('/');
      baseDir = lastSlash >= 0 ? baseDir.substring(0, lastSlash + 1) : '';
    }

    const combined = baseDir + decodedHref;
    const parts = combined.split('/');
    const resolved = [];
    for (const part of parts) {
      if (part === '..') { resolved.pop(); }
      else if (part !== '.' && part !== '') { resolved.push(part); }
    }
    return resolved.join('/');
  }

  /**
   * Check for DRM encryption. Throws if real DRM is found.
   * Font obfuscation is allowed (not real DRM).
   */
  async function checkDRM(zip) {
    // Check rights.xml
    const rightsFile = getZipFile(zip, 'META-INF/rights.xml');
    if (rightsFile) {
      throw new Error('This EPUB is DRM-protected and cannot be read. Please use a DRM-free EPUB file.');
    }

    // Check encryption.xml
    const encFile = getZipFile(zip, 'META-INF/encryption.xml');
    if (!encFile) return; // No encryption

    const encXml = await encFile.async('text');
    const encDoc = new DOMParser().parseFromString(encXml, 'application/xml');
    const encMethods = encDoc.querySelectorAll('EncryptedData');

    for (const enc of encMethods) {
      const algorithm = enc.querySelector('EncryptionMethod')?.getAttribute('Algorithm') || '';
      if (!FONT_OBFUSCATION_ALGORITHMS.includes(algorithm)) {
        throw new Error('This EPUB is DRM-protected and cannot be read. Please use a DRM-free EPUB file.');
      }
    }
  }

  /**
   * Parse an EPUB file (as ArrayBuffer) and return structured book data.
   * Returns: { title, author, chapters: [{ title, text, load() }], zip }
   * Chapters are lazy-loaded stubs — call chapter.load() to get text.
   */
  async function parse(arrayBuffer) {
    // Check compressed size
    if (arrayBuffer.byteLength > MAX_COMPRESSED_SIZE) {
      throw new Error(`EPUB too large (${Math.round(arrayBuffer.byteLength / 1024 / 1024)} MB). Max ${MAX_COMPRESSED_SIZE / 1024 / 1024} MB.`);
    }

    const zip = await JSZip.loadAsync(arrayBuffer);

    // Validate zip contents — check file count and estimate decompressed size
    let totalUncompressed = 0;
    let fileCount = 0;
    zip.forEach((path, entry) => {
      fileCount++;
      if (entry._data && entry._data.uncompressedSize) {
        totalUncompressed += entry._data.uncompressedSize;
      }
    });
    if (fileCount > MAX_FILE_COUNT) {
      throw new Error(`EPUB contains too many files (${fileCount}). Max ${MAX_FILE_COUNT}.`);
    }
    if (totalUncompressed > MAX_DECOMPRESSED_SIZE) {
      throw new Error(`EPUB decompressed size too large. Possible zip bomb.`);
    }

    // DRM check first
    await checkDRM(zip);

    // 1. Find the .opf file via container.xml
    const containerFile = getZipFile(zip, 'META-INF/container.xml');
    const containerXml = containerFile ? await containerFile.async('text') : null;
    if (!containerXml) throw new Error('Invalid EPUB: missing container.xml');

    const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
    const rootfilePath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
    if (!rootfilePath) throw new Error('Invalid EPUB: no rootfile found');

    // 2. Parse the .opf file
    const opfFile = getZipFile(zip, rootfilePath);
    const opfText = opfFile ? await opfFile.async('text') : null;
    if (!opfText) throw new Error('Invalid EPUB: missing OPF file');

    const opfDoc = new DOMParser().parseFromString(opfText, 'application/xml');
    const opfDir = rootfilePath.includes('/') ? rootfilePath.substring(0, rootfilePath.lastIndexOf('/') + 1) : '';

    // 3. Extract metadata
    const title = getMetaText(opfDoc, 'title') || 'Unknown Title';
    const author = getMetaText(opfDoc, 'creator') || 'Unknown Author';

    // 4. Build manifest map (id -> href)
    const manifestMap = {};
    for (const item of opfDoc.querySelectorAll('manifest > item')) {
      manifestMap[item.getAttribute('id')] = item.getAttribute('href');
    }

    // 5. Get spine order
    const spineRefs = [];
    for (const itemref of opfDoc.querySelectorAll('spine > itemref')) {
      spineRefs.push(itemref.getAttribute('idref'));
    }

    // 6. Parse TOC for chapter titles
    const tocTitles = await parseToc(zip, opfDoc, opfDir, manifestMap);

    // 7. Build lazy chapter stubs
    const chapterCache = new Map();
    const chapters = [];

    for (let i = 0; i < spineRefs.length; i++) {
      const href = manifestMap[spineRefs[i]];
      if (!href) continue;

      const filePath = resolveHref(opfDir, href);
      // Quick check that the file exists
      const file = getZipFile(zip, filePath);
      if (!file) continue;

      const chapterTitle = tocTitles[href] || tocTitles[filePath] || null;

      // Try decoded path as well for TOC matching
      let resolvedTitle = chapterTitle;
      if (!resolvedTitle) {
        try {
          resolvedTitle = tocTitles[decodeURIComponent(href)] || tocTitles[decodeURIComponent(filePath)];
        } catch {}
      }

      const idx = chapters.length;
      chapters.push({
        title: resolvedTitle || `Chapter ${idx + 1}`,
        text: null, // lazy — populated by load()
        async load() {
          if (chapterCache.has(idx)) return chapterCache.get(idx);
          const content = await file.async('text');
          const text = extractText(content).trim();
          chapterCache.set(idx, text);
          this.text = text;
          return text;
        }
      });
    }

    if (chapters.length === 0) {
      throw new Error('No readable content found in this EPUB');
    }

    return { title, author, chapters, _zip: zip };
  }

  function getMetaText(doc, localName) {
    const el = doc.querySelector(`metadata > *|${localName}`) ||
               doc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', localName)[0];
    return el?.textContent?.trim() || '';
  }

  async function parseToc(zip, opfDoc, opfDir, manifestMap) {
    const titles = {};

    // Try EPUB3 nav document first
    const navItem = opfDoc.querySelector('manifest > item[properties~="nav"]');
    if (navItem) {
      const navHref = navItem.getAttribute('href');
      const navPath = resolveHref(opfDir, navHref);
      const navFile = getZipFile(zip, navPath);
      const navContent = navFile ? await navFile.async('text') : null;
      if (navContent) {
        const navDoc = new DOMParser().parseFromString(navContent, 'application/xhtml+xml');
        const navEl = navDoc.querySelector('nav[*|type="toc"], nav.toc, nav');
        if (navEl) {
          for (const a of navEl.querySelectorAll('a[href]')) {
            const rawHref = a.getAttribute('href').split('#')[0];
            if (!rawHref) continue;
            const resolved = resolveHref(navPath, rawHref);
            const label = a.textContent.trim();
            titles[resolved] = label;
            titles[rawHref] = label;
            try { titles[decodeURIComponent(rawHref)] = label; } catch {}
            try { titles[decodeURIComponent(resolved)] = label; } catch {}
          }
        }
      }
    }

    // Try EPUB2 toc.ncx
    const tocId = opfDoc.querySelector('spine')?.getAttribute('toc');
    if (tocId && manifestMap[tocId]) {
      const ncxHref = manifestMap[tocId];
      const ncxPath = resolveHref(opfDir, ncxHref);
      const ncxFile = getZipFile(zip, ncxPath);
      const ncxContent = ncxFile ? await ncxFile.async('text') : null;
      if (ncxContent) {
        const ncxDoc = new DOMParser().parseFromString(ncxContent, 'application/xml');
        for (const navPoint of ncxDoc.querySelectorAll('navPoint')) {
          const label = navPoint.querySelector('navLabel > text')?.textContent?.trim();
          const src = navPoint.querySelector('content')?.getAttribute('src')?.split('#')[0];
          if (label && src) {
            const resolved = resolveHref(ncxPath, src);
            titles[resolved] = label;
            titles[src] = label;
            try { titles[decodeURIComponent(src)] = label; } catch {}
            try { titles[decodeURIComponent(resolved)] = label; } catch {}
          }
        }
      }
    }

    return titles;
  }

  function extractText(html) {
    const doc = new DOMParser().parseFromString(html, 'application/xhtml+xml');
    if (doc.querySelector('parsererror')) {
      const doc2 = new DOMParser().parseFromString(html, 'text/html');
      return doc2.body?.textContent || '';
    }
    return doc.body?.textContent || doc.documentElement?.textContent || '';
  }

  return { parse, resolveHref, extractText, getZipFile };
})();

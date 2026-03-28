/**
 * EPUB parser using JSZip.
 * Extracts metadata, chapter list, and text content from EPUB files.
 */
const EpubParser = (() => {

  /**
   * Parse an EPUB file (as ArrayBuffer) and return structured book data.
   * Returns: { title, author, chapters: [{ title, text }] }
   */
  async function parse(arrayBuffer) {
    const zip = await JSZip.loadAsync(arrayBuffer);

    // 1. Find the .opf file via container.xml
    const containerXml = await zip.file('META-INF/container.xml')?.async('text');
    if (!containerXml) throw new Error('Invalid EPUB: missing container.xml');

    const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
    const rootfilePath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
    if (!rootfilePath) throw new Error('Invalid EPUB: no rootfile found');

    // 2. Parse the .opf file
    const opfText = await zip.file(rootfilePath)?.async('text');
    if (!opfText) throw new Error('Invalid EPUB: missing OPF file');

    const opfDoc = new DOMParser().parseFromString(opfText, 'application/xml');
    const opfDir = rootfilePath.includes('/') ? rootfilePath.substring(0, rootfilePath.lastIndexOf('/') + 1) : '';

    // 3. Extract metadata
    const title = getMetaText(opfDoc, 'title') || 'Unknown Title';
    const author = getMetaText(opfDoc, 'creator') || 'Unknown Author';

    // 4. Build manifest map (id → href)
    const manifestMap = {};
    for (const item of opfDoc.querySelectorAll('manifest > item')) {
      manifestMap[item.getAttribute('id')] = item.getAttribute('href');
    }

    // 5. Get spine order (list of idref)
    const spineRefs = [];
    for (const itemref of opfDoc.querySelectorAll('spine > itemref')) {
      spineRefs.push(itemref.getAttribute('idref'));
    }

    // 6. Try to parse TOC for chapter titles
    const tocTitles = await parseToc(zip, opfDoc, opfDir, manifestMap);

    // 7. Extract text for each spine item
    const chapters = [];
    for (let i = 0; i < spineRefs.length; i++) {
      const href = manifestMap[spineRefs[i]];
      if (!href) continue;

      const filePath = resolveHref(opfDir, href);
      const content = await zip.file(filePath)?.async('text');
      if (!content) continue;

      const text = extractText(content);
      if (!text.trim()) continue;

      chapters.push({
        title: tocTitles[href] || tocTitles[filePath] || `Chapter ${chapters.length + 1}`,
        text: text.trim()
      });
    }

    if (chapters.length === 0) {
      throw new Error('No readable content found in this EPUB');
    }

    return { title, author, chapters };
  }

  function getMetaText(doc, localName) {
    // Try dc: namespace first, then plain
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
      const navContent = await zip.file(navPath)?.async('text');
      if (navContent) {
        const navDoc = new DOMParser().parseFromString(navContent, 'application/xhtml+xml');
        const navEl = navDoc.querySelector('nav[*|type="toc"], nav.toc, nav');
        if (navEl) {
          for (const a of navEl.querySelectorAll('a[href]')) {
            const href = a.getAttribute('href').split('#')[0];
            const fullHref = resolveHref(opfDir, resolveHref(navHref.substring(0, navHref.lastIndexOf('/') + 1), href));
            titles[fullHref] = a.textContent.trim();
            titles[href] = a.textContent.trim();
          }
        }
      }
    }

    // Try EPUB2 toc.ncx
    const tocId = opfDoc.querySelector('spine')?.getAttribute('toc');
    if (tocId && manifestMap[tocId]) {
      const ncxPath = resolveHref(opfDir, manifestMap[tocId]);
      const ncxContent = await zip.file(ncxPath)?.async('text');
      if (ncxContent) {
        const ncxDoc = new DOMParser().parseFromString(ncxContent, 'application/xml');
        for (const navPoint of ncxDoc.querySelectorAll('navPoint')) {
          const label = navPoint.querySelector('navLabel > text')?.textContent?.trim();
          const src = navPoint.querySelector('content')?.getAttribute('src')?.split('#')[0];
          if (label && src) {
            const fullSrc = resolveHref(opfDir, resolveHref(manifestMap[tocId].substring(0, manifestMap[tocId].lastIndexOf('/') + 1), src));
            titles[fullSrc] = label;
            titles[src] = label;
          }
        }
      }
    }

    return titles;
  }

  function resolveHref(base, href) {
    if (!base || href.startsWith('/')) return href;
    // Simple path resolution
    const baseParts = base.split('/').filter(Boolean);
    const hrefParts = href.split('/');
    const result = [...baseParts];
    for (const part of hrefParts) {
      if (part === '..') result.pop();
      else if (part !== '.') result.push(part);
    }
    return result.join('/');
  }

  function extractText(html) {
    const doc = new DOMParser().parseFromString(html, 'application/xhtml+xml');
    // If XHTML parsing fails, try HTML
    if (doc.querySelector('parsererror')) {
      const doc2 = new DOMParser().parseFromString(html, 'text/html');
      return doc2.body?.textContent || '';
    }
    return doc.body?.textContent || doc.documentElement?.textContent || '';
  }

  return { parse };
})();

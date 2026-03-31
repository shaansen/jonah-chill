/**
 * EPUB parser using JSZip.
 * Extracts metadata, chapter list, and text content from EPUB files.
 * Supports DRM detection, lazy chapter loading, and robust path resolution.
 */
import JSZip from 'jszip';

const MAX_COMPRESSED_SIZE = 500 * 1024 * 1024;
const MAX_DECOMPRESSED_SIZE = 2 * 1024 * 1024 * 1024;
const MAX_SINGLE_FILE_SIZE = 100 * 1024 * 1024;
const MAX_FILE_COUNT = 10000;

const FONT_OBFUSCATION_ALGORITHMS = [
  'http://ns.adobe.com/pdf/enc#RC',
  'http://www.idpf.org/2008/embedding',
];

export function getZipFile(zip, path) {
  if (!path) return null;
  if (path.includes('..') || path.startsWith('/')) {
    console.warn('EpubParser: blocked suspicious path:', path);
    return null;
  }
  let file = zip.file(path);
  if (file) return file;
  try {
    const decoded = decodeURIComponent(path);
    file = zip.file(decoded);
    if (file) return file;
  } catch { /* ignore */ }
  const encoded = path.split('/').map(p => encodeURIComponent(p)).join('/');
  file = zip.file(encoded);
  if (file) return file;
  const lower = path.toLowerCase();
  const match = zip.file(new RegExp('^' + lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'));
  return match.length > 0 ? match[0] : null;
}

export function resolveHref(base, href) {
  if (!href) return base || '';
  const hashIdx = href.indexOf('#');
  const cleanHref = hashIdx >= 0 ? href.substring(0, hashIdx) : href;
  if (!cleanHref) return base || '';
  let decodedHref;
  try { decodedHref = decodeURIComponent(cleanHref); } catch { decodedHref = cleanHref; }

  if (!base || decodedHref.startsWith('/')) return decodedHref;

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

async function checkDRM(zip) {
  const rightsFile = getZipFile(zip, 'META-INF/rights.xml');
  if (rightsFile) {
    throw new Error('This EPUB is DRM-protected and cannot be read. Please use a DRM-free EPUB file.');
  }

  const encFile = getZipFile(zip, 'META-INF/encryption.xml');
  if (!encFile) return;

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

export function extractText(html) {
  const doc = new DOMParser().parseFromString(html, 'application/xhtml+xml');
  if (doc.querySelector('parsererror')) {
    const doc2 = new DOMParser().parseFromString(html, 'text/html');
    return doc2.body?.textContent || '';
  }
  return doc.body?.textContent || doc.documentElement?.textContent || '';
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
          try { titles[decodeURIComponent(rawHref)] = label; } catch { /* ignore */ }
          try { titles[decodeURIComponent(resolved)] = label; } catch { /* ignore */ }
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
          try { titles[decodeURIComponent(src)] = label; } catch { /* ignore */ }
          try { titles[decodeURIComponent(resolved)] = label; } catch { /* ignore */ }
        }
      }
    }
  }

  return titles;
}

export async function parse(arrayBuffer) {
  if (arrayBuffer.byteLength > MAX_COMPRESSED_SIZE) {
    throw new Error(`EPUB too large (${Math.round(arrayBuffer.byteLength / 1024 / 1024)} MB). Max ${MAX_COMPRESSED_SIZE / 1024 / 1024} MB.`);
  }

  const zip = await JSZip.loadAsync(arrayBuffer);

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
    throw new Error('EPUB decompressed size too large. Possible zip bomb.');
  }

  await checkDRM(zip);

  const containerFile = getZipFile(zip, 'META-INF/container.xml');
  const containerXml = containerFile ? await containerFile.async('text') : null;
  if (!containerXml) throw new Error('Invalid EPUB: missing container.xml');

  const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
  const rootfilePath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
  if (!rootfilePath) throw new Error('Invalid EPUB: no rootfile found');

  const opfFile = getZipFile(zip, rootfilePath);
  const opfText = opfFile ? await opfFile.async('text') : null;
  if (!opfText) throw new Error('Invalid EPUB: missing OPF file');

  const opfDoc = new DOMParser().parseFromString(opfText, 'application/xml');
  const opfDir = rootfilePath.includes('/') ? rootfilePath.substring(0, rootfilePath.lastIndexOf('/') + 1) : '';

  const title = getMetaText(opfDoc, 'title') || 'Unknown Title';
  const author = getMetaText(opfDoc, 'creator') || 'Unknown Author';

  const manifestMap = {};
  for (const item of opfDoc.querySelectorAll('manifest > item')) {
    manifestMap[item.getAttribute('id')] = item.getAttribute('href');
  }

  const spineRefs = [];
  for (const itemref of opfDoc.querySelectorAll('spine > itemref')) {
    spineRefs.push(itemref.getAttribute('idref'));
  }

  const tocTitles = await parseToc(zip, opfDoc, opfDir, manifestMap);

  const chapterCache = new Map();
  const chapters = [];

  for (let i = 0; i < spineRefs.length; i++) {
    const href = manifestMap[spineRefs[i]];
    if (!href) continue;

    const filePath = resolveHref(opfDir, href);
    const file = getZipFile(zip, filePath);
    if (!file) continue;

    const chapterTitle = tocTitles[href] || tocTitles[filePath] || null;

    let resolvedTitle = chapterTitle;
    if (!resolvedTitle) {
      try {
        resolvedTitle = tocTitles[decodeURIComponent(href)] || tocTitles[decodeURIComponent(filePath)];
      } catch { /* ignore */ }
    }

    const idx = chapters.length;
    chapters.push({
      title: resolvedTitle || `Chapter ${idx + 1}`,
      text: null,
      async load() {
        if (chapterCache.has(idx)) return chapterCache.get(idx);
        const content = await file.async('text');
        const text = extractText(content).trim();
        chapterCache.set(idx, text);
        this.text = text;
        return text;
      },
    });
  }

  if (chapters.length === 0) {
    throw new Error('No readable content found in this EPUB');
  }

  return { title, author, chapters, _zip: zip };
}

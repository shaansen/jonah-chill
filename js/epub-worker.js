/**
 * Web Worker for EPUB file decompression.
 * Holds JSZip instance and returns raw file contents on request.
 */

importScripts('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');

let zip = null;

self.onmessage = async (e) => {
  const { id, action, data } = e.data;

  try {
    switch (action) {
      case 'load': {
        zip = await JSZip.loadAsync(data.arrayBuffer);
        // Return list of files
        const files = [];
        zip.forEach((path) => files.push(path));
        self.postMessage({ id, result: { files } });
        break;
      }

      case 'readFile': {
        if (!zip) throw new Error('No EPUB loaded');
        const path = data.path;
        let file = zip.file(path);
        if (!file) {
          // Try decoded
          try {
            file = zip.file(decodeURIComponent(path));
          } catch {}
        }
        if (!file) {
          // Try encoded
          const encoded = path.split('/').map(p => encodeURIComponent(p)).join('/');
          file = zip.file(encoded);
        }
        if (!file) {
          self.postMessage({ id, result: null });
          return;
        }
        const content = await file.async(data.type || 'text');
        self.postMessage({ id, result: content });
        break;
      }

      case 'checkFile': {
        if (!zip) throw new Error('No EPUB loaded');
        const exists = zip.file(data.path) !== null;
        self.postMessage({ id, result: exists });
        break;
      }

      case 'dispose': {
        zip = null;
        self.postMessage({ id, result: true });
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};

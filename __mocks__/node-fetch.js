// CommonJS shim for ESM-only node-fetch in Jest.
// Delegates to global fetch (Node >=18) or undici if available.
const http = require('http');
const https = require('https');
const { URL } = require('url');

async function nativeFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request(
        u,
        { method: options.method || 'GET', headers: options.headers || {} },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              headers: res.headers,
              text: async () => body,
              json: async () => {
                try { return JSON.parse(body || '{}'); } catch { return {}; }
              },
            });
          });
        }
      );
      req.on('error', reject);
      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
      req.end();
    } catch (e) { reject(e); }
  });
}

module.exports = async function fetch(url, options) {
  if (typeof global.fetch === 'function') {
    return global.fetch(url, options);
  }
  try {
    const undici = require('undici');
    if (undici && typeof undici.fetch === 'function') {
      return undici.fetch(url, options);
    }
  } catch {}
  return nativeFetch(url, options);
};


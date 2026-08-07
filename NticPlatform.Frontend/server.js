const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 8080;
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:5000';
const DIST_DIR = path.join(__dirname, 'dist', 'ntic-frontend', 'browser');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4'
};

const server = http.createServer((req, res) => {
  // Clean URL path
  const urlPath = req.url.split('?')[0];

  // 1. Proxy /api requests to Python FastAPI backend
  if (urlPath.startsWith('/api/') || urlPath === '/api') {
    let backendTarget;
    try {
      backendTarget = new URL(req.url, BACKEND_URL);
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: 'Invalid target URL' }));
      return;
    }

    const options = {
      hostname: backendTarget.hostname,
      port: backendTarget.port || (backendTarget.protocol === 'https:' ? 443 : 80),
      path: backendTarget.pathname + backendTarget.search,
      method: req.method,
      headers: {
        ...req.headers,
        host: backendTarget.host
      }
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
      console.error(`API Proxy Error [${req.method} ${req.url}]:`, err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: 'Backend service unavailable', error: err.message }));
    });

    req.pipe(proxyReq, { end: true });
    return;
  }

  // 2. Static file serving & SPA fallback
  let relativePath = urlPath === '/' ? '/index.html' : urlPath;
  let filePath = path.join(DIST_DIR, relativePath);

  // Security check against directory traversal
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    const extName = path.extname(relativePath);
    const hasExtension = extName !== '';

    if (err || !stats.isFile()) {
      // If requested path has a static asset extension (.js, .css, .png, etc.) and doesn't exist, return 404
      if (hasExtension && extName !== '.html') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
      // SPA Fallback for client-side routes (no file extension or .html)
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500);
        res.end('Server Error loading build files. Run npm run build first.');
        return;
      }

      const headers = {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '0',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
      };

      // Cache static assets (hashed JS/CSS/fonts/images) for 1 year; index.html no-cache
      if (ext !== '.html') {
        headers['Cache-Control'] = 'public, max-age=31536000, immutable';
      } else {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      }

      res.writeHead(200, headers);
      res.end(content);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`NTIC Platform Production Server running on http://0.0.0.0:${PORT}`);
  console.log(`Serving static files from: ${DIST_DIR}`);
  console.log(`Proxying /api requests to: ${BACKEND_URL}`);
});

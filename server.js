// LostLink AI - zero-dependency static web server
// Usage: node server.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer(function (req, res) {
  let urlPath = decodeURIComponent(req.url || '/');
  urlPath = urlPath.split('?')[0].split('#')[0];
  if (urlPath === '/') { urlPath = '/index.html'; }

  const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^([/\\])+/, ''));

  // Prevent path traversal outside the project folder
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    console.log('403 ' + urlPath);
    return;
  }

  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><body style="font-family:system-ui;padding:40px">' +
        '<h1 style="color:#00875A">404 - Not found</h1>' +
        '<p><a href="/index.html">Go to the LostLink AI landing page</a></p></body></html>');
      console.log('404 ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
    console.log('200 ' + urlPath);
  });
});

server.listen(PORT, function () {
  console.log('LostLink AI is running:');
  console.log('  Landing page        http://localhost:' + PORT + '/index.html');
  console.log('  Login / auth flow   http://localhost:' + PORT + '/login.html');
  console.log('  Student dashboard   http://localhost:' + PORT + '/user-dashboard.html');
  console.log('  Organization portal http://localhost:' + PORT + '/org-dashboard.html');
  console.log('Press Ctrl+C to stop the server.');
});

server.on('error', function (err) {
  if (err.code === 'EADDRINUSE') {
    console.error('Port ' + PORT + ' is already in use. Try: node server.js 8081');
  } else {
    console.error('Server error: ' + err.message);
  }
  process.exit(1);
});

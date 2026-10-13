const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 8088;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(ROOT, reqPath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLocalIp();
  console.log('==============================================================');
  console.log('  APP ON THI TIENG ANH THAC SI HCMUS 2026 DA SAN SANG!');
  console.log('==============================================================');
  console.log(`  -> Tren may tinh:       http://localhost:${PORT}`);
  console.log(`  -> Tren dien thoai Android (cung Wi-Fi): http://${lanIp}:${PORT}`);
  console.log('     (Mo bang Chrome tren Android -> Chon "Them vao man hinh chinh"');
  console.log('      de cai thanh App Android chay Offline 100%!)');
  console.log('==============================================================');
});

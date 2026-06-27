const http = require('http');
const fs = require('fs');
const path = require('path');

// لود کردن .env بدون نیاز به dotenv
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
  console.log('✅ .env loaded');
}
const PORT = 3001;
const server = http.createServer(async (req, res) => {
console.log(`${req.method} ${req.url}`);
// CORS headers
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
if (req.method === 'OPTIONS') {
res.writeHead(200);
res.end();
return;
}
// Route to API files
if (req.url.startsWith('/api/')) {
const endpoint = req.url.split('?')[0].replace('/api/', '');
const handlerPath = path.join(__dirname, 'api', `${endpoint}.js`);
if (fs.existsSync(handlerPath)) {
try {
delete require.cache[require.resolve(handlerPath)];
const handler = require(handlerPath);
// parse body
let body = '';
await new Promise(resolve => { req.on('data', c => body += c); req.on('end', resolve); });
try { req.body = body ? JSON.parse(body) : {}; } catch { req.body = {}; }
const u = new URL(req.url, 'http://localhost');
req.query = Object.fromEntries(u.searchParams);
// Express-like res wrapper
const mockRes = {
  _headers: {},
  statusCode: 200,
  setHeader(k, v) { this._headers[k] = v; return this; },
  status(code) { this.statusCode = code; return this; },
  json(data) {
    if (!res.headersSent) res.writeHead(this.statusCode, { 'Content-Type': 'application/json', ...this._headers });
    res.end(JSON.stringify(data));
  },
  send(data) {
    if (!res.headersSent) res.writeHead(this.statusCode, this._headers);
    res.end(typeof data === 'string' ? data : JSON.stringify(data));
  },
  end() { res.end(); }
};
await handler(req, mockRes);
return;
} catch (err) {
console.error(`Error in ${endpoint}:`, err.message);
if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: err.message }));
return;
}
}
}
// Root route
if (req.url === '/' || req.url === '/api') {
res.writeHead(200, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({
status: 'ok',
message: 'Azarmehr Backend API',
endpoints: ['/api/login', '/api/users', '/api/documents', '/api/chat']
}));
return;
}
res.writeHead(404, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Not found' }));
});
server.listen(PORT, '127.0.0.1', () => {
console.log(`✅ Server listening on http://127.0.0.1:${PORT}`);
console.log(`Test: curl http://127.0.0.1:${PORT}/api/login`);
});

const http = require('http');
const url = require('url');
const path = require('path');
const PORT = 3000;
const server = http.createServer(async (req, res) => {
const parsedUrl = url.parse(req.url, true);
const pathname = parsedUrl.pathname;
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
if (req.method === 'OPTIONS') {
res.writeHead(200);
res.end();
return;
}
if (pathname.startsWith('/api/')) {
const apiPath = pathname.replace('/api/', '').split('?')[0];
const handlerFile = path.join(__dirname, 'api', `${apiPath}.js`);
try {
delete require.cache[require.resolve(handlerFile)];
const handler = require(handlerFile);
let body = '';
req.on('data', chunk => { body += chunk.toString(); });
req.on('end', async () => {
try {
req.body = body ? JSON.parse(body) : {};
} catch {
req.body = {};
}
req.query = parsedUrl.query;
const mockRes = {
statusCode: 200,
headers: {},
setHeader(key, value) { this.headers[key] = value; },
status(code) { this.statusCode = code; return this; },
json(data) {
res.writeHead(this.statusCode, { 'Content-Type': 'application/json', ...this.headers });
res.end(JSON.stringify(data));
},
send(data) {
res.writeHead(this.statusCode, this.headers);
res.end(typeof data === 'string' ? data : JSON.stringify(data));
}
};
await handler(req, mockRes);
});
} catch (err) {
console.error('Error loading handler:', err);
res.writeHead(404, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Endpoint not found', details: err.message }));
}
} else {
res.writeHead(404);
res.end('Not Found');
}
});
server.listen(PORT, '127.0.0.1', () => {
console.log(`✅ Server running at http://127.0.0.1:${PORT}`);
});

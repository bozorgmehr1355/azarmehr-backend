const http = require('http');
const server = http.createServer((req, res) => {
  console.log(`📨 Request: ${req.method} ${req.url}`);
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK from minimal server\n');
});
server.on('error', (err) => {
  console.error('❌ Server error:', err);
});
server.on('listening', () => {
  console.log('✅ Server actually listening on', server.address());
});
server.listen(3002, '127.0.0.1', () => {
  console.log('✅ Listen callback fired');
});
console.log('🔄 Script still running after server.listen()');
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled rejection:', reason);
});

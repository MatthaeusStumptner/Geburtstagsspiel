import { createServer } from 'node:http';

const server = createServer((_request, response) => response.end('ready'));
await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen);
  server.listen(0, '127.0.0.1', resolveListen);
});
const address = server.address();
process.send?.({ type: 'ready', port: address.port });
process.on('message', () => {});

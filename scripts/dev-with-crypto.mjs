#!/usr/bin/env node
import { webcrypto } from 'crypto';
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = webcrypto;
}
import { createServer } from 'vite';

// Obtener puerto desde env o argumentos CLI
const args = process.argv.slice(2);
let port = process.env.PORT ? Number(process.env.PORT) : undefined;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--port=')) {
    const v = a.split('=')[1];
    port = Number(v);
    break;
  }
  if (a === '--port' && args[i + 1]) {
    port = Number(args[i + 1]);
    break;
  }
}

const server = await createServer({ server: port ? { port } : undefined });
await server.listen();
server.printUrls();

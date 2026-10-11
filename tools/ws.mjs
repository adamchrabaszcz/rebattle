// Just enough of a WebSocket server for tools/serve.mjs: the handshake, sending text
// to the browser, and closing. Live viewers only listen, so anything the browser
// sends apart from a close or ping is ignored. No dependencies. On Cloudflare, the
// runtime does all of this (worker/stores.js).
import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frame(opcode, payload) {
  const n = payload.length;
  const ext = n < 126 ? 0 : n < 65536 ? 2 : 8; // extra length bytes
  const head = Buffer.alloc(2 + ext);
  head[0] = 0x80 | opcode; // final frame
  head[1] = ext === 0 ? n : ext === 2 ? 126 : 127;
  if (ext === 2) head.writeUInt16BE(n, 2);
  if (ext === 8) head.writeBigUInt64BE(BigInt(n), 2);
  return Buffer.concat([head, payload]);
}

// Answers the upgrade and returns a socket with send(text), close() and an onClose
// hook (set by whoever keeps it), or null if the request wasn't a WebSocket upgrade.
export function acceptWebSocket(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return null;
  }
  const accept = createHash('sha1').update(key + GUID).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  let open = true;
  const ws = {
    onClose: null,
    send(text) {
      if (open) socket.write(frame(0x1, Buffer.from(text)));
    },
    close(code = 1000) {
      if (!open) return;
      const body = Buffer.alloc(2);
      body.writeUInt16BE(code);
      socket.end(frame(0x8, body));
      ended();
    },
  };
  function ended() {
    if (!open) return;
    open = false;
    if (ws.onClose) ws.onClose();
  }
  socket.on('data', (buf) => {
    const opcode = buf[0] & 0x0f;
    if (opcode === 0x8) ws.close();
    else if (opcode === 0x9) socket.write(frame(0xa, Buffer.alloc(0))); // ping: pong
  });
  socket.on('close', ended);
  socket.on('error', ended);
  return ws;
}

// Turns an upgrade down, e.g. for a code that has no tournament.
export function refuseUpgrade(socket, status, text) {
  socket.end(`HTTP/1.1 ${status} ${text}\r\nContent-Length: 0\r\n\r\n`);
}

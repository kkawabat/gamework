// Smoke-tests the deployed TURN relay by speaking real STUN/TURN (RFC 5389/5766).
//
// Run after any change to infra/coturn-startup.sh or the relay VM:
//
//   SECRET=$(gcloud --configuration=personal secrets versions access latest \
//     --secret=gamework-turn-secret --project=kan-kawabata-2026)
//   node scripts/verify-turn.js "$(cd infra && terraform output -raw turn_ip)" "$SECRET"
//
// Checks, in order:
//   1. STUN Binding      -> coturn up, reachable, firewall open
//   2. Allocate, no auth -> MUST be rejected. A success here means an open relay:
//      coturn silently disables auth if it cannot read its config (see
//      infra/coturn-startup.sh). This exact bug shipped once already.
//   3. Allocate, authed  -> a credential minted like server.ts mints one works
const dgram = require('dgram');
const crypto = require('crypto');

const HOST = process.argv[2];
const SECRET = process.argv[3];
const MAGIC = 0x2112a442;

const T = { USERNAME: 0x0006, INTEGRITY: 0x0008, ERROR: 0x0009, REALM: 0x0014, NONCE: 0x0015, XOR_RELAYED: 0x0016, REQ_TRANSPORT: 0x0019, XOR_MAPPED: 0x0020 };

const header = (type, len, tid) => {
  const b = Buffer.alloc(20);
  b.writeUInt16BE(type, 0);
  b.writeUInt16BE(len, 2);
  b.writeUInt32BE(MAGIC, 4);
  tid.copy(b, 8);
  return b;
};

const attr = (type, value) => {
  const pad = (4 - (value.length % 4)) % 4;
  const b = Buffer.alloc(4 + value.length + pad);
  b.writeUInt16BE(type, 0);
  b.writeUInt16BE(value.length, 2);
  value.copy(b, 4);
  return b;
};

const parse = (msg) => {
  const out = {};
  const end = 20 + msg.readUInt16BE(2);
  for (let off = 20; off < end; ) {
    const t = msg.readUInt16BE(off);
    const l = msg.readUInt16BE(off + 2);
    out[t] = msg.subarray(off + 4, off + 4 + l);
    off += 4 + l + ((4 - (l % 4)) % 4);
  }
  return out;
};

// XOR-MAPPED/RELAYED-ADDRESS: port and IP are XORed with the magic cookie.
const xorAddr = (buf) => {
  const port = buf.readUInt16BE(2) ^ (MAGIC >>> 16);
  const ip = [];
  for (let i = 0; i < 4; i++) ip.push(buf[4 + i] ^ ((MAGIC >>> (8 * (3 - i))) & 0xff));
  return `${ip.join('.')}:${port}`;
};

const sock = dgram.createSocket('udp4');
const send = (buf) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out — no response on UDP 3478')), 5000);
    sock.once('message', (msg) => { clearTimeout(timer); resolve(msg); });
    sock.send(buf, 3478, HOST, (err) => err && reject(err));
  });

(async () => {
  // --- 1. STUN Binding -----------------------------------------------------
  let tid = crypto.randomBytes(12);
  let res = await send(header(0x0001, 0, tid));
  const bindOk = res.readUInt16BE(0) === 0x0101;
  console.log('1. STUN Binding response :', bindOk ? 'SUCCESS' : `unexpected 0x${res.readUInt16BE(0).toString(16)}`);
  console.log('   relay sees me at      :', xorAddr(parse(res)[T.XOR_MAPPED]));

  // --- 2. Allocate with no credentials -------------------------------------
  tid = crypto.randomBytes(12);
  const reqTransport = attr(T.REQ_TRANSPORT, Buffer.from([17, 0, 0, 0])); // 17 = UDP
  res = await send(Buffer.concat([header(0x0003, reqTransport.length, tid), reqTransport]));
  let a = parse(res);
  const code = a[T.ERROR] ? a[T.ERROR][2] * 100 + a[T.ERROR][3] : 0;
  const realm = a[T.REALM].toString();
  const nonce = a[T.NONCE];
  console.log(`\n2. Unauthenticated Allocate: rejected with ${code}`);
  console.log('   realm                 :', realm, realm === 'gamework.kankawabata.com' ? '(ours, not a default)' : '(UNEXPECTED)');

  // --- 3. Allocate with a credential minted exactly like the server does ----
  const username = `${Math.floor(Date.now() / 1000) + 12 * 3600}:probe`;
  const password = crypto.createHmac('sha1', SECRET).update(username).digest('base64');
  const key = crypto.createHash('md5').update(`${username}:${realm}:${password}`).digest();

  tid = crypto.randomBytes(12);
  const attrs = Buffer.concat([
    reqTransport,
    attr(T.USERNAME, Buffer.from(username)),
    attr(T.REALM, Buffer.from(realm)),
    attr(T.NONCE, nonce)
  ]);
  // Integrity covers the header + attributes, with the length field already
  // counting the 24-byte MESSAGE-INTEGRITY attribute that follows.
  const signed = Buffer.concat([header(0x0003, attrs.length + 24, tid), attrs]);
  const mac = crypto.createHmac('sha1', key).update(signed).digest();
  res = await send(Buffer.concat([signed, attr(T.INTEGRITY, mac)]));

  a = parse(res);
  const ok = res.readUInt16BE(0) === 0x0103;
  console.log('\n3. Authenticated Allocate:', ok ? 'SUCCESS' : `REJECTED (${a[T.ERROR] ? a[T.ERROR][2] * 100 + a[T.ERROR][3] : '?'})`);
  if (ok) console.log('   relay allocated for me:', xorAddr(a[T.XOR_RELAYED]));

  const secure = code === 401;
  if (!secure) console.error('\n!! OPEN RELAY: an unauthenticated client was granted a relay.');
  console.log('\n=>', ok && secure ? 'TURN is working and authenticated.' : 'TURN is NOT healthy.');
  process.exit(ok && secure ? 0 : 1);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });

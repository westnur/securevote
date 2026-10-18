// RSA blind signatures (Chaum, 1983).
// The voter "blinds" a random ballot token, the server signs it without seeing it,
// and the voter "unblinds" the signature. Later the server can verify the signature
// is genuine but cannot link it to the person it was issued to.
const crypto = require('crypto');

const DENOMINATIONS = [1, 10, 100, 1000, 10000, 100000];

const b64ToBig = (s) => BigInt('0x' + Buffer.from(s, 'base64url').toString('hex'));
const bigToHex = (n) => n.toString(16);
const hexToBig = (h) => BigInt('0x' + h);

function modPow(base, exp, mod) {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

function modInverse(a, m) {
  let [oldR, r] = [a % m, m];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  if (oldR !== 1n) throw new Error('Not invertible');
  return ((oldS % m) + m) % m;
}

// Full-domain hash: stretch SHA-256 to 2048 bits, reduce modulo n.
function fdh(message, n) {
  let hex = '';
  for (let i = 0; i < 8; i++) hex += crypto.createHash('sha256').update(`${i}|${message}`).digest('hex');
  return hexToBig(hex) % n;
}

const coinMessage = (pollId, denom, nonce) => `SecureVote|${pollId}|${denom}|${nonce}`;

function generateKey() {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 65537 });
  return privateKey.export({ format: 'jwk' });
}

class BlindSigner {
  constructor(jwk) {
    this.jwk = jwk;
    this.n = b64ToBig(jwk.n);
    this.e = b64ToBig(jwk.e);
    this.p = b64ToBig(jwk.p);
    this.q = b64ToBig(jwk.q);
    this.dp = b64ToBig(jwk.dp);
    this.dq = b64ToBig(jwk.dq);
    this.qi = b64ToBig(jwk.qi);
  }

  get publicKey() {
    return { n: bigToHex(this.n), e: bigToHex(this.e) };
  }

  // Sign a blinded value using the Chinese Remainder Theorem (≈4× faster).
  sign(blindedHex) {
    const m = hexToBig(blindedHex);
    if (m <= 0n || m >= this.n) throw new Error('Blinded value out of range');
    const m1 = modPow(m % this.p, this.dp, this.p);
    const m2 = modPow(m % this.q, this.dq, this.q);
    const h = (this.qi * ((m1 - m2 + this.p) % this.p)) % this.p;
    return bigToHex(m2 + h * this.q);
  }

  verify(message, signatureHex) {
    const s = hexToBig(signatureHex);
    if (s <= 0n || s >= this.n) return false;
    return modPow(s, this.e, this.n) === fdh(message, this.n);
  }
}

// Client-side half of the protocol (the browser has an identical copy in public/js/blind.js).
// Used by the demo seed to cast sample ballots.
function blind(message, pub) {
  const n = hexToBig(pub.n);
  const e = hexToBig(pub.e);
  let r;
  do r = hexToBig(crypto.randomBytes(256).toString('hex')) % n; while (r < 2n);
  return { blinded: bigToHex((fdh(message, n) * modPow(r, e, n)) % n), r };
}

function unblind(signatureHex, r, pub) {
  const n = hexToBig(pub.n);
  return bigToHex((hexToBig(signatureHex) * modInverse(r, n)) % n);
}

// Split an amount into coins: 5,320 → 5×1000, 3×100, 2×10.
function decompose(amount) {
  const coins = [];
  for (const d of DENOMINATIONS.slice().reverse()) {
    while (amount >= d) {
      coins.push(d);
      amount -= d;
    }
  }
  return coins;
}

module.exports = { DENOMINATIONS, BlindSigner, generateKey, coinMessage, blind, unblind, decompose, fdh };

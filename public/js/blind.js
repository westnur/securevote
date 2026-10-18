// Browser half of the RSA blind-signature protocol (mirror of src/rsa-blind.js).
// Everything secret — the ballot tokens and blinding factors — stays in this browser.
const Blind = (() => {
  const hexToBig = (h) => BigInt('0x' + h);
  const randHex = (bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');

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
    return ((oldS % m) + m) % m;
  }

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function fdh(message, n) {
    let hex = '';
    for (let i = 0; i < 8; i++) hex += await sha256Hex(`${i}|${message}`);
    return hexToBig(hex) % n;
  }

  const coinMessage = (pollId, denom, nonce) => `SecureVote|${pollId}|${denom}|${nonce}`;

  function decompose(amount, denominations) {
    const coins = [];
    for (const d of denominations.slice().sort((a, b) => b - a)) {
      while (amount >= d) { coins.push(d); amount -= d; }
    }
    return coins;
  }

  // Create coins for an allocation like { For: 3000, Against: 1000 } and blind them.
  async function prepare(pollId, allocation, keyset) {
    const coins = [];
    for (const [choice, amount] of Object.entries(allocation)) {
      for (const denom of decompose(amount, keyset.denominations)) {
        const pub = keyset.keys[denom];
        const n = hexToBig(pub.n), e = hexToBig(pub.e);
        const nonce = randHex(32);
        let r;
        do r = hexToBig(randHex(256)) % n; while (r < 2n);
        const m = await fdh(coinMessage(pollId, denom, nonce), n);
        const blinded = ((m * modPow(r, e, n)) % n).toString(16);
        coins.push({ denom, choice, nonce, r: r.toString(16), blinded });
      }
    }
    return coins;
  }

  // Remove the blinding factor and check the server's signature is genuine.
  async function finish(pollId, coins, signatures, keyset) {
    return Promise.all(coins.map(async (c, i) => {
      const pub = keyset.keys[c.denom];
      const n = hexToBig(pub.n), e = hexToBig(pub.e);
      const s = (hexToBig(signatures[i].signature) * modInverse(hexToBig(c.r), n)) % n;
      if (modPow(s, e, n) !== (await fdh(coinMessage(pollId, c.denom, c.nonce), n))) throw new Error('Server returned an invalid signature');
      return { denom: c.denom, choice: c.choice, nonce: c.nonce, signature: s.toString(16) };
    }));
  }

  return { prepare, finish, sha256Hex, randHex };
})();

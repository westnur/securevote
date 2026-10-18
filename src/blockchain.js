// Permissioned blockchain: SHA-256 hash chain + Merkle roots + light proof-of-work,
// with every block signed by a set of validator nodes (Proof-of-Authority, 2-of-3).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const DIFFICULTY = 3;
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

function merkleRoot(transactions) {
  let level = transactions.map((t) => sha256(JSON.stringify(t)));
  if (!level.length) return sha256('');
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(sha256(level[i] + (level[i + 1] ?? level[i])));
    level = next;
  }
  return level[0];
}

const blockHash = (b) => sha256(`${b.index}|${b.timestamp}|${b.merkleRoot}|${b.previousHash}|${b.nonce}|${b.proposer}`);

function mine(block) {
  const target = '0'.repeat(DIFFICULTY);
  block.nonce = 0;
  block.hash = blockHash(block);
  while (!block.hash.startsWith(target)) {
    block.nonce++;
    block.hash = blockHash(block);
  }
  return block;
}

class Validator {
  constructor({ id, name, location, publicKey, privateKey }) {
    Object.assign(this, { id, name, location, publicKey });
    this.key = crypto.createPrivateKey(privateKey);
  }

  static create(id, name, location) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    return {
      id, name, location,
      publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    };
  }

  sign(hash) {
    return { validator: this.id, signature: crypto.sign(null, Buffer.from(hash), this.key).toString('base64') };
  }
}

class Blockchain extends EventEmitter {
  constructor(file, validators) {
    super();
    this.file = file;
    this.difficulty = DIFFICULTY;
    this.validators = validators.map((v) => new Validator(v));
    this.chain = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    if (!this.chain.length) {
      this.append([{
        type: 'GENESIS',
        note: 'SecureVote corporate voting ledger',
        validators: this.validators.map(({ id, name, location, publicKey }) => ({ id, name, location, publicKey })),
        quorum: 2,
      }], '2026-01-01T00:00:00.000Z');
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.chain));
  }

  get latest() {
    return this.chain[this.chain.length - 1];
  }

  append(transactions, timestamp = new Date().toISOString()) {
    const index = this.chain.length;
    const block = mine({
      index,
      timestamp,
      transactions,
      merkleRoot: merkleRoot(transactions),
      previousHash: index ? this.latest.hash : '0'.repeat(64),
      proposer: this.validators[index % this.validators.length].id,
      nonce: 0,
    });
    block.signatures = this.validators.map((v) => v.sign(block.hash));
    this.chain.push(block);
    this.save();
    this.emit('block', block);
    return block;
  }

  // Each write is sealed in its own block right away — results are final instantly.
  addTransaction(tx) {
    const transaction = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), ...tx };
    return { transaction, block: this.append([transaction]) };
  }

  transactions(filter = () => true) {
    const out = [];
    for (const b of this.chain) for (const t of b.transactions) if (filter(t)) out.push({ ...t, blockIndex: b.index, blockHash: b.hash });
    return out;
  }

  static validate(chain) {
    const genesis = chain[0]?.transactions?.[0];
    if (!genesis || genesis.type !== 'GENESIS') return { valid: false, brokenAt: 0, reason: 'Genesis block is missing' };
    const keys = Object.fromEntries(genesis.validators.map((v) => [v.id, crypto.createPublicKey(v.publicKey)]));
    const target = '0'.repeat(DIFFICULTY);

    for (let i = 0; i < chain.length; i++) {
      const b = chain[i];
      if (merkleRoot(b.transactions) !== b.merkleRoot) return { valid: false, brokenAt: i, reason: 'Transactions do not match the Merkle root' };
      if (blockHash(b) !== b.hash) return { valid: false, brokenAt: i, reason: 'Block header does not match its hash' };
      if (!b.hash.startsWith(target)) return { valid: false, brokenAt: i, reason: 'Proof-of-work is missing' };
      if (i > 0 && b.previousHash !== chain[i - 1].hash) return { valid: false, brokenAt: i, reason: 'Link to the previous block is broken' };
      const good = new Set(
        (b.signatures || [])
          .filter((s) => keys[s.validator] && crypto.verify(null, Buffer.from(b.hash), keys[s.validator], Buffer.from(s.signature, 'base64')))
          .map((s) => s.validator)
      );
      if (good.size < genesis.quorum) return { valid: false, brokenAt: i, reason: `Only ${good.size} of ${genesis.validators.length} validator signatures are valid` };
    }
    return { valid: true, blocks: chain.length };
  }

  verify() {
    return Blockchain.validate(this.chain);
  }
}

module.exports = { Blockchain, Validator, sha256, merkleRoot, blockHash, mine };

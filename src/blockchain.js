const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DIFFICULTY = 3; // number of leading zeros required by proof-of-work
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

class Block {
  constructor(index, timestamp, transactions, previousHash, nonce = 0) {
    this.index = index;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.nonce = nonce;
    this.hash = this.computeHash();
  }

  computeHash() {
    return sha256(
      this.index + this.timestamp + JSON.stringify(this.transactions) + this.previousHash + this.nonce
    );
  }

  mine(difficulty) {
    const target = '0'.repeat(difficulty);
    while (!this.hash.startsWith(target)) {
      this.nonce++;
      this.hash = this.computeHash();
    }
  }
}

class Blockchain {
  constructor(file) {
    this.file = file;
    this.difficulty = DIFFICULTY;
    this.chain = this.load() || [this.createGenesis()];
    this.save();
  }

  createGenesis() {
    const genesis = new Block(0, '2026-01-01T00:00:00.000Z', [{ type: 'GENESIS', note: 'SecureVote ledger' }], '0');
    genesis.mine(this.difficulty);
    return genesis;
  }

  load() {
    if (!fs.existsSync(this.file)) return null;
    const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    return raw.map((b) => Object.assign(Object.create(Block.prototype), b));
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.chain, null, 2));
  }

  get latest() {
    return this.chain[this.chain.length - 1];
  }

  // Every write is mined into its own block immediately, so results are final at once.
  addTransaction(tx) {
    const transaction = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), ...tx };
    const block = new Block(this.chain.length, new Date().toISOString(), [transaction], this.latest.hash);
    block.mine(this.difficulty);
    this.chain.push(block);
    this.save();
    return { transaction, block };
  }

  transactions(filter = () => true) {
    return this.chain.flatMap((b) => b.transactions.map((t) => ({ ...t, blockIndex: b.index, blockHash: b.hash }))).filter(filter);
  }

  static validate(chain, difficulty = DIFFICULTY) {
    const target = '0'.repeat(difficulty);
    for (let i = 0; i < chain.length; i++) {
      const b = chain[i];
      const recomputed = Block.prototype.computeHash.call(b);
      if (b.hash !== recomputed) return { valid: false, brokenAt: i, reason: 'Block contents do not match its hash' };
      if (!b.hash.startsWith(target)) return { valid: false, brokenAt: i, reason: 'Proof-of-work is missing' };
      if (i > 0 && b.previousHash !== chain[i - 1].hash) return { valid: false, brokenAt: i, reason: 'Link to previous block is broken' };
    }
    return { valid: true, blocks: chain.length };
  }

  verify() {
    return Blockchain.validate(this.chain, this.difficulty);
  }
}

module.exports = { Blockchain, Block, sha256 };

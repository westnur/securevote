const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Blockchain, Validator, sha256, merkleRoot, blockHash, mine } = require('./src/blockchain');
const { DENOMINATIONS, BlindSigner, generateKey, coinMessage, blind, unblind, decompose } = require('./src/rsa-blind');
const { Store } = require('./src/store');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const SESSION_TTL = 8 * 3600e3;
const THRESHOLDS = { ordinary: 0.5, special: 2 / 3 };
const DATA_VERSION = 3;

// Data written by an older version of SecureVote has a different format.
// Move it aside to a backup folder and start with fresh demo data.
const VERSION_FILE = path.join(DATA_DIR, 'version.json');
if (fs.existsSync(DATA_DIR) && fs.readdirSync(DATA_DIR).length) {
  let version = 0;
  try { version = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')).version; } catch {}
  if (version !== DATA_VERSION) {
    const backup = `${DATA_DIR}-backup-${Date.now()}`;
    fs.renameSync(DATA_DIR, backup);
    console.log(`Old data format found — moved it to ${path.basename(backup)} and created a fresh demo.`);
  }
}
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(VERSION_FILE, JSON.stringify({ version: DATA_VERSION }));

// ---------- keys: validator nodes + one blind-signing key per token denomination ----------
const KEYS_FILE = path.join(DATA_DIR, 'keys.json');
function loadKeys() {
  if (fs.existsSync(KEYS_FILE)) return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
  const keys = {
    validators: [
      Validator.create('node-1', 'Validator Node 1', 'Company HQ'),
      Validator.create('node-2', 'Validator Node 2', 'Independent auditor'),
      Validator.create('node-3', 'Validator Node 3', 'Share registrar'),
    ],
    blind: Object.fromEntries(DENOMINATIONS.map((d) => [d, generateKey()])),
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys));
  return keys;
}
const keys = loadKeys();
const signers = Object.fromEntries(Object.entries(keys.blind).map(([d, jwk]) => [d, new BlindSigner(jwk)]));

const chain = new Blockchain(path.join(DATA_DIR, 'chain.json'), keys.validators);
const db = new Store(path.join(DATA_DIR, 'db.json'));
const sessions = new Map(); // token -> { userId, expires }

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // correct client IPs behind a hosting proxy (rate limiting)
app.use(express.json({ limit: '200kb' }));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'",
  });
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// ---------- helpers ----------
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) =>
  `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;

const checkPassword = (password, stored) => {
  const [salt, hash] = stored.split(':');
  return crypto.timingSafeEqual(crypto.scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
};

const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);

// Public pseudonym of a holder on the ledger — never the real identity.
const pseudonym = (userId) => 'sv1' + sha256('holder:' + userId).slice(0, 37);

const balanceOf = (userId) =>
  chain.transactions((t) => t.type === 'TOKEN_ISSUE' && t.holder === pseudonym(userId)).reduce((s, t) => s + t.amount, 0);

const totalSupply = () => chain.transactions((t) => t.type === 'TOKEN_ISSUE').reduce((s, t) => s + t.amount, 0);

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, tokens: balanceOf(u.id), address: pseudonym(u.id) });

const pollStatus = (p) => {
  if (p.closed || Date.now() > Date.parse(p.endsAt)) return 'closed';
  if (Date.now() < Date.parse(p.startsAt)) return 'upcoming';
  return 'active';
};

// Results are always tallied straight from the blockchain.
function tally(poll) {
  const counts = Object.fromEntries(poll.options.map((o) => [o, 0]));
  let ballots = 0;
  let castWeight = 0;
  for (const tx of chain.transactions((t) => t.type === 'VOTE' && t.pollId === poll.id)) {
    ballots++;
    for (const b of tx.ballots) {
      if (b.choice in counts) counts[b.choice] += b.weight;
      castWeight += b.weight;
    }
  }
  const supply = poll.supplySnapshot || totalSupply();
  const quorumMet = castWeight / supply >= poll.quorum / 100;
  const threshold = THRESHOLDS[poll.kind] ?? 0.5;
  let decision;
  let support = null;
  if ('For' in counts && 'Against' in counts) {
    const decisive = counts.For + counts.Against;
    support = decisive ? counts.For / decisive : 0;
    decision = poll.kind === 'special' ? (support >= threshold ? 'PASSED' : 'REJECTED') : support > threshold ? 'PASSED' : 'REJECTED';
  } else {
    const [top, second] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    decision = top[1] === 0 ? 'NO VOTES' : second && top[1] === second[1] ? 'TIE' : `ELECTED: ${top[0]}`;
  }
  if (!quorumMet) decision = 'NO QUORUM';
  return { counts, ballots, castWeight, supply, turnout: castWeight / supply, quorumMet, threshold, support, decision };
}

const pollView = (p, user) => ({
  ...p,
  status: pollStatus(p),
  results: tally(p),
  hasVoted: user ? db.participation.some((x) => x.pollId === p.id && x.userId === user.id) : undefined,
});

function finalize(poll) {
  if (poll.finalized) return;
  poll.finalized = true;
  db.save();
  const r = tally(poll);
  chain.addTransaction({ type: 'POLL_CLOSED', pollId: poll.id, counts: r.counts, turnout: r.turnout, decision: r.decision, resultsHash: sha256(JSON.stringify(r.counts)) });
}
setInterval(() => db.polls.filter((p) => !p.finalized && pollStatus(p) === 'closed').forEach(finalize), 15e3);

// ---------- auth ----------
const auth = (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const s = sessions.get(token);
  const user = s && s.expires > Date.now() && db.users.find((u) => u.id === s.userId);
  if (!user) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Please sign in' });
  }
  req.user = user;
  next();
};
const optionalUser = (req) => {
  const s = sessions.get((req.headers.authorization || '').replace('Bearer ', ''));
  return s && s.expires > Date.now() ? db.users.find((u) => u.id === s.userId) : null;
};
const adminOnly = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Administrator access required' });

const attempts = new Map(); // ip -> [timestamps]
app.post('/api/auth/login', (req, res) => {
  const recent = (attempts.get(req.ip) || []).filter((t) => Date.now() - t < 15 * 60e3);
  if (recent.length >= 10) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  const { email, password } = req.body || {};
  const user = db.users.find((u) => u.email.toLowerCase() === str(email).toLowerCase());
  if (!user || !checkPassword(str(password), user.password)) {
    attempts.set(req.ip, [...recent, Date.now()]);
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  attempts.delete(req.ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId: user.id, expires: Date.now() + SESSION_TTL });
  res.json({ token, user: publicUser(user) });
});

app.post('/api/auth/logout', auth, (req, res) => {
  sessions.delete((req.headers.authorization || '').replace('Bearer ', ''));
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => res.json(publicUser(req.user)));

// ---------- participant register ----------
// Voting tokens are a technical representation of the voting weight each participant has
// in the verified register — they are not shares and do not replace the official share register.
app.get('/api/shareholders', auth, adminOnly, (req, res) => {
  res.json({ shareholders: db.users.filter((u) => u.role === 'shareholder').map(publicUser), totalSupply: totalSupply(), imports: db.data.imports || [] });
});

function addShareholder(name, email, password, weight, source = 'Manual entry by administrator') {
  const user = { id: crypto.randomUUID(), name, email, password: hashPassword(password), role: 'shareholder', createdAt: new Date().toISOString() };
  db.users.push(user);
  db.save();
  // Only a pseudonym and the weight go on-chain; names and emails stay off-chain.
  const { block } = chain.addTransaction({ type: 'TOKEN_ISSUE', holder: pseudonym(user.id), amount: weight, source });
  return { user, block };
}

// Bulk import of the participant register (CSV: name,email,weight). The file's hash is
// recorded on-chain so the source of the voting weights can be traced later.
app.post('/api/shareholders/import', auth, adminOnly, (req, res) => {
  const csv = String(req.body?.csv || '').slice(0, 100000);
  const fileName = str(req.body?.fileName, 120) || 'register.csv';
  const rows = csv.split(/\r?\n/).map((l) => l.split(/[,;]/).map((c) => c.trim())).filter((r) => r.length >= 3 && r[0]);
  if (rows.length && !/^\d+$/.test(rows[0][2])) rows.shift(); // header row
  if (!rows.length || rows.length > 500) return res.status(400).json({ error: 'Provide 1–500 rows: name, email, voting weight' });
  const seen = new Set(db.users.map((u) => u.email.toLowerCase()));
  for (const [i, [name, email, weight]] of rows.entries()) {
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: `Row ${i + 1}: invalid name or email` });
    if (!/^\d+$/.test(weight) || +weight <= 0 || +weight > 1e9) return res.status(400).json({ error: `Row ${i + 1}: weight must be a positive whole number` });
    if (seen.has(email.toLowerCase())) return res.status(409).json({ error: `Row ${i + 1}: ${email} is already registered` });
    seen.add(email.toLowerCase());
  }
  const sourceHash = sha256(csv);
  const { block } = chain.addTransaction({ type: 'REGISTER_IMPORT', fileName, sourceHash, rows: rows.length, totalWeight: rows.reduce((s, r) => s + +r[2], 0) });
  const created = rows.map(([name, email, weight]) => {
    const password = crypto.randomBytes(5).toString('hex');
    addShareholder(str(name, 80), str(email, 120), password, +weight, `Register import ${sourceHash.slice(0, 12)}`);
    return { name, email, weight: +weight, password };
  });
  (db.data.imports ||= []).push({ fileName, sourceHash, rows: rows.length, block: block.index, at: new Date().toISOString() });
  db.save();
  res.status(201).json({ created, sourceHash, block: block.index });
});

app.post('/api/shareholders', auth, adminOnly, (req, res) => {
  const name = str(req.body?.name, 80);
  const email = str(req.body?.email, 120);
  const password = str(req.body?.password, 100);
  const shares = Number(req.body?.shares);
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Name and a valid email are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!Number.isInteger(shares) || shares <= 0 || shares > 1e9) return res.status(400).json({ error: 'Voting weight must be a positive whole number' });
  if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) return res.status(409).json({ error: 'A user with this email already exists' });
  const { user, block } = addShareholder(name, email, password, shares);
  res.status(201).json({ shareholder: publicUser(user), block: block.index });
});

// ---------- polls ----------
app.get('/api/polls', auth, (req, res) => res.json(db.polls.slice().reverse().map((p) => pollView(p, req.user))));

app.get('/api/polls/:id', auth, (req, res) => {
  const poll = db.polls.find((p) => p.id === req.params.id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  res.json(pollView(poll, req.user));
});

function createPoll({ title, description, options, kind, mode = 'secret', quorum, hours }) {
  const poll = {
    id: crypto.randomUUID(),
    title,
    description,
    options,
    kind,
    mode,
    quorum,
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + hours * 3600e3).toISOString(),
    supplySnapshot: totalSupply(),
    closed: false,
    finalized: false,
  };
  db.polls.push(poll);
  db.save();
  chain.addTransaction({ type: 'POLL_CREATED', pollId: poll.id, title, options, kind, mode, quorum, endsAt: poll.endsAt, supply: poll.supplySnapshot, rulesHash: sha256(JSON.stringify(poll)) });
  return poll;
}

app.post('/api/polls', auth, adminOnly, (req, res) => {
  const title = str(req.body?.title, 160);
  const options = (Array.isArray(req.body?.options) ? req.body.options : []).map((o) => str(o, 80)).filter(Boolean);
  if (!title) return res.status(400).json({ error: 'Title is required' });
  if (options.length < 2 || options.length > 8 || new Set(options).size !== options.length)
    return res.status(400).json({ error: 'Provide 2–8 unique options' });
  const poll = createPoll({
    title,
    description: str(req.body?.description, 1000),
    options,
    kind: req.body?.kind === 'special' ? 'special' : 'ordinary',
    mode: req.body?.mode === 'open' ? 'open' : 'secret',
    quorum: Math.min(Math.max(Number(req.body?.quorum) || 50, 1), 100),
    hours: Math.min(Math.max(Number(req.body?.durationHours) || 72, 0.05), 24 * 60),
  });
  res.status(201).json(pollView(poll, req.user));
});

app.post('/api/polls/:id/close', auth, adminOnly, (req, res) => {
  const poll = db.polls.find((p) => p.id === req.params.id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  if (pollStatus(poll) === 'closed') return res.status(400).json({ error: 'Poll is already closed' });
  poll.closed = true;
  poll.endsAt = new Date().toISOString();
  finalize(poll);
  res.json(pollView(poll, req.user));
});

// ---------- anonymous voting ----------
app.get('/api/blind/keys', (req, res) => {
  res.json({ denominations: DENOMINATIONS, keys: Object.fromEntries(Object.entries(signers).map(([d, s]) => [d, s.publicKey])) });
});

// Step 1 (authenticated): the shareholder sends BLINDED ballot tokens worth exactly their
// balance. The server checks eligibility and signs them without being able to see them.
app.post('/api/polls/:id/credentials', auth, (req, res) => {
  if (req.user.role !== 'shareholder') return res.status(403).json({ error: 'Only registered participants can vote' });
  const poll = db.polls.find((p) => p.id === req.params.id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  if (pollStatus(poll) !== 'active') return res.status(400).json({ error: 'This poll is not open for voting' });
  if (poll.mode === 'open') return res.status(400).json({ error: 'This is an open (roll-call) vote' });
  if (db.participation.some((x) => x.pollId === poll.id && x.userId === req.user.id))
    return res.status(409).json({ error: 'Ballots for this poll were already issued to you' });

  const blinded = Array.isArray(req.body?.blinded) ? req.body.blinded : [];
  if (!blinded.length || blinded.length > 200) return res.status(400).json({ error: 'Invalid ballot request' });
  if (blinded.some((b) => !signers[b.denom] || !/^[0-9a-f]{1,600}$/.test(b.value)))
    return res.status(400).json({ error: 'Invalid ballot request' });
  const requested = blinded.reduce((s, b) => s + Number(b.denom), 0);
  if (requested !== balanceOf(req.user.id))
    return res.status(400).json({ error: 'Requested ballots must equal your token balance' });

  let signatures;
  try {
    signatures = blinded.map((b) => ({ denom: Number(b.denom), signature: signers[b.denom].sign(b.value) }));
  } catch {
    return res.status(400).json({ error: 'Invalid blinded value' });
  }
  db.participation.push({ pollId: poll.id, userId: req.user.id, issuedAt: new Date().toISOString() });
  db.save();
  res.json({ signatures });
});

// Step 2 (anonymous — no login required): submit unblinded tokens with choices.
// The ledger records choice, weight and a one-time nullifier. Nobody, including the
// server, can tell which shareholder the tokens belong to.
function castBallots(pollId, coins, receipt) {
  const poll = db.polls.find((p) => p.id === pollId);
  if (!poll) throw Object.assign(new Error('Poll not found'), { status: 404 });
  if (pollStatus(poll) !== 'active') throw new Error('This poll is not open for voting');
  if (poll.mode === 'open') throw new Error('This is an open (roll-call) vote');
  if (!Array.isArray(coins) || !coins.length || coins.length > 200) throw new Error('No ballots supplied');
  if (!/^[0-9a-f]{64}$/.test(receipt)) throw new Error('Invalid receipt hash');

  const used = new Set(chain.transactions((t) => t.type === 'VOTE' && t.pollId === pollId).flatMap((t) => t.ballots.map((b) => b.nullifier)));
  const ballots = coins.map((c) => {
    const signer = signers[c.denom];
    if (!signer || !/^[0-9a-f]{64}$/.test(c.nonce) || !poll.options.includes(c.choice)) throw new Error('Malformed ballot');
    if (!signer.verify(coinMessage(pollId, c.denom, c.nonce), String(c.signature))) throw new Error('Ballot signature is not valid');
    const nullifier = sha256('nullifier|' + c.nonce);
    if (used.has(nullifier)) throw Object.assign(new Error('This ballot has already been used'), { status: 409 });
    used.add(nullifier);
    return { choice: c.choice, weight: Number(c.denom), nullifier };
  });
  return chain.addTransaction({ type: 'VOTE', pollId, ballots, receipt });
}

app.post('/api/ballots', (req, res) => {
  try {
    const { block } = castBallots(req.body?.pollId, req.body?.coins, str(req.body?.receipt, 64));
    res.status(201).json({ block: block.index, blockHash: block.hash });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// Open (roll-call) voting: the choice is linked to the participant's ledger pseudonym,
// as required for e.g. board resolutions. Identity and choice are still kept apart
// in secret polls, which use the blind-signature flow above.
function castOpenVote(user, poll, allocation) {
  if (pollStatus(poll) !== 'active') throw new Error('This poll is not open for voting');
  if (poll.mode !== 'open') throw new Error('This is a secret ballot');
  if (db.participation.some((x) => x.pollId === poll.id && x.userId === user.id)) throw Object.assign(new Error('You have already voted in this poll'), { status: 409 });
  const entries = Object.entries(allocation || {}).map(([c, w]) => [c, Number(w)]).filter(([, w]) => w > 0);
  if (!entries.length || entries.some(([c, w]) => !poll.options.includes(c) || !Number.isInteger(w))) throw new Error('Invalid vote');
  if (entries.reduce((s, [, w]) => s + w, 0) !== balanceOf(user.id)) throw new Error('Votes must equal your voting weight');
  db.participation.push({ pollId: poll.id, userId: user.id, issuedAt: new Date().toISOString() });
  db.save();
  return chain.addTransaction({ type: 'VOTE', mode: 'open', pollId: poll.id, voter: pseudonym(user.id), ballots: entries.map(([choice, weight]) => ({ choice, weight })) });
}

app.post('/api/polls/:id/vote', auth, (req, res) => {
  if (req.user.role !== 'shareholder') return res.status(403).json({ error: 'Only registered participants can vote' });
  const poll = db.polls.find((p) => p.id === req.params.id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  try {
    const { block } = castOpenVote(req.user, poll, req.body?.allocation);
    res.status(201).json({ block: block.index, blockHash: block.hash });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

app.post('/api/receipts/verify', (req, res) => {
  const secret = str(req.body?.secret, 200);
  if (!secret) return res.status(400).json({ error: 'Enter your receipt code' });
  const receipt = sha256(secret);
  const vote = chain.transactions((t) => t.type === 'VOTE' && t.receipt === receipt)[0];
  if (!vote) return res.json({ found: false });
  const poll = db.polls.find((p) => p.id === vote.pollId);
  res.json({ found: true, poll: poll?.title, pollId: vote.pollId, ballots: vote.ballots, block: vote.blockIndex, blockHash: vote.blockHash, timestamp: vote.timestamp });
});

// ---------- public ledger ----------
const publicBlock = (b) => ({ ...b, txCount: b.transactions.length });

app.get('/api/chain', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  res.json({
    difficulty: chain.difficulty,
    length: chain.chain.length,
    validators: chain.chain[0].transactions[0].validators.map(({ id, name, location, publicKey }) => ({ id, name, location, publicKey })),
    blocks: chain.chain.slice(-limit).reverse().map(publicBlock),
  });
});

app.get('/api/chain/blocks/:index', (req, res) => {
  const b = chain.chain[Number(req.params.index)];
  b ? res.json(publicBlock(b)) : res.status(404).json({ error: 'Block not found' });
});

app.get('/api/chain/verify', (req, res) => {
  const t = Date.now();
  res.json({ ...chain.verify(), ms: Date.now() - t });
});

// Two attacks, run on a copy of the chain — the real ledger is never touched.
app.get('/api/chain/tamper-demo', (req, res) => {
  const copy = JSON.parse(JSON.stringify(chain.chain));
  const target = copy.findIndex((b) => b.transactions.some((t) => t.type === 'VOTE'));
  if (target === -1) return res.json({ message: 'No votes on the ledger yet — cast a vote first.' });
  const ballot = copy[target].transactions.find((t) => t.type === 'VOTE').ballots[0];
  const before = { choice: ballot.choice, weight: ballot.weight };
  ballot.weight *= 100;
  const naive = Blockchain.validate(copy);

  // A smarter attacker also rebuilds the Merkle root and re-mines the block…
  const block = copy[target];
  block.merkleRoot = merkleRoot(block.transactions);
  mine(block);
  const remined = Blockchain.validate(copy);
  res.json({ block: target, before, after: { choice: ballot.choice, weight: ballot.weight }, naive, remined });
});

app.get('/api/activity', (req, res) => {
  const items = [];
  for (let i = chain.chain.length - 1; i >= 0 && items.length < 8; i--) {
    for (const t of chain.chain[i].transactions) items.push({ block: i, hash: chain.chain[i].hash, ...summarize(t), timestamp: t.timestamp || chain.chain[i].timestamp });
  }
  res.json(items);
});

function summarize(t) {
  const poll = t.pollId && db.polls.find((p) => p.id === t.pollId);
  const base = { type: t.type, timestamp: t.timestamp };
  switch (t.type) {
    case 'TOKEN_ISSUE': return { ...base, text: `Voting weight ${t.amount.toLocaleString('en-US')} registered for ${t.holder.slice(0, 12)}…` };
    case 'REGISTER_IMPORT': return { ...base, text: `Participant register imported: ${t.rows} rows from ${t.fileName}` };
    case 'POLL_CREATED': return { ...base, text: `Poll opened: ${t.title}` };
    case 'VOTE': return { ...base, text: `${t.mode === 'open' ? 'Roll-call vote' : 'Secret ballot'} (${t.ballots.reduce((s, b) => s + b.weight, 0).toLocaleString('en-US')} votes) in “${poll?.title || 'poll'}”` };
    case 'POLL_CLOSED': return { ...base, text: `Poll closed — ${t.decision}` };
    default: return { ...base, text: 'Genesis block — validator set registered' };
  }
}

app.get('/api/stats', (req, res) => {
  const votes = chain.transactions((t) => t.type === 'VOTE');
  res.json({
    blocks: chain.chain.length,
    votes: votes.length,
    tokensVoted: votes.reduce((s, t) => s + t.ballots.reduce((a, b) => a + b.weight, 0), 0),
    polls: db.polls.length,
    activePolls: db.polls.filter((p) => pollStatus(p) === 'active').length,
    shareholders: db.users.filter((u) => u.role === 'shareholder').length,
    totalSupply: totalSupply(),
    org: db.data.org,
    validators: chain.validators.length,
    valid: chain.verify().valid,
  });
});

// Independent audit report for one poll — everything needed to re-check the result.
app.get('/api/polls/:id/audit', (req, res) => {
  const poll = db.polls.find((p) => p.id === req.params.id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  const related = chain.transactions((t) => t.pollId === poll.id);
  const viewer = optionalUser(req);
  const names = Object.fromEntries(db.users.map((u) => [pseudonym(u.id), u.name]));
  const report = {
    org: db.data.org,
    poll: { id: poll.id, title: poll.title, description: poll.description, options: poll.options, kind: poll.kind, mode: poll.mode, quorum: poll.quorum, startsAt: poll.startsAt, endsAt: poll.endsAt, status: pollStatus(poll) },
    results: tally(poll),
    created: related.find((t) => t.type === 'POLL_CREATED'),
    closed: related.find((t) => t.type === 'POLL_CLOSED') || null,
    votes: related.filter((t) => t.type === 'VOTE').map((t) => ({ id: t.id, timestamp: t.timestamp, block: t.blockIndex, blockHash: t.blockHash, voter: t.voter, ballots: t.ballots })),
    // Names for a roll-call vote are personal data: only the organizer sees them.
    rollCall: poll.mode === 'open' && viewer?.role === 'admin'
      ? related.filter((t) => t.type === 'VOTE').map((t) => ({ name: names[t.voter] || t.voter, ballots: t.ballots }))
      : null,
    ballotsIssuedTo: db.participation.filter((x) => x.pollId === poll.id).length,
    chain: { ...chain.verify(), head: chain.latest.hash, validators: chain.validators.map((v) => v.name) },
    generatedAt: new Date().toISOString(),
  };
  report.reportHash = sha256(JSON.stringify(report));
  res.json(report);
});

// ---------- live updates (Server-Sent Events) ----------
const clients = new Set();
app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
});
chain.on('block', (b) => {
  const msg = `data: ${JSON.stringify({ index: b.index, hash: b.hash, items: b.transactions.map(summarize), pollIds: b.transactions.map((t) => t.pollId).filter(Boolean) })}\n\n`;
  for (const c of clients) c.write(msg);
});
setInterval(() => clients.forEach((c) => c.write(': ping\n\n')), 25e3);

// ---------- sales leads (landing page form) ----------
app.post('/api/leads', (req, res) => {
  const name = str(req.body?.name, 80);
  const email = str(req.body?.email, 120);
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Name and a valid email are required' });
  db.leads.push({ id: crypto.randomUUID(), name, email, company: str(req.body?.company, 120), plan: str(req.body?.plan, 40), message: str(req.body?.message, 1000), createdAt: new Date().toISOString() });
  db.save();
  res.status(201).json({ ok: true });
});

app.get('/api/leads', auth, adminOnly, (req, res) => res.json(db.leads.slice().reverse()));

// ---------- demo data ----------
function seedVote(user, poll, allocation) {
  // Runs the exact same blind-signature protocol a browser does.
  const coins = [];
  for (const [choice, amount] of Object.entries(allocation)) {
    for (const denom of decompose(amount)) {
      const nonce = crypto.randomBytes(32).toString('hex');
      const pub = signers[denom].publicKey;
      const { blinded, r } = blind(coinMessage(poll.id, denom, nonce), pub);
      coins.push({ denom, nonce, choice, signature: unblind(signers[denom].sign(blinded), r, pub) });
    }
  }
  db.participation.push({ pollId: poll.id, userId: user.id, issuedAt: new Date().toISOString() });
  castBallots(poll.id, coins, sha256(crypto.randomBytes(24).toString('hex')));
}

function seed() {
  if (db.users.length) return;
  db.data.org = { name: 'Steppe Agro Cooperative', type: 'Agricultural cooperative', city: 'Almaty' };
  db.users.push({ id: crypto.randomUUID(), name: 'Board Secretary', email: 'admin@securevote.io', password: hashPassword('admin123'), role: 'admin' });
  const members = [
    ['Aigerim Sadykova', 'aigerim', 4000],
    ['Daniyar Akhmetov', 'daniyar', 2500],
    ['Madina Omarova', 'madina', 1500],
    ['Yerlan Nurlanov', 'yerlan', 1200],
    ['Saule Bekova', 'saule', 800],
  ].map(([name, login, weight]) => addShareholder(name, `${login}@securevote.io`, 'demo123', weight, 'Verified member register, 1 Oct 2026').user);

  const budget = createPoll({
    title: 'Approve the 2027 operating budget (48.5 million ₸)',
    description: 'The Management Board proposes an operating budget of 48.5 million ₸ for 2027, including storage modernisation and member training.',
    options: ['For', 'Against', 'Abstain'], kind: 'ordinary', mode: 'secret', quorum: 50, hours: 7 * 24,
  });
  createPoll({
    title: 'Amend the Charter to allow remote general meetings',
    description: 'Adds Article 9.4 so that general meetings may be held remotely with electronic voting. Charter amendments require a two-thirds majority. Roll-call vote.',
    options: ['For', 'Against', 'Abstain'], kind: 'special', mode: 'open', quorum: 60, hours: 5 * 24,
  });
  createPoll({
    title: 'Elect the Chair of the Management Board',
    description: 'Members elect the Chair of the Management Board for a three-year term by secret ballot.',
    options: ['Aslan Zhaksybekov', 'Gulnara Iskakova', 'Timur Abenov'], kind: 'ordinary', mode: 'secret', quorum: 40, hours: 3 * 24,
  });
  seedVote(members[3], budget, { For: 1000, Against: 200 }); // split vote
  seedVote(members[4], budget, { Against: 800 });
  console.log('Demo data created.');
}

seed();
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal server error' });
});
app.listen(PORT, () => console.log(`SecureVote running on http://localhost:${PORT}`));

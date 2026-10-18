const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { Blockchain, sha256 } = require('./src/blockchain');
const { Store } = require('./src/store');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

const chain = new Blockchain(path.join(DATA_DIR, 'chain.json'));
const db = new Store(path.join(DATA_DIR, 'db.json'));
const sessions = new Map(); // token -> userId

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// ---------- helpers ----------
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) =>
  `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;

const checkPassword = (password, stored) => {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
};

// Public pseudonym of a holder on the ledger — never the real identity.
const pseudonym = (userId) => 'SV' + sha256('holder:' + userId).slice(0, 38);

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, shares: u.shares, tokens: balanceOf(u.id), address: pseudonym(u.id) });

const balanceOf = (userId) =>
  chain.transactions((t) => t.type === 'TOKEN_ISSUE' && t.holder === pseudonym(userId)).reduce((s, t) => s + t.amount, 0);

const totalSupply = () => chain.transactions((t) => t.type === 'TOKEN_ISSUE').reduce((s, t) => s + t.amount, 0);

const pollStatus = (p) => {
  const now = Date.now();
  if (p.closed || now > new Date(p.endsAt).getTime()) return 'closed';
  if (now < new Date(p.startsAt).getTime()) return 'upcoming';
  return 'active';
};

// Results are always tallied straight from the blockchain.
const tally = (poll) => {
  const votes = chain.transactions((t) => t.type === 'VOTE' && t.pollId === poll.id);
  const counts = Object.fromEntries(poll.options.map((o) => [o, { weight: 0, ballots: 0 }]));
  for (const v of votes) {
    if (counts[v.choice]) {
      counts[v.choice].weight += v.weight;
      counts[v.choice].ballots += 1;
    }
  }
  const castWeight = votes.reduce((s, v) => s + v.weight, 0);
  const supply = poll.supplySnapshot || totalSupply();
  return { counts, ballots: votes.length, castWeight, supply, turnout: supply ? castWeight / supply : 0 };
};

const pollView = (p, user) => ({
  ...p,
  status: pollStatus(p),
  results: tally(p),
  hasVoted: user ? db.participation.some((x) => x.pollId === p.id && x.userId === user.id) : undefined,
});

// ---------- auth middleware ----------
const auth = (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = db.users.find((u) => u.id === sessions.get(token));
  if (!user) return res.status(401).json({ error: 'Please sign in' });
  req.user = user;
  next();
};
const adminOnly = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Administrator access required' });

// ---------- auth routes ----------
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.users.find((u) => u.email.toLowerCase() === String(email || '').toLowerCase());
  if (!user || !checkPassword(String(password || ''), user.password))
    return res.status(401).json({ error: 'Invalid email or password' });
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, user.id);
  res.json({ token, user: publicUser(user) });
});

app.post('/api/auth/logout', auth, (req, res) => {
  sessions.delete((req.headers.authorization || '').replace('Bearer ', ''));
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => res.json(publicUser(req.user)));

// ---------- shareholders ----------
app.get('/api/shareholders', auth, adminOnly, (req, res) => {
  res.json({ shareholders: db.users.filter((u) => u.role === 'shareholder').map(publicUser), totalSupply: totalSupply() });
});

app.post('/api/shareholders', auth, adminOnly, (req, res) => {
  const { name, email, password, shares } = req.body || {};
  const amount = Number(shares);
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: 'Shares must be a positive whole number' });
  if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase()))
    return res.status(409).json({ error: 'A user with this email already exists' });

  const user = { id: crypto.randomUUID(), name, email, password: hashPassword(password), role: 'shareholder', shares: amount };
  db.users.push(user);
  db.save();
  // 1 share = 1 voting token, minted on-chain
  const { block } = chain.addTransaction({ type: 'TOKEN_ISSUE', holder: pseudonym(user.id), amount });
  res.status(201).json({ shareholder: publicUser(user), block: block.index });
});

// ---------- polls ----------
app.get('/api/polls', auth, (req, res) => {
  res.json(db.polls.slice().reverse().map((p) => pollView(p, req.user)));
});

app.get('/api/polls/:id', auth, (req, res) => {
  const poll = db.polls.find((p) => p.id === req.params.id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  res.json(pollView(poll, req.user));
});

app.post('/api/polls', auth, adminOnly, (req, res) => {
  const { title, description, options, durationHours } = req.body || {};
  const opts = (Array.isArray(options) ? options : []).map((o) => String(o).trim()).filter(Boolean);
  if (!title) return res.status(400).json({ error: 'Title is required' });
  if (opts.length < 2 || new Set(opts).size !== opts.length)
    return res.status(400).json({ error: 'Provide at least two unique options' });
  const hours = Math.min(Math.max(Number(durationHours) || 72, 1), 24 * 60);
  const poll = {
    id: crypto.randomUUID(),
    title,
    description: description || '',
    options: opts,
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + hours * 3600e3).toISOString(),
    supplySnapshot: totalSupply(),
    closed: false,
  };
  db.polls.push(poll);
  db.save();
  chain.addTransaction({ type: 'POLL_CREATED', pollId: poll.id, title, options: opts, endsAt: poll.endsAt, rulesHash: sha256(JSON.stringify(poll)) });
  res.status(201).json(pollView(poll, req.user));
});

app.post('/api/polls/:id/close', auth, adminOnly, (req, res) => {
  const poll = db.polls.find((p) => p.id === req.params.id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  if (pollStatus(poll) === 'closed') return res.status(400).json({ error: 'Poll is already closed' });
  poll.closed = true;
  poll.endsAt = new Date().toISOString();
  db.save();
  const results = tally(poll);
  chain.addTransaction({ type: 'POLL_CLOSED', pollId: poll.id, resultsHash: sha256(JSON.stringify(results.counts)), counts: results.counts });
  res.json(pollView(poll, req.user));
});

// Anonymous vote: the ledger stores the choice, the weight and a receipt hash —
// no name, no email, no pseudonym. Participation is tracked off-chain only to
// stop double voting, and the two records are never linked.
app.post('/api/polls/:id/vote', auth, (req, res) => {
  if (req.user.role !== 'shareholder') return res.status(403).json({ error: 'Only shareholders can vote' });
  const poll = db.polls.find((p) => p.id === req.params.id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  if (pollStatus(poll) !== 'active') return res.status(400).json({ error: 'This poll is not open for voting' });
  if (!poll.options.includes(req.body?.choice)) return res.status(400).json({ error: 'Invalid option' });
  if (db.participation.some((x) => x.pollId === poll.id && x.userId === req.user.id))
    return res.status(409).json({ error: 'You have already voted in this poll' });
  const weight = balanceOf(req.user.id);
  if (weight <= 0) return res.status(400).json({ error: 'You hold no voting tokens' });

  db.participation.push({ pollId: poll.id, userId: req.user.id });
  db.save();

  const secret = crypto.randomBytes(24).toString('hex');
  const receipt = sha256(secret);
  const { block } = chain.addTransaction({ type: 'VOTE', pollId: poll.id, choice: req.body.choice, weight, receipt });
  res.status(201).json({ secret, receipt, block: block.index, blockHash: block.hash, weight });
});

// ---------- public ledger ----------
app.get('/api/chain', (req, res) => {
  res.json({ difficulty: chain.difficulty, length: chain.chain.length, blocks: chain.chain.slice().reverse() });
});

app.get('/api/chain/verify', (req, res) => res.json(chain.verify()));

// Show what happens if someone edits a recorded vote: validated on a copy, the real chain is untouched.
app.get('/api/chain/tamper-demo', (req, res) => {
  const copy = JSON.parse(JSON.stringify(chain.chain));
  const target = copy.findIndex((b) => b.transactions.some((t) => t.type === 'VOTE'));
  if (target === -1) return res.json({ message: 'No votes on the ledger yet — cast a vote first.' });
  const tx = copy[target].transactions.find((t) => t.type === 'VOTE');
  const before = { choice: tx.choice, weight: tx.weight };
  tx.weight = tx.weight * 100;
  res.json({ block: target, before, after: { choice: tx.choice, weight: tx.weight }, validation: Blockchain.validate(copy) });
});

app.post('/api/receipts/verify', (req, res) => {
  const secret = String(req.body?.secret || '').trim();
  if (!secret) return res.status(400).json({ error: 'Enter your receipt code' });
  const receipt = sha256(secret);
  const vote = chain.transactions((t) => t.type === 'VOTE' && t.receipt === receipt)[0];
  if (!vote) return res.json({ found: false });
  const poll = db.polls.find((p) => p.id === vote.pollId);
  res.json({ found: true, poll: poll?.title, choice: vote.choice, weight: vote.weight, block: vote.blockIndex, blockHash: vote.blockHash, timestamp: vote.timestamp });
});

app.get('/api/stats', (req, res) => {
  res.json({
    blocks: chain.chain.length,
    votes: chain.transactions((t) => t.type === 'VOTE').length,
    polls: db.polls.length,
    shareholders: db.users.filter((u) => u.role === 'shareholder').length,
    totalSupply: totalSupply(),
    valid: chain.verify().valid,
  });
});

// ---------- sales leads (landing page form) ----------
app.post('/api/leads', (req, res) => {
  const { name, email, company, plan, message } = req.body || {};
  if (!name || !email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Name and a valid email are required' });
  db.leads.push({ id: crypto.randomUUID(), name, email, company: company || '', plan: plan || '', message: message || '', createdAt: new Date().toISOString() });
  db.save();
  res.status(201).json({ ok: true });
});

app.get('/api/leads', auth, adminOnly, (req, res) => res.json(db.leads.slice().reverse()));

// ---------- demo data ----------
function seed() {
  if (db.users.length) return;
  db.users.push({ id: crypto.randomUUID(), name: 'Corporate Secretary', email: 'admin@securevote.io', password: hashPassword('admin123'), role: 'admin', shares: 0 });
  const holders = [
    ['Alice Johnson', 'alice@securevote.io', 5000],
    ['Bob Smith', 'bob@securevote.io', 3000],
    ['Carol White', 'carol@securevote.io', 2000],
  ];
  for (const [name, email, shares] of holders) {
    const u = { id: crypto.randomUUID(), name, email, password: hashPassword('demo123'), role: 'shareholder', shares };
    db.users.push(u);
    chain.addTransaction({ type: 'TOKEN_ISSUE', holder: pseudonym(u.id), amount: shares });
  }
  const poll = {
    id: crypto.randomUUID(),
    title: 'Approve 2026 dividend of $1.20 per share',
    description: 'The Board recommends a final dividend of $1.20 per ordinary share for the fiscal year 2026.',
    options: ['For', 'Against', 'Abstain'],
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 7 * 24 * 3600e3).toISOString(),
    supplySnapshot: totalSupply(),
    closed: false,
  };
  db.polls.push(poll);
  db.save();
  chain.addTransaction({ type: 'POLL_CREATED', pollId: poll.id, title: poll.title, options: poll.options, endsAt: poll.endsAt, rulesHash: sha256(JSON.stringify(poll)) });
  console.log('Demo data created.');
}

seed();
app.get('/api/*', (req, res) => res.status(404).json({ error: 'Not found' }));
app.listen(PORT, () => console.log(`SecureVote running on http://localhost:${PORT}`));

# SecureVote — Secure Corporate Voting on the Blockchain

SecureVote is a full-stack web platform for shareholder voting. Each shareholder receives digital
voting tokens proportional to their stake (1 share = 1 token). Ballots are anonymous, results are
recorded instantly, and every vote is sealed in a tamper-evident blockchain ledger.

## Tech stack
- **Backend:** Node.js + Express, REST API, custom blockchain (SHA-256 hash chain + proof-of-work)
- **Frontend:** HTML, CSS, vanilla JavaScript (landing page, dashboard, ledger explorer)
- **Storage:** JSON files in `data/` (created automatically)

## Run
```bash
npm install
npm start          # http://localhost:3000
```

## Demo accounts
| Role | Email | Password |
|------|-------|----------|
| Admin (corporate secretary) | admin@securevote.io | admin123 |
| Shareholder, 5,000 shares | alice@securevote.io | demo123 |
| Shareholder, 3,000 shares | bob@securevote.io | demo123 |
| Shareholder, 2,000 shares | carol@securevote.io | demo123 |

Delete the `data/` folder to reset the demo.

## Pages
- `/` — landing page: problem, solution, target markets, B2B pricing, contact form
- `/app` — dashboard. Admin: create polls, close polls, add shareholders (mints tokens), view leads.
  Shareholder: vote with token weight, get a private receipt, verify the vote on-chain.
- `/explorer` — public block explorer, full-chain integrity check, tamper simulation

## How security works
- **Immutability:** every action (token issue, poll creation, vote, poll close) is mined into a block
  containing the hash of the previous block. Editing any vote changes its hash and breaks the chain.
- **Anonymity:** a VOTE transaction stores only the poll, the choice, the token weight and a receipt hash —
  no name, email or wallet address. Who has voted is tracked separately (off-chain) only to prevent double voting.
- **Verifiability:** the voter gets a random secret; its SHA-256 hash is the receipt stored on-chain,
  so the voter can prove their ballot was counted without revealing identity.
- **Results** are always tallied directly from the blockchain.

## API overview
| Method | Endpoint | Access |
|--------|----------|--------|
| POST | /api/auth/login | public |
| GET | /api/me | signed in |
| GET/POST | /api/shareholders | admin |
| GET | /api/polls, /api/polls/:id | signed in |
| POST | /api/polls | admin |
| POST | /api/polls/:id/close | admin |
| POST | /api/polls/:id/vote | shareholder |
| GET | /api/chain, /api/chain/verify, /api/chain/tamper-demo | public |
| POST | /api/receipts/verify | public |
| GET | /api/stats | public |
| POST | /api/leads (GET: admin) | public |

> Note: this is an MVP/demo. A production version would run on a distributed network of nodes
> (e.g. Hyperledger Fabric or an Ethereum L2) and use cryptographic anonymity (blind signatures / zk-proofs).

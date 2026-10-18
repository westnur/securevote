# SecureVote — Tamper-proof Corporate Voting on the Blockchain

SecureVote is a full-stack platform for shareholder voting. Every share becomes a digital voting
token, ballots are **cryptographically anonymous** (RSA blind signatures), results are final the
moment they are cast, and every ballot is sealed in a blockchain signed by independent validator nodes.

## Features
**Security & blockchain (backend)**
- **RSA blind signatures (Chaum):** the server certifies a shareholder's ballots without seeing them,
  so even the platform operator cannot link a vote to a person.
- **Anonymous submission:** ballots are submitted with *no login*, after a random delay.
- **Token-weighted voting:** tokens are split into denominations (1, 10, 100, 1,000 …); each becomes a
  blind-signed ballot. **Split voting** across options is supported.
- **Nullifiers** prevent any ballot token from being used twice.
- **Permissioned blockchain:** SHA-256 hash chain, Merkle roots, light proof-of-work, and
  **Ed25519 signatures from 3 validator nodes** (2-of-3 required).
- **Governance rules:** quorum, ordinary (> 50%) and special (≥ 2/3) resolutions, elections; polls
  close automatically and the final result is written on-chain.
- **Verifiable receipts** and a one-click **audit report** (printable / PDF) for every poll.
- **Live updates** via Server-Sent Events, login rate-limiting, session expiry, security headers (CSP).

**Frontend**
- Landing page: problem, comparison, how it works, security architecture, target markets,
  **ROI calculator**, B2B pricing (per-vote / subscription), FAQ, lead form.
- Dashboard (admin & shareholder): KPIs, ownership donut chart, live ledger feed, results with quorum
  bars, step-by-step voting animation, receipts, token wallet, poll templates, shareholder register.
- Ledger explorer: visual chain, block inspector, full integrity check, two attack simulations.
- Light / dark theme, fully responsive.

## Tech stack
Node.js · Express · Node `crypto` (RSA, Ed25519, SHA-256) · BigInt · vanilla HTML/CSS/JS · Web Crypto API.
No database server needed — data is stored as JSON in `data/` (created automatically).

## Run
```bash
npm install
npm start          # http://localhost:3000
```
> Windows PowerShell: if you see "выполнение сценариев отключено", use `npm.cmd install` and `npm.cmd start`.

## Demo accounts
| Role | Email | Password |
|------|-------|----------|
| Admin (corporate secretary) | admin@securevote.io | admin123 |
| Alice — 4,000 shares | alice@securevote.io | demo123 |
| Bob — 2,500 shares | bob@securevote.io | demo123 |
| Carol — 1,500 shares | carol@securevote.io | demo123 |
| David — 1,200 shares (already voted) | david@securevote.io | demo123 |
| Emma — 800 shares (already voted) | emma@securevote.io | demo123 |

Delete the `data/` folder to reset the demo.

## How an anonymous vote works
1. The browser creates random ballot tokens worth exactly the holder's balance.
2. Each token is **blinded** with a secret random factor `r`: `m' = H(token) · rᵉ mod n`.
3. Signed in, the shareholder sends the blinded tokens; the server checks eligibility and returns `s' = m'ᵈ mod n`.
4. The browser **unblinds**: `s = s' · r⁻¹ mod n` — a valid signature on a token the server never saw.
5. Without logging in, the browser submits `{token, s, choice}`. The server verifies `sᵉ ≡ H(token)` and
   the one-time nullifier, then seals the ballot in a block signed by the validators.

## Project structure
```
server.js            REST API, voting protocol, live events
src/blockchain.js    blocks, Merkle roots, PoW, validator signatures, validation
src/rsa-blind.js     RSA blind-signature scheme (server side)
src/store.js         off-chain storage (users, polls, leads)
public/              index (landing), app (dashboard), explorer, audit
public/js/blind.js   blind-signature client (browser side)
```

## API overview
| Method | Endpoint | Access |
|--------|----------|--------|
| POST | /api/auth/login, /api/auth/logout | public / signed in |
| GET | /api/me | signed in |
| GET/POST | /api/shareholders | admin |
| GET | /api/polls, /api/polls/:id | signed in |
| POST | /api/polls, /api/polls/:id/close | admin |
| GET | /api/blind/keys | public |
| POST | /api/polls/:id/credentials | shareholder (blinded tokens) |
| POST | /api/ballots | **anonymous** |
| POST | /api/receipts/verify | public |
| GET | /api/polls/:id/audit | public |
| GET | /api/chain, /api/chain/blocks/:i, /api/chain/verify, /api/chain/tamper-demo | public |
| GET | /api/stats, /api/activity, /api/events (SSE) | public |
| POST / GET | /api/leads | public / admin |

> This is an MVP. In production the validator nodes would run on separate servers operated by
> independent parties, and keys would live in hardware security modules.

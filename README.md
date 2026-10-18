# SecureVote — Verifiable Collective Decision-Making

**SecureVote is a B2B platform for verifiable and procedurally correct collective decision-making**
for organizations in Kazakhstan. It takes an organizer from agenda and participant register to quorum,
results and draft minutes — with remote voting, verified voting weights, secret or roll-call ballots
and an integrity-protected audit trail.

> Clients don't buy blockchain — they buy a trusted, more cost-effective voting procedure with a
> result anyone can verify.

## Business model (indicative pilot pricing)
| Plan | Price | For |
|------|-------|-----|
| Single vote | 150–400k ₸ / procedure | First test on one procedure |
| Standard | 0.8–1.8M ₸ / year | Small organizations with regular votes |
| Business | 2–5M ₸ / year | Several procedure types, extended audit, integrations |
| Enterprise | 5–15M ₸ / year | Custom security, integrations, SLA |
| Implementation | 0–3M ₸ one-time | Setup, migration, training |

**Starting segment:** associations, unions, cooperatives and NGOs. Next: boards of directors;
later: condominiums (OSI/KSK) and joint-stock companies.

## Features
**Procedure**
- Participant register: add participants or **import a CSV** (name, email, weight); the file's SHA-256
  fingerprint is recorded in the audit trail as the data source.
- Voting weight per participant — a technical representation of the voting right, **not shares**.
- **Secret ballot** (RSA blind signatures — identity is kept separate from the choice) or
  **roll-call vote** (choice linked to the participant, names visible to the organizer only).
- Split voting, protection from repeat voting (nullifiers / participation list).
- Quorum, simple (> 50%) and special (≥ 2/3) majority, elections; polls close automatically.
- **Audit report** and **draft minutes in Kazakh, Russian and English** (printable / PDF).
- Private receipts so a voter can confirm their secret ballot was counted.

**Audit trail**
- SHA-256 hash chain, Merkle roots, light proof-of-work, Ed25519 signatures from 3 validator nodes
  (2-of-3). Later changes are **detected** (see the attack simulation in the explorer).
- Personal data (names, emails) is stored off the trail; only pseudonyms and minimal metadata are recorded.

**Website**
- Landing: problem, value, how it works, segments, differentiation, trust & security (incl. what the
  technology does *not* guarantee), savings estimate in ₸, pricing, pilot program, FAQ, pilot form.
- Dashboard for organizer and participants, audit-trail explorer, light/dark theme, responsive.

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
| Organizer (Board Secretary) | admin@securevote.io | admin123 |
| Aigerim Sadykova — 4,000 votes | aigerim@securevote.io | demo123 |
| Daniyar Akhmetov — 2,500 votes | daniyar@securevote.io | demo123 |
| Madina Omarova — 1,500 votes | madina@securevote.io | demo123 |
| Yerlan Nurlanov — 1,200 votes (already voted on the budget) | yerlan@securevote.io | demo123 |
| Saule Bekova — 800 votes (already voted on the budget) | saule@securevote.io | demo123 |

The demo organization is **Steppe Agro Cooperative** (Almaty) with three agenda items: the 2027 budget
(secret ballot), a Charter amendment (roll-call, 2/3 majority) and the election of the Chair (secret ballot).

Run `npm run reset` (or `npm.cmd run reset` on Windows) to reset the demo. Data from an older version is moved to a backup folder automatically.

## How a secret ballot works
1. The browser creates random ballot tokens worth exactly the participant's voting weight.
2. Each token is **blinded** with a secret random factor `r`: `m' = H(token) · rᵉ mod n`.
3. Signed in, the participant sends the blinded tokens; the server checks eligibility and returns `s' = m'ᵈ mod n`.
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
| POST | /api/shareholders/import | admin (CSV register import) |
| POST | /api/polls/:id/credentials | participant — secret ballot, blinded tokens |
| POST | /api/ballots | secret ballot submission, **no login** |
| POST | /api/polls/:id/vote | participant — roll-call vote |
| POST | /api/receipts/verify | public |
| GET | /api/polls/:id/audit | public |
| GET | /api/chain, /api/chain/blocks/:i, /api/chain/verify, /api/chain/tamper-demo | public |
| GET | /api/stats, /api/activity, /api/events (SSE) | public |
| POST / GET | /api/leads | public / admin |

> This is an MVP for demonstration. The legal significance of results depends on following the
> applicable procedure (law, charter, signatures). In production the validator nodes would be operated
> by independent parties, keys would live in hardware security modules, and personal data would be
> hosted in Kazakhstan where required.

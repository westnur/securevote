const TYPE_LABEL = { GENESIS: 'Genesis', TOKEN_ISSUE: 'Token issue', POLL_CREATED: 'Poll opened', VOTE: 'Ballot', POLL_CLOSED: 'Poll closed' };
let blocks = [];
let selected = null;
let validators = [];

function describe(t) {
  switch (t.type) {
    case 'GENESIS': return `Ledger created with ${t.validators.length} validators; ${t.quorum} signatures required per block.`;
    case 'TOKEN_ISSUE': return `${fmt(t.amount)} voting tokens minted to pseudonymous address ${t.holder}.`;
    case 'POLL_CREATED': return `Poll “${esc(t.title)}” opened · ${t.kind} resolution · quorum ${t.quorum}% · options: ${t.options.map(esc).join(', ')}.`;
    case 'VOTE': return `Anonymous submission of ${t.ballots.length} blind-signed ballot token(s): ${t.ballots.map((b) => `${fmt(b.weight)} → ${esc(b.choice)}`).join(', ')}. No voter identity is recorded.`;
    case 'POLL_CLOSED': return `Poll closed — decision: <b>${esc(t.decision)}</b>, turnout ${pct(t.turnout, 1)}.`;
    default: return t.type;
  }
}

async function load(flashIndex) {
  const data = await fetch('/api/chain?limit=60').then((r) => r.json());
  blocks = data.blocks;
  validators = data.validators;
  const stats = await fetch('/api/stats').then((r) => r.json());
  $('#kpis').innerHTML = [
    ['Blocks', fmt(data.length)],
    ['Anonymous submissions', fmt(stats.votes)],
    ['Proof-of-work difficulty', data.difficulty + ' leading zeros'],
    ['Validators', `${validators.length} · 2-of-3 quorum`],
  ].map(([l, v]) => `<div class="card kpi"><div class="label">${l}</div><div class="value" style="font-size:1.4rem">${v}</div></div>`).join('');

  $('#strip').innerHTML = blocks.map((b, i) => `${i ? '<span class="chain-link"></span>' : ''}
    <button class="chain-block ${selected === b.index ? 'sel' : ''}" data-i="${b.index}">
      <div class="bt">${TYPE_LABEL[b.transactions[0].type]}</div><div class="bn">#${b.index}</div>
      <div class="bh">${b.hash.slice(0, 18)}…</div><div class="small muted">${ago(b.timestamp)}</div>
    </button>`).join('');
  $$('.chain-block').forEach((el) => el.addEventListener('click', () => show(+el.dataset.i)));

  $('#validators').innerHTML = validators.map((v) => `<div class="validator"><span class="icon" style="margin:0;width:40px;height:40px">${icon('server')}</span>
    <div style="min-width:0"><b style="font-size:.92rem">${esc(v.name)}</b><div class="small muted">${esc(v.location)} · Ed25519</div></div><span class="badge badge-active">online</span></div>`).join('');

  show(selected ?? flashIndex ?? blocks[0].index);
}

async function show(index) {
  selected = index;
  $$('.chain-block').forEach((el) => el.classList.toggle('sel', +el.dataset.i === index));
  const b = blocks.find((x) => x.index === index) || (await fetch('/api/chain/blocks/' + index).then((r) => r.json()));
  $('#detail').innerHTML = `
    <div class="spread"><h3 style="margin:0">Block #${b.index}</h3><span class="badge badge-outline">${TYPE_LABEL[b.transactions[0].type]}</span></div>
    <dl class="kv" style="margin-top:16px">
      <dt>Timestamp</dt><dd>${new Date(b.timestamp).toLocaleString('en-US')}</dd>
      <dt>Block hash</dt><dd class="mono">${b.hash}</dd>
      <dt>Previous hash</dt><dd class="mono">${b.index ? `<a href="#" data-goto="${b.index - 1}">${b.previousHash}</a>` : b.previousHash}</dd>
      <dt>Merkle root</dt><dd class="mono">${b.merkleRoot}</dd>
      <dt>Nonce (PoW)</dt><dd>${fmt(b.nonce)}</dd>
      <dt>Proposer</dt><dd>${b.proposer}</dd>
      <dt>Signatures</dt><dd>${b.signatures.map((s) => `<span class="badge badge-active" style="margin:0 4px 4px 0">✓ ${s.validator}</span>`).join('')}</dd>
    </dl>
    ${b.transactions.map((t) => `<div class="tx"><b style="color:var(--brand)">${t.type}</b> — ${describe(t)}<pre>${esc(JSON.stringify(t, null, 2))}</pre></div>`).join('')}`;
  $$('[data-goto]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); show(+a.dataset.goto); }));
}

$('#verify').addEventListener('click', async () => {
  const r = await fetch('/api/chain/verify').then((x) => x.json());
  $('#verify-msg').innerHTML = r.valid
    ? `<div class="alert alert-success">✓ All ${fmt(r.blocks)} blocks valid — Merkle roots, hashes, links, PoW and validator signatures checked in ${r.ms} ms.</div>`
    : `<div class="alert alert-error">✕ Chain broken at block #${r.brokenAt}: ${esc(r.reason)}</div>`;
});

$('#tamper').addEventListener('click', async () => {
  const r = await fetch('/api/chain/tamper-demo').then((x) => x.json());
  if (r.message) return ($('#tamper-msg').innerHTML = `<div class="alert alert-info">${esc(r.message)}</div>`);
  $('#tamper-msg').innerHTML = `
    <div class="alert alert-warn">Edited block #${r.block}: “${esc(r.before.choice)}” ${fmt(r.before.weight)} → <b>${fmt(r.after.weight)}</b> votes</div>
    <div class="alert alert-error"><b>Attack 1 — edit the ballot:</b> detected. ${esc(r.naive.reason)}.</div>
    <div class="alert alert-error"><b>Attack 2 — rebuild Merkle root &amp; re-mine:</b> detected. ${esc(r.remined.reason)} — the attacker doesn't hold the validators' private keys.</div>
    <p class="small muted" style="margin:0">The real ledger was never touched.</p>`;
});

onBlocks((b) => { selected = null; load(b.index); toast(`New block #${b.index}`); });
load();

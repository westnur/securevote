const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);

const describe = (t) => ({
  GENESIS: 'Genesis block',
  TOKEN_ISSUE: `${Number(t.amount).toLocaleString()} voting tokens issued to ${t.holder}`,
  POLL_CREATED: `Poll opened: “${t.title}” — options: ${(t.options || []).join(', ')}`,
  VOTE: `Anonymous ballot: “${t.choice}” with weight ${Number(t.weight).toLocaleString()} · receipt ${String(t.receipt).slice(0, 16)}…`,
  POLL_CLOSED: `Poll closed · results hash ${String(t.resultsHash).slice(0, 16)}…`,
}[t.type] || t.type);

async function load() {
  const { blocks, length, difficulty } = await fetch('/api/chain').then((r) => r.json());
  $('chain-title').textContent = `Blocks (${length}) · proof-of-work difficulty ${difficulty}`;
  $('blocks').innerHTML = blocks.map((b) => `
    <div class="card block">
      <h3>Block #${b.index}</h3>
      <dl class="block-meta">
        <dt>Timestamp</dt><dd>${new Date(b.timestamp).toLocaleString()}</dd>
        <dt>Hash</dt><dd class="mono">${b.hash}</dd>
        <dt>Previous hash</dt><dd class="mono">${b.previousHash}</dd>
        <dt>Nonce</dt><dd>${b.nonce}</dd>
      </dl>
      ${b.transactions.map((t) => `<div class="tx"><span class="tx-type">${t.type}</span> — ${esc(describe(t))}</div>`).join('')}
    </div>`).join('');
}

$('verify').addEventListener('click', async () => {
  const r = await fetch('/api/chain/verify').then((x) => x.json());
  $('verify-msg').innerHTML = r.valid
    ? `<div class="alert alert-success">✓ All ${r.blocks} blocks are valid. No tampering detected.</div>`
    : `<div class="alert alert-error">✗ Chain broken at block #${r.brokenAt}: ${esc(r.reason)}</div>`;
});

$('tamper').addEventListener('click', async () => {
  const r = await fetch('/api/chain/tamper-demo').then((x) => x.json());
  if (r.message) return ($('tamper-msg').innerHTML = `<div class="alert alert-info">${esc(r.message)}</div>`);
  $('tamper-msg').innerHTML = `<div class="alert alert-error">
    Changed block #${r.block}: weight ${r.before.weight.toLocaleString()} → ${r.after.weight.toLocaleString()}<br/>
    <strong>Detected instantly:</strong> ${esc(r.validation.reason)} (block #${r.validation.brokenAt}).<br/>
    The real ledger is untouched.</div>`;
});

load();

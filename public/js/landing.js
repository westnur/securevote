$$('[data-icon]').forEach((el) => (el.innerHTML = icon(el.dataset.icon)));

// ---------- live stats + hero chain ----------
const TYPE_LABEL = { GENESIS: 'Genesis', TOKEN_ISSUE: 'Tokens issued', POLL_CREATED: 'Poll opened', VOTE: 'Anonymous ballot', POLL_CLOSED: 'Poll closed' };

function heroLine(t) {
  if (t.type === 'VOTE') return `${t.ballots.length} ballot token(s) · ${fmt(t.ballots.reduce((s, b) => s + b.weight, 0))} votes`;
  if (t.type === 'TOKEN_ISSUE') return `${fmt(t.amount)} tokens → ${t.holder.slice(0, 14)}…`;
  if (t.type === 'POLL_CREATED') return esc(t.title);
  if (t.type === 'POLL_CLOSED') return `Result: ${esc(t.decision)}`;
  return '3 validators registered';
}

async function loadHero(newIndex) {
  const { blocks } = await fetch('/api/chain?limit=3').then((r) => r.json());
  $('#hero-chain').innerHTML = blocks.map((b) => {
    const t = b.transactions[0];
    return `<div class="chain-card ${b.index === newIndex ? 'new' : ''}">
      <div class="spread"><strong>Block #${b.index} · ${TYPE_LABEL[t.type]}</strong><span class="small" style="color:#64748b">${ago(b.timestamp)}</span></div>
      <div class="tx-line">${heroLine(t)}</div>
      <div class="hash">hash <b>${b.hash.slice(0, 4)}</b>${b.hash.slice(4, 30)}…</div>
      <div class="sigs">${b.signatures.map((s) => `<span class="sig">✓ ${s.validator}</span>`).join('')}</div>
    </div>`;
  }).join('');
}

async function loadStats() {
  const s = await fetch('/api/stats').then((r) => r.json());
  $('#s-blocks').textContent = fmt(s.blocks);
  $('#s-votes').textContent = fmt(s.votes);
  $('#s-tokens').textContent = fmt(s.tokensVoted);
  $('#s-valid').innerHTML = s.valid ? '<span class="grad-text">100%</span>' : '⚠';
}

loadHero();
loadStats();
onBlocks((b) => { loadHero(b.index); loadStats(); });

// ---------- ROI ----------
function roi() {
  const meetings = +$('#r-meetings').value;
  const holders = +$('#r-holders').value;
  const cost = +$('#r-cost').value;
  $('#o-meetings').textContent = meetings;
  $('#o-holders').textContent = fmt(holders);
  $('#o-cost').textContent = '$' + fmt(cost);
  let plan, price;
  if (holders > 10000) { plan = 'Enterprise'; price = 12000 + meetings * 500; }
  else if (holders <= 1000 && meetings * 490 < 4900) { plan = 'Pay per vote'; price = meetings * 490; }
  else { plan = 'Business subscription'; price = 4900; }
  const savings = Math.max(meetings * cost * 0.85 - price, 0);
  $('#roi-savings').textContent = '$' + fmt(Math.round(savings));
  $('#roi-plan').textContent = plan + (plan === 'Enterprise' ? ' (estimate)' : '');
  $('#roi-cost').textContent = '$' + fmt(price);
  $('#roi-x').textContent = (savings / price).toFixed(1) + '×';
}
$$('#roi input').forEach((i) => i.addEventListener('input', roi));
roi();

// ---------- pricing toggle ----------
$$('.billing-toggle button').forEach((b) => b.addEventListener('click', () => {
  $$('.billing-toggle button').forEach((x) => x.classList.toggle('active', x === b));
  const annual = b.dataset.bill === 'annual';
  $('#biz-price').textContent = annual ? '$4,900' : '$490';
  $('#biz-per').textContent = annual ? '/ year' : '/ month';
}));

// ---------- lead form ----------
$$('.plan-btn').forEach((b) => b.addEventListener('click', () => ($('#l-plan').value = b.dataset.plan)));

$('#lead-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const val = (id) => $('#' + id).value.trim();
  try {
    await api('/leads', { method: 'POST', auth: false, body: { name: val('l-name'), email: val('l-email'), company: val('l-company'), plan: val('l-plan'), message: val('l-message') } });
    $('#lead-msg').innerHTML = '<div class="alert alert-success">Thank you! Our team will contact you within one business day.</div>';
    e.target.reset();
  } catch (err) {
    $('#lead-msg').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
  }
});

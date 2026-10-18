$$('[data-icon]').forEach((el) => (el.innerHTML = icon(el.dataset.icon)));

// ---------- live stats + hero chain ----------
const TYPE_LABEL = { GENESIS: 'Genesis', TOKEN_ISSUE: 'Voting weight registered', REGISTER_IMPORT: 'Register imported', POLL_CREATED: 'Poll opened', VOTE: 'Ballot recorded', POLL_CLOSED: 'Poll closed' };

function heroLine(t) {
  if (t.type === 'VOTE') return `${t.mode === 'open' ? 'Roll-call vote' : 'Secret ballot'} · ${fmt(t.ballots.reduce((s, b) => s + b.weight, 0))} votes`;
  if (t.type === 'TOKEN_ISSUE') return `Weight ${fmt(t.amount)} → ${t.holder.slice(0, 14)}…`;
  if (t.type === 'REGISTER_IMPORT') return `${t.rows} participants from ${esc(t.fileName)}`;
  if (t.type === 'POLL_CREATED') return esc(t.title);
  if (t.type === 'POLL_CLOSED') return `Result: ${esc(t.decision)}`;
  return '3 validators registered';
}

async function loadHero(newIndex) {
  const { blocks } = await fetch('/api/chain?limit=3').then((r) => r.json());
  $('#hero-chain').innerHTML = blocks.map((b) => {
    const t = b.transactions[0];
    return `<div class="chain-card ${b.index === newIndex ? 'new' : ''}">
      <div class="spread"><strong>Entry #${b.index} · ${TYPE_LABEL[t.type]}</strong><span class="small" style="color:#64748b">${ago(b.timestamp)}</span></div>
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
  $('#s-valid').innerHTML = s.valid ? '<span class="grad-text">Passed</span>' : '⚠ Failed';
}

loadHero();
loadStats();
onBlocks((b) => { loadHero(b.index); loadStats(); });

// ---------- savings estimate (₸) ----------
const tenge = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M ₸' : fmt(Math.round(n / 1000) * 1000) + ' ₸');
const HOURLY = 4000;

function roi() {
  const votes = +$('#r-meetings').value;
  const people = +$('#r-holders').value;
  const hours = +$('#r-hours').value;
  const external = +$('#r-cost').value;
  $('#o-meetings').textContent = votes;
  $('#o-holders').textContent = fmt(people);
  $('#o-hours').textContent = hours + ' h';
  $('#o-cost').textContent = tenge(external);

  const current = votes * (hours * HOURLY + external);
  const after = votes * (hours * 0.4 * HOURLY + external * 0.3);
  // Mid-points of the indicative price ranges.
  let plan, price;
  if (people > 2000 || votes > 12) { plan = 'Business'; price = 3500000; }
  else if (votes <= 2) { plan = 'Single vote ×' + votes; price = votes * 275000; }
  else { plan = 'Standard'; price = 1300000; }
  const savings = current - after - price;
  $('#roi-current').textContent = tenge(current);
  $('#roi-plan').textContent = plan;
  $('#roi-cost').textContent = tenge(price);
  $('#roi-freed').textContent = fmt(Math.round(votes * hours * 0.6));
  $('#roi-savings').textContent = savings > 0 ? tenge(savings) : 'Pilot first';
}
$$('#roi input').forEach((i) => i.addEventListener('input', roi));
roi();

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

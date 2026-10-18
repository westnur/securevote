const state = { token: localStorage.getItem('sv_token'), user: null, tab: 'polls' };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString();
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) : '0.0') + '%';

async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + state.token },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') logout();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ---------- auth ----------
document.querySelectorAll('.demo').forEach((b) =>
  b.addEventListener('click', () => { $('email').value = b.dataset.email; $('password').value = b.dataset.pass; })
);

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { token, user } = await api('/auth/login', { method: 'POST', body: { email: $('email').value, password: $('password').value } });
    state.token = token;
    state.user = user;
    localStorage.setItem('sv_token', token);
    showDashboard();
  } catch (err) {
    $('login-msg').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
  }
});

$('logout').addEventListener('click', async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); logout(); });

function logout() {
  localStorage.removeItem('sv_token');
  state.token = state.user = null;
  $('dash-view').classList.add('hidden');
  $('logout').classList.add('hidden');
  $('nav-user').classList.add('hidden');
  $('login-view').classList.remove('hidden');
}

// ---------- dashboard ----------
const TABS = {
  admin: [['polls', 'Polls & results'], ['create', 'New poll'], ['holders', 'Shareholders'], ['leads', 'Sales leads']],
  shareholder: [['polls', 'My ballots'], ['receipt', 'Verify my vote']],
};

async function showDashboard() {
  state.user = await api('/me');
  $('login-view').classList.add('hidden');
  $('dash-view').classList.remove('hidden');
  $('logout').classList.remove('hidden');
  $('nav-user').classList.remove('hidden');
  $('nav-user').textContent = state.user.name;
  state.tab = 'polls';
  renderTabs();
  render();
}

function renderTabs() {
  $('tabs').innerHTML = TABS[state.user.role]
    .map(([id, label]) => `<button class="tab ${state.tab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('');
  $('tabs').querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { state.tab = t.dataset.tab; renderTabs(); render(); }));
}

async function renderSummary(polls) {
  const u = state.user;
  const active = polls.filter((p) => p.status === 'active').length;
  const stats = await fetch('/api/stats').then((r) => r.json());
  const cards = u.role === 'admin'
    ? [['Shareholders', fmt(stats.shareholders)], ['Voting tokens issued', fmt(stats.totalSupply)], ['Active polls', active]]
    : [['Your voting tokens', fmt(u.tokens)], ['Your voting power', pct(u.tokens, stats.totalSupply)], ['Polls awaiting your vote', polls.filter((p) => p.status === 'active' && !p.hasVoted).length]];
  $('summary').innerHTML = cards.map(([k, v]) => `<div class="card stat"><b>${v}</b><span>${k}</span></div>`).join('');
}

async function render() {
  const el = $('tab-content');
  try {
    const polls = await api('/polls');
    renderSummary(polls);
    if (state.tab === 'polls') el.innerHTML = polls.length ? polls.map(pollCard).join('') : '<div class="card"><p>No polls yet.</p></div>';
    if (state.tab === 'create') el.innerHTML = createPollForm();
    if (state.tab === 'holders') el.innerHTML = await holdersView();
    if (state.tab === 'leads') el.innerHTML = await leadsView();
    if (state.tab === 'receipt') el.innerHTML = receiptView();
    bind();
  } catch (err) {
    el.innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
  }
}

function resultsBars(p) {
  const r = p.results;
  return p.options.map((o) => {
    const c = r.counts[o];
    return `<div class="bar"><div class="bar-head"><span>${esc(o)}</span><span>${fmt(c.weight)} tokens · ${pct(c.weight, r.castWeight)}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${r.castWeight ? (c.weight / r.castWeight) * 100 : 0}%"></div></div></div>`;
  }).join('') + `<p class="muted" style="font-size:.88rem;margin:10px 0 0">${r.ballots} ballot(s) · turnout ${pct(r.castWeight, r.supply)} of ${fmt(r.supply)} tokens</p>`;
}

function pollCard(p) {
  const isHolder = state.user.role === 'shareholder';
  const canVote = isHolder && p.status === 'active' && !p.hasVoted;
  const showResults = !isHolder || p.hasVoted || p.status === 'closed';
  return `<div class="card poll">
    <div class="poll-head">
      <div><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p></div>
      <span class="badge badge-${p.status}">${p.status}</span>
    </div>
    <p class="muted" style="font-size:.85rem;margin-top:8px">Closes ${new Date(p.endsAt).toLocaleString()}</p>
    ${canVote ? `<form class="vote-form" data-id="${p.id}">
        <div class="options">${p.options.map((o) => `<label class="option"><input type="radio" name="choice" value="${esc(o)}" required /> ${esc(o)}</label>`).join('')}</div>
        <button class="btn">Cast anonymous vote (${fmt(state.user.tokens)} tokens)</button>
        <div class="vote-msg" style="margin-top:12px"></div>
      </form>` : ''}
    ${isHolder && p.hasVoted ? '<div class="alert alert-success" style="margin-top:12px">✓ Your vote is recorded on the blockchain.</div>' : ''}
    ${showResults ? resultsBars(p) : ''}
    ${!isHolder && p.status === 'active' ? `<button class="btn btn-danger btn-sm close-poll" data-id="${p.id}" style="margin-top:14px">Close poll now</button>` : ''}
  </div>`;
}

function createPollForm() {
  return `<form id="poll-form" class="card" style="max-width:640px">
    <h3>Create a new resolution</h3>
    <div id="poll-msg"></div>
    <div class="field"><label>Title</label><input name="title" required placeholder="e.g. Elect Jane Doe to the Board" /></div>
    <div class="field"><label>Description</label><textarea name="description" rows="3"></textarea></div>
    <div class="field"><label>Options (one per line)</label><textarea name="options" rows="3">For\nAgainst\nAbstain</textarea></div>
    <div class="field"><label>Duration (hours)</label><input name="durationHours" type="number" min="1" value="72" /></div>
    <button class="btn">Publish to blockchain</button>
  </form>`;
}

async function holdersView() {
  const { shareholders, totalSupply } = await api('/shareholders');
  return `<div class="card" style="margin-bottom:20px">
      <h3>Shareholder register</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Tokens</th><th>Stake</th><th>Ledger address</th></tr></thead>
        <tbody>${shareholders.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.email)}</td><td>${fmt(s.tokens)}</td><td>${pct(s.tokens, totalSupply)}</td><td class="mono">${s.address.slice(0, 18)}…</td></tr>`).join('')}</tbody>
      </table></div>
    </div>
    <form id="holder-form" class="card" style="max-width:640px">
      <h3>Add shareholder &amp; issue tokens</h3>
      <div id="holder-msg"></div>
      <div class="form-row">
        <div class="field"><label>Full name</label><input name="name" required /></div>
        <div class="field"><label>Email</label><input name="email" type="email" required /></div>
      </div>
      <div class="form-row">
        <div class="field"><label>Temporary password</label><input name="password" required minlength="6" /></div>
        <div class="field"><label>Number of shares</label><input name="shares" type="number" min="1" required /></div>
      </div>
      <button class="btn">Issue voting tokens</button>
    </form>`;
}

async function leadsView() {
  const leads = await api('/leads');
  if (!leads.length) return '<div class="card"><p>No requests from the website yet.</p></div>';
  return `<div class="card"><div class="table-wrap"><table>
    <thead><tr><th>Date</th><th>Name</th><th>Email</th><th>Organization</th><th>Plan</th><th>Message</th></tr></thead>
    <tbody>${leads.map((l) => `<tr><td>${new Date(l.createdAt).toLocaleDateString()}</td><td>${esc(l.name)}</td><td>${esc(l.email)}</td><td>${esc(l.company)}</td><td>${esc(l.plan)}</td><td>${esc(l.message)}</td></tr>`).join('')}</tbody>
  </table></div></div>`;
}

function receiptView() {
  return `<form id="receipt-form" class="card" style="max-width:640px">
    <h3>Verify your vote</h3>
    <p>Paste the private receipt code you received after voting. We hash it and look for the matching ballot on the public ledger — proving your vote was counted without revealing who you are.</p>
    <div class="field" style="margin-top:14px"><input name="secret" placeholder="Receipt code" required /></div>
    <button class="btn">Verify on blockchain</button>
    <div id="receipt-msg" style="margin-top:14px"></div>
  </form>`;
}

function bind() {
  document.querySelectorAll('.vote-form').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Mining block…';
    try {
      const r = await api(`/polls/${f.dataset.id}/vote`, { method: 'POST', body: { choice: new FormData(f).get('choice') } });
      f.outerHTML = `<div class="alert alert-success" style="margin-top:12px">
        <strong>Vote sealed in block #${r.block}.</strong><br/>
        Save your private receipt code — it's the only way to verify your ballot later:<br/>
        <code class="mono" style="display:block;margin-top:6px;padding:8px;background:#fff;border-radius:8px">${r.secret}</code>
      </div>`;
    } catch (err) {
      f.querySelector('.vote-msg').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
      btn.disabled = false;
      btn.textContent = 'Try again';
    }
  }));

  document.querySelectorAll('.close-poll').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Close this poll and record the final result on the blockchain?')) return;
    await api(`/polls/${b.dataset.id}/close`, { method: 'POST' }).catch((e) => alert(e.message));
    render();
  }));

  $('poll-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    d.options = d.options.split('\n');
    try {
      await api('/polls', { method: 'POST', body: d });
      state.tab = 'polls';
      renderTabs();
      render();
    } catch (err) {
      $('poll-msg').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
    }
  });

  $('holder-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/shareholders', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      await render();
      $('holder-msg').innerHTML = `<div class="alert alert-success">${esc(r.shareholder.name)} received ${fmt(r.shareholder.tokens)} tokens (block #${r.block}).</div>`;
    } catch (err) {
      $('holder-msg').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
    }
  });

  $('receipt-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await api('/receipts/verify', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }).catch((err) => ({ error: err.message }));
    $('receipt-msg').innerHTML = r.error
      ? `<div class="alert alert-error">${esc(r.error)}</div>`
      : r.found
        ? `<div class="alert alert-success">✓ Ballot found in block #${r.block}<br/>Poll: <b>${esc(r.poll)}</b><br/>Choice: <b>${esc(r.choice)}</b> · Weight: ${fmt(r.weight)} tokens<br/><span class="mono">${r.blockHash}</span></div>`
        : '<div class="alert alert-error">No ballot matches this receipt.</div>';
  });
}

// ---------- start ----------
if (state.token) showDashboard().catch(logout);
else logout();

const state = { user: null, view: 'overview', polls: [], stats: null, keyset: null, busy: false };

const DEMOS = [
  ['admin@securevote.io', 'admin123', 'Board Secretary', 'Organizer (admin)'],
  ['aigerim@securevote.io', 'demo123', 'Aigerim Sadykova', 'Member · 4,000 votes (40%)'],
  ['daniyar@securevote.io', 'demo123', 'Daniyar Akhmetov', 'Member · 2,500 votes (25%)'],
  ['madina@securevote.io', 'demo123', 'Madina Omarova', 'Member · 1,500 votes (15%)'],
];

const NAV = {
  admin: [['overview', 'Overview', 'grid'], ['polls', 'Polls & results', 'vote'], ['create', 'New poll', 'plus'], ['holders', 'Participants', 'users'], ['leads', 'Pilot requests', 'inbox']],
  shareholder: [['overview', 'Overview', 'grid'], ['polls', 'My ballots', 'vote'], ['verify', 'Verify my vote', 'search'], ['wallet', 'My voting rights', 'wallet']],
};

// ---------- auth ----------
$('#demo-grid').innerHTML = DEMOS.map(([e, p, n, s]) => `<button class="demo-btn" data-e="${e}" data-p="${p}"><b>${n}</b><span>${s}</span></button>`).join('');
$$('.demo-btn').forEach((b) => b.addEventListener('click', () => login(b.dataset.e, b.dataset.p)));
$('#login-form').addEventListener('submit', (e) => { e.preventDefault(); login($('#email').value, $('#password').value); });

async function login(email, password) {
  try {
    const { token } = await api('/auth/login', { method: 'POST', body: { email, password }, auth: false });
    storage.set('sv_token', token);
    start();
  } catch (err) {
    $('#login-msg').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
  }
}

async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  storage.del('sv_token');
  location.replace('/app');
}

async function start() {
  try {
    state.user = await api('/me');
  } catch {
    storage.del('sv_token');
    $('#login-view').classList.remove('hidden');
    return;
  }
  $('#login-view').classList.add('hidden');
  $('#shell').classList.remove('hidden');
  $('#live').classList.remove('hidden');
  state.view = location.hash.slice(1) || 'overview';
  if (!NAV[state.user.role].some(([id]) => id === state.view)) state.view = 'overview';
  onBlocks(onBlock);
  render();
}

// ---------- live updates ----------
let refreshTimer;
function onBlock(b) {
  const item = b.items[0];
  if (item) toast(`Entry #${b.index} recorded — ${item.text}`);
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    const typing = document.activeElement?.closest('form, .vote-box');
    if (!state.busy && !typing) render(true);
  }, 300);
}

// ---------- layout ----------
function sidebar() {
  const u = state.user;
  const awaiting = state.polls.filter((p) => p.status === 'active' && !p.hasVoted).length;
  $('#sidebar').innerHTML = NAV[u.role].map(([id, label, ic]) => `
    <button class="side-link ${state.view === id ? 'active' : ''}" data-view="${id}">${icon(ic)}${label}
      ${id === 'polls' && u.role === 'shareholder' && awaiting ? `<span class="count">${awaiting}</span>` : ''}</button>`).join('') +
    `<div class="side-user"><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="avatar">${esc(u.name.split(' ').map((w) => w[0]).join('').slice(0, 2))}</span>
      <div style="min-width:0"><div style="font-weight:600;font-size:.9rem">${esc(u.name)}</div><div class="small muted">${u.role === 'admin' ? 'Organizer' : fmt(u.tokens) + ' votes'}</div></div></div>
      <button class="side-link" id="logout" style="margin-top:10px">${icon('logout')}Sign out</button></div>`;
  $$('[data-view]').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
  $('#logout').addEventListener('click', logout);
}

function go(view) {
  state.view = view;
  history.replaceState(null, '', '#' + view);
  render();
}

async function render(quiet) {
  try {
    [state.polls, state.stats, state.user] = await Promise.all([api('/polls'), api('/stats', { auth: false }), api('/me')]);
  } catch (err) {
    if (err.status === 401) return logout();
    return toast(err.message);
  }
  sidebar();
  const views = { overview, polls: pollsView, create: createView, holders: holdersView, leads: leadsView, verify: verifyView, wallet: walletView };
  const main = $('#main');
  const scroll = window.scrollY;
  main.innerHTML = await views[state.view]();
  bindPolls(main);
  if (quiet) window.scrollTo(0, scroll);
}

const head = (title, sub, action = '') => `<div class="page-head spread"><div><h1>${title}</h1><p class="muted" style="margin:0">${sub}</p></div>${action}</div>`;
const kpi = (label, value, sub = '') => `<div class="card kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;

// ---------- overview ----------
async function overview() {
  const u = state.user, s = state.stats;
  const feed = await api('/activity', { auth: false });
  const feedHtml = `<div class="card"><div class="spread" style="margin-bottom:6px"><h3 style="margin:0">Live audit trail</h3><a class="small" href="/explorer">Open explorer →</a></div>
    <ul class="feed">${feed.map((f) => `<li><span class="fi ${f.type}">#${f.block}</span><div><div class="t">${esc(f.text)}</div><div class="s">${short(f.hash, 12)} · ${ago(f.timestamp)}</div></div></li>`).join('')}</ul></div>`;

  if (u.role === 'admin') {
    const { shareholders, totalSupply } = await api('/shareholders');
    const sorted = shareholders.slice().sort((a, b) => b.tokens - a.tokens);
    const top = sorted.slice(0, 7).map((h) => ({ label: h.name, value: h.tokens }));
    const rest = sorted.slice(7).reduce((a, h) => a + h.tokens, 0);
    if (rest) top.push({ label: 'Other', value: rest });
    const active = state.polls.filter((p) => p.status === 'active');
    return head(`Good day, ${esc(u.name)}`, `${esc(s.org?.name || 'Your organization')} · ${esc(s.org?.type || '')}`, `<button class="btn btn-grad" data-go="create">${icon('plus')} New poll</button>`) +
      `<div class="grid grid-4" style="margin-bottom:20px">
        ${kpi('Participants', fmt(s.shareholders), 'in the verified register')}
        ${kpi('Total voting weight', fmt(s.totalSupply), 'votes across all participants')}
        ${kpi('Active polls', s.activePolls, `${s.polls} total`)}
        ${kpi('Ballots recorded', fmt(s.votes), `${fmt(s.tokensVoted)} votes cast`)}
      </div>
      <div class="grid grid-2" style="margin-bottom:20px;align-items:start">
        <div class="card"><h3>Voting weight distribution</h3><p class="small">From the verified participant register</p>
          <div class="poll-grid" style="margin-top:8px">${donut(top, { center: fmt(totalSupply), sub: 'votes' })}<div>${legendBars(top)}</div></div></div>
        ${feedHtml}
      </div>
      <h3>Active polls</h3>${active.length ? active.map(pollCard).join('') : '<div class="card"><p>No active polls.</p></div>'}`;
  }

  const awaiting = state.polls.filter((p) => p.status === 'active' && !p.hasVoted);
  return head(`Welcome, ${esc(u.name.split(' ')[0])}`, `${esc(s.org?.name || '')} · your voting rights and open agenda items`) +
    `<div class="grid grid-4" style="margin-bottom:20px">
      ${kpi('Your voting weight', fmt(u.tokens), 'votes, from the verified register')}
      ${kpi('Share of all votes', pct(u.tokens, s.totalSupply), `of ${fmt(s.totalSupply)} votes`)}
      ${kpi('Awaiting your vote', awaiting.length, `${s.activePolls} active polls`)}
      ${kpi('Audit-trail integrity', s.valid ? '<span class="grad-text">Passed</span>' : '⚠ Failed', `${fmt(s.blocks)} entries · ${s.validators} validators`)}
    </div>
    <div class="grid grid-2">
      <div class="card"><h3>Awaiting your vote</h3>
        ${awaiting.length ? awaiting.map((p) => `<div class="spread" style="padding:12px 0;border-bottom:1px solid var(--line)"><div style="min-width:0;flex:1"><b style="font-size:.95rem">${esc(p.title)}</b><div class="small muted">${timeLeft(p.endsAt)} · ${p.mode === 'open' ? 'Roll-call vote' : 'Secret ballot'}</div></div><button class="btn btn-sm" data-go="polls">Vote</button></div>`).join('') : '<p>You are all caught up. ✓</p>'}
      </div>
      ${feedHtml}
    </div>`;
}

// ---------- polls ----------
async function pollsView() {
  const isAdmin = state.user.role === 'admin';
  const order = { active: 0, upcoming: 1, closed: 2 };
  const polls = state.polls.slice().sort((a, b) => order[a.status] - order[b.status]);
  return head(isAdmin ? 'Polls & results' : 'My ballots', isAdmin ? 'Results, quorum and majority are calculated automatically from the audit trail.' : 'Vote remotely with your registered voting weight. Results appear after you vote.',
    isAdmin ? `<button class="btn btn-grad" data-go="create">${icon('plus')} New poll</button>` : '') +
    (polls.length ? polls.map(pollCard).join('') : '<div class="card"><p>No polls yet.</p></div>');
}

function pollCard(p) {
  const u = state.user;
  const isHolder = u.role === 'shareholder';
  const r = p.results;
  const items = p.options.map((o) => ({ label: o, value: r.counts[o] }));
  const pending = storage.get('sv_pending_' + p.id);
  const canVote = isHolder && p.status === 'active' && !p.hasVoted;
  const showResults = !isHolder || p.hasVoted || p.status === 'closed';
  const thresholdText = p.kind === 'special' ? '≥ 66.7% For' : '> 50% For';
  const quorumPct = Math.min(r.turnout * 100, 100);

  const results = showResults ? `
    <div class="poll-grid">
      ${donut(items, { center: pct(r.castWeight, r.supply, 0), sub: 'turnout' })}
      <div>
        ${legendBars(items)}
        <div class="quorum">
          <div class="spread"><span>Turnout ${pct(r.castWeight, r.supply)} · quorum ${p.quorum}%</span><span>${r.quorumMet ? '✓ Quorum reached' : `${fmt(Math.max(Math.ceil((p.quorum / 100) * r.supply) - r.castWeight, 0))} more tokens needed`}</span></div>
          <div class="quorum-track"><div class="quorum-fill" style="width:${quorumPct}%"></div><div class="quorum-mark" style="left:${p.quorum}%" title="Quorum"></div></div>
        </div>
      </div>
    </div>` : `<div class="alert alert-info" style="margin-top:16px">🔒 Live results are hidden until you vote, so early results can't influence your decision.</div>`;

  let voteBox = '';
  if (isHolder && p.hasVoted && pending) {
    voteBox = `<div class="vote-box"><div class="alert alert-warn" style="margin:0 0 12px">Your ballots were certified but not yet submitted.</div><button class="btn btn-grad resume-btn" data-id="${p.id}">Submit my secret ballots</button></div>`;
  } else if (canVote) {
    voteBox = `<form class="vote-box" data-id="${p.id}">
      <div class="spread"><b>Cast your vote · ${fmt(u.tokens)} votes</b><label class="switch"><input type="checkbox" class="split-toggle" /> Split my vote</label></div>
      <div class="options simple">${p.options.map((o, i) => `<label class="option"><input type="radio" name="choice" value="${esc(o)}" ${i === 0 ? '' : ''} /> ${esc(o)}</label>`).join('')}</div>
      <div class="split hidden" style="margin:14px 0">${p.options.map((o) => `<div class="split-row"><label style="margin:0">${esc(o)}</label><input type="number" min="0" max="${u.tokens}" step="1" value="0" data-opt="${esc(o)}" /></div>`).join('')}
        <div class="split-total muted"></div></div>
      <button class="btn btn-grad" type="submit">${icon(p.mode === 'open' ? 'vote' : 'shield')} ${p.mode === 'open' ? 'Cast roll-call vote' : 'Cast secret ballot'}</button>
      <span class="small muted" style="margin-left:10px">${p.mode === 'open' ? 'Your name is linked to this vote (visible to the organizer)' : 'Your identity is kept separate from your choice'}</span>
    </form>`;
  } else if (isHolder && p.hasVoted) {
    voteBox = `<div class="alert alert-success" style="margin-top:16px">✓ You have voted. Your ballot is recorded in the audit trail${p.mode === 'open' ? '.' : ' — check it any time under “Verify my vote”.'}</div>`;
  }

  return `<article class="card poll">
    <div class="poll-body">
      <div class="spread" style="align-items:flex-start">
        <div style="min-width:0;flex:1">
          <div class="row" style="gap:8px;margin-bottom:10px"><span class="badge badge-${p.status}">${p.status === 'active' ? '<span class="live-dot" style="width:6px;height:6px"></span>' : ''}${p.status}</span>
            <span class="badge badge-outline">${p.kind === 'special' ? 'Special majority ≥ 2/3' : 'Simple majority'}</span>
            <span class="badge badge-outline">${p.mode === 'open' ? '👤 Roll-call vote' : '🔒 Secret ballot'}</span></div>
          <h3 style="font-size:1.2rem">${esc(p.title)}</h3>
          <p class="muted" style="margin:0">${esc(p.description)}</p>
        </div>
        ${showResults ? decisionBadge(r.decision, p.status) : ''}
      </div>
      ${results}
      ${voteBox}
    </div>
    <div class="poll-foot">
      <div class="meta"><span>⏱ ${p.status === 'active' ? timeLeft(p.endsAt) : 'Closed ' + new Date(p.endsAt).toLocaleDateString('en-US')}</span><span>🗳 ${fmt(r.ballots)} ballots</span><span>⚖ ${'For' in r.counts ? thresholdText : 'Most votes wins'}</span></div>
      <div class="row" style="gap:8px">
        <a class="btn btn-outline btn-sm" href="/audit?poll=${p.id}" target="_blank">${icon('file')} Audit report</a>
        ${!isHolder && p.status === 'active' ? `<button class="btn btn-danger btn-sm close-btn" data-id="${p.id}">Close poll</button>` : ''}
      </div>
    </div>
  </article>`;
}

function bindPolls(root) {
  $$('[data-go]', root).forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));

  $$('.vote-box[data-id]', root).forEach((form) => {
    const tokens = state.user.tokens;
    const toggle = $('.split-toggle', form);
    const inputs = $$('[data-opt]', form);
    const update = () => {
      const sum = inputs.reduce((s, i) => s + (+i.value || 0), 0);
      $('.split-total', form).innerHTML = sum === tokens ? `<span style="color:var(--good)">✓ All ${fmt(tokens)} votes allocated</span>` : `Allocated ${fmt(sum)} of ${fmt(tokens)} votes (${fmt(tokens - sum)} remaining)`;
    };
    toggle.addEventListener('change', () => {
      $('.simple', form).classList.toggle('hidden', toggle.checked);
      $('.split', form).classList.toggle('hidden', !toggle.checked);
      update();
    });
    inputs.forEach((i) => i.addEventListener('input', update));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let allocation = {};
      if (toggle.checked) {
        inputs.forEach((i) => { const v = Math.floor(+i.value || 0); if (v > 0) allocation[i.dataset.opt] = v; });
        if (Object.values(allocation).reduce((a, b) => a + b, 0) !== tokens) return toast(`Allocate exactly ${fmt(tokens)} votes`);
      } else {
        const choice = new FormData(form).get('choice');
        if (!choice) return toast('Choose an option first');
        allocation = { [choice]: tokens };
      }
      vote(state.polls.find((p) => p.id === form.dataset.id), allocation);
    });
  });

  $$('.resume-btn', root).forEach((b) => b.addEventListener('click', () => vote(state.polls.find((p) => p.id === b.dataset.id), null)));

  $$('.close-btn', root).forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Close this poll now and record the final result on the blockchain?')) return;
    try { await api(`/polls/${b.dataset.id}/close`, { method: 'POST' }); toast('Poll closed — final result recorded in the audit trail'); render(); }
    catch (err) { toast(err.message); }
  }));
}

// ---------- the voting protocol, step by step ----------
const STEPS = [
  ['Prepare ballots', 'Random ballot tokens worth your voting weight are created in your browser.'],
  ['Blind the ballots', 'Each ballot is masked with a secret random factor — the server cannot read it.'],
  ['Right-to-vote check & blind signature', 'The server checks you are in the register and signs the masked ballots.'],
  ['Unblind & verify signatures', 'Your browser removes the mask and checks every signature.'],
  ['Submission without identity', 'Ballots are sent without your login, after a random delay to prevent timing correlation.'],
  ['Recorded in the audit trail', 'Hash-chained entry with a Merkle root, signed by 3 validator nodes.'],
];
const OPEN_STEPS = [
  ['Check right to vote', 'Your registration and voting weight are verified.'],
  ['Record roll-call vote', 'Your choice is linked to your register pseudonym, as this procedure requires.'],
  ['Recorded in the audit trail', 'Hash-chained entry with a Merkle root, signed by 3 validator nodes.'],
];

function modal(html) {
  const bg = Object.assign(document.createElement('div'), { className: 'modal-bg' });
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.append(bg);
  return bg;
}

async function openVote(poll, allocation) {
  state.busy = true;
  const m = modal(`<h2 style="font-size:1.35rem">Casting your roll-call vote</h2>
    <p class="muted small" style="margin:0">${esc(poll.title)}</p>
    <ol class="steps">${OPEN_STEPS.map(([t, d], i) => `<li data-step="${i}"><span class="st">${i + 1}</span><div>${t}<small>${d}</small></div></li>`).join('')}</ol>
    <div id="vote-out"></div>`);
  const step = (i) => $$('.steps li', m).forEach((li, j) => { li.className = j < i ? 'done' : j === i ? 'doing' : ''; });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    step(0); await wait(500);
    step(1);
    const res = await api(`/polls/${poll.id}/vote`, { method: 'POST', body: { allocation } });
    await wait(400); step(2); await wait(400); step(3);
    $('#vote-out', m).innerHTML = `<div class="alert alert-success"><b>✓ Your vote is recorded in entry #${res.block}.</b><br><span class="mono">${short(res.blockHash, 18)}</span></div><div class="row"><button class="btn" id="done" style="margin-left:auto">Done</button></div>`;
  } catch (err) {
    $('#vote-out', m).innerHTML = `<div class="alert alert-error">${esc(err.message)}</div><div class="row"><button class="btn btn-outline" id="done">Close</button></div>`;
  }
  $('#done', m).onclick = () => { m.remove(); state.busy = false; render(); };
}

async function vote(poll, allocation) {
  if (poll.mode === 'open') return openVote(poll, allocation);
  state.busy = true;
  const m = modal(`<h2 style="font-size:1.35rem">Casting your secret ballot</h2>
    <p class="muted small" style="margin:0">${esc(poll.title)}</p>
    <ol class="steps">${STEPS.map(([t, d], i) => `<li data-step="${i}"><span class="st">${i + 1}</span><div>${t}<small>${d}</small></div></li>`).join('')}</ol>
    <div id="vote-out"></div>`);
  const step = (i, note) => {
    $$('.steps li', m).forEach((li, j) => { li.className = j < i ? 'done' : j === i ? 'doing' : ''; });
    if (note) $(`[data-step="${i}"] small`, m).textContent = note;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    let pending = storage.get('sv_pending_' + poll.id);
    if (!pending) {
      state.keyset ??= await api('/blind/keys', { auth: false });
      step(0);
      await wait(350);
      const coins = await Blind.prepare(poll.id, allocation, state.keyset);
      step(1, `${coins.length} ballot(s) created and masked: ${Object.entries(allocation).map(([k, v]) => `${fmt(v)} → ${k}`).join(', ')}`);
      await wait(450);
      step(2);
      const { signatures } = await api(`/polls/${poll.id}/credentials`, { method: 'POST', body: { blinded: coins.map((c) => ({ denom: c.denom, value: c.blinded })) } });
      await wait(300);
      step(3);
      const signed = await Blind.finish(poll.id, coins, signatures, state.keyset);
      pending = { coins: signed, secret: Blind.randHex(24) };
      storage.set('sv_pending_' + poll.id, pending); // survive a refresh before submission
      await wait(350);
    }
    step(4);
    await wait(800 + Math.random() * 1200);
    const receipt = await Blind.sha256Hex(pending.secret);
    const res = await api('/ballots', { method: 'POST', auth: false, body: { pollId: poll.id, coins: pending.coins, receipt } });
    step(5, `Entry #${res.block} · ${short(res.blockHash, 14)}`);
    await wait(400);
    step(6);
    storage.del('sv_pending_' + poll.id);
    const receipts = storage.get('sv_receipts', []);
    receipts.unshift({ pollId: poll.id, title: poll.title, secret: pending.secret, block: res.block, at: new Date().toISOString() });
    storage.set('sv_receipts', receipts);

    $('#vote-out', m).innerHTML = `<div class="alert alert-success" style="margin-bottom:10px"><b>✓ Your ballot is recorded in entry #${res.block}.</b></div>
      <p class="small muted" style="margin:0">Your private receipt code — the only way to verify your ballot. It is saved in this browser; download a copy too.</p>
      <div class="receipt-box">${pending.secret}</div>
      <div class="row"><button class="btn btn-outline btn-sm" id="dl">Download receipt</button><button class="btn btn-outline btn-sm" id="cp">Copy</button><button class="btn btn-sm" id="done" style="margin-left:auto">Done</button></div>`;
    $('#dl', m).onclick = () => {
      const blob = new Blob([`SecureVote ballot receipt\n\nPoll: ${poll.title}\nAudit-trail entry: #${res.block}\nEntry hash: ${res.blockHash}\nReceipt code: ${pending.secret}\n\nVerify at /app#verify or POST /api/receipts/verify\n`], { type: 'text/plain' });
      Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `securevote-receipt-block-${res.block}.txt` }).click();
    };
    $('#cp', m).onclick = () => navigator.clipboard?.writeText(pending.secret).then(() => toast('Receipt copied'));
    $('#done', m).onclick = () => { m.remove(); state.busy = false; render(); };
  } catch (err) {
    $('#vote-out', m).innerHTML = `<div class="alert alert-error">${esc(err.message)}</div><button class="btn btn-outline" id="close-m">Close</button>`;
    $('#close-m', m).onclick = () => { m.remove(); state.busy = false; render(); };
  }
}

// ---------- create poll ----------
const TEMPLATES = {
  budget: { title: 'Approve the annual budget', description: 'Members vote on the proposed annual budget.', options: 'For\nAgainst\nAbstain', kind: 'ordinary', mode: 'secret', quorum: 50 },
  chair: { title: 'Elect the Chair', description: 'Members elect the Chair for a three-year term by secret ballot.', options: 'Candidate A\nCandidate B\nCandidate C', kind: 'ordinary', mode: 'secret', quorum: 40 },
  charter: { title: 'Amend the Charter', description: 'Charter amendments require a two-thirds majority of votes cast.', options: 'For\nAgainst\nAbstain', kind: 'special', mode: 'open', quorum: 60 },
  board: { title: 'Board resolution', description: 'Roll-call vote of the board members on the proposed resolution.', options: 'For\nAgainst\nAbstain', kind: 'ordinary', mode: 'open', quorum: 50 },
};

async function createView() {
  setTimeout(() => {
    const f = $('#poll-form');
    $$('[data-tpl]').forEach((b) => b.addEventListener('click', () => {
      const t = TEMPLATES[b.dataset.tpl];
      for (const k of Object.keys(t)) f.elements[k].value = t[k];
    }));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      d.options = d.options.split('\n');
      try {
        await api('/polls', { method: 'POST', body: d });
        toast('Agenda item published');
        go('polls');
      } catch (err) {
        $('#poll-msg').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
      }
    });
  });
  return head('New poll', 'Set up an agenda item. Its rules are fingerprinted and recorded in the audit trail.') +
    `<div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr);align-items:start">
      <form id="poll-form" class="card">
        <div id="poll-msg"></div>
        <div class="field"><label>Title</label><input name="title" required maxlength="160" placeholder="e.g. Elect Jane Doe to the Board" /></div>
        <div class="field"><label>Description</label><textarea name="description" rows="3" maxlength="1000"></textarea></div>
        <div class="field"><label>Options (one per line, 2–8)</label><textarea name="options" rows="4">For\nAgainst\nAbstain</textarea><div class="hint">Use “For / Against / Abstain” for resolutions; candidate names for elections.</div></div>
        <div class="form-row">
          <div class="field"><label>Majority rule</label><select name="kind"><option value="ordinary">Simple majority (&gt; 50%)</option><option value="special">Special majority (≥ 2/3)</option></select></div>
          <div class="field"><label>Ballot type</label><select name="mode"><option value="secret">Secret ballot</option><option value="open">Roll-call (open) vote</option></select></div>
        </div>
        <div class="field"><label>Quorum (% of total voting weight)</label><input name="quorum" type="number" min="1" max="100" value="50" /></div>
        <div class="field"><label>Voting period</label><select name="durationHours"><option value="0.25">15 minutes (demo)</option><option value="1">1 hour</option><option value="24">24 hours</option><option value="72" selected>3 days</option><option value="168">7 days</option><option value="336">14 days</option></select></div>
        <button class="btn btn-grad">${icon('cube')} Publish agenda item</button>
      </form>
      <div class="card"><h3>Templates</h3><p class="small">Start from a common resolution.</p>
        <div style="display:grid;gap:8px">
          <button class="btn btn-outline" data-tpl="budget">💰 Annual budget</button>
          <button class="btn btn-outline" data-tpl="chair">🗳️ Election of the Chair</button>
          <button class="btn btn-outline" data-tpl="charter">📜 Charter amendment</button>
          <button class="btn btn-outline" data-tpl="board">👔 Board resolution</button>
        </div></div>
    </div>`;
}

// ---------- participant register ----------
async function holdersView() {
  const { shareholders, totalSupply, imports } = await api('/shareholders');
  setTimeout(() => {
    $('#holder-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await api('/shareholders', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
        toast(`${r.shareholder.name} registered with ${fmt(r.shareholder.tokens)} votes (entry #${r.block})`);
        render();
      } catch (err) {
        $('#holder-msg').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
      }
    });
    const f = $('#import-form');
    $('#csv-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) { f.csv.value = await file.text(); f.fileName.value = file.name; }
    });
    $('#csv-sample').addEventListener('click', () => {
      f.csv.value = 'name,email,weight\nAsel Tuleuova,asel@example.kz,300\nNurlan Sarsenov,nurlan@example.kz,200';
      f.fileName.value = 'members-sample.csv';
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await api('/shareholders/import', { method: 'POST', body: { csv: f.csv.value, fileName: f.fileName.value } });
        state.lastImport = r;
        toast(`${r.created.length} participants imported (entry #${r.block})`);
        render();
      } catch (err) {
        $('#import-msg').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
      }
    });
  });
  const last = state.lastImport;
  state.lastImport = null;
  return head('Participant register', `${shareholders.length} participants · total voting weight ${fmt(totalSupply)}`) +
    `<div class="alert alert-info">Voting weights are a technical representation of each participant's voting right in this organization's procedures — they do not replace shares or the official register.</div>
    ${last ? `<div class="card" style="margin-bottom:20px"><h3>Import complete — temporary passwords</h3><p class="small">Send these to participants securely; they are shown only once. Source fingerprint: <span class="mono">${last.sourceHash}</span></p>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th class="num">Weight</th><th>Temporary password</th></tr></thead>
      <tbody>${last.created.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.email)}</td><td class="num">${fmt(c.weight)}</td><td class="mono">${esc(c.password)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    <div class="card" style="margin-bottom:20px"><div class="table-wrap"><table>
      <thead><tr><th>Participant</th><th>Email</th><th class="num">Voting weight</th><th class="num">Share</th><th>Register pseudonym</th></tr></thead>
      <tbody>${shareholders.sort((a, b) => b.tokens - a.tokens).map((s) => `<tr><td><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="avatar" style="width:30px;height:30px;font-size:.72rem">${esc(s.name.split(' ').map((w) => w[0]).join('').slice(0, 2))}</span>${esc(s.name)}</div></td><td>${esc(s.email)}</td><td class="num">${fmt(s.tokens)}</td><td class="num">${pct(s.tokens, totalSupply)}</td><td class="mono">${short(s.address, 12)}</td></tr>`).join('')}</tbody>
    </table></div></div>
    <div class="grid grid-2" style="align-items:start">
      <form id="import-form" class="card">
        <h3>Import register (CSV)</h3><p class="small">Columns: name, email, voting weight. The file's SHA-256 fingerprint is recorded in the audit trail as the data source.</p>
        <div id="import-msg"></div>
        <div class="field"><input type="file" id="csv-file" accept=".csv,text/csv" /></div>
        <input type="hidden" name="fileName" value="register.csv" />
        <div class="field"><textarea name="csv" rows="5" placeholder="name,email,weight" required></textarea></div>
        <div class="row"><button class="btn btn-grad">${icon('users')} Import participants</button><button type="button" class="btn btn-ghost" id="csv-sample">Use sample</button></div>
        ${imports.length ? `<p class="small muted" style="margin:16px 0 0">Previous imports: ${imports.map((i) => `${esc(i.fileName)} (${i.rows} rows, entry #${i.block})`).join(' · ')}</p>` : ''}
      </form>
      <form id="holder-form" class="card">
        <h3>Add one participant</h3><p class="small">Only a pseudonym and the voting weight are recorded in the audit trail.</p>
        <div id="holder-msg"></div>
        <div class="form-row"><div class="field"><label>Full name</label><input name="name" required maxlength="80" /></div><div class="field"><label>Email</label><input name="email" type="email" required maxlength="120" /></div></div>
        <div class="form-row"><div class="field"><label>Temporary password</label><input name="password" required minlength="6" /></div><div class="field"><label>Voting weight</label><input name="shares" type="number" min="1" required /></div></div>
        <button class="btn btn-grad">${icon('plus')} Add participant</button>
      </form>
    </div>`;
}

async function leadsView() {
  const leads = await api('/leads');
  return head('Pilot requests', 'Applications submitted through the website.') +
    (leads.length ? `<div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Name</th><th>Email</th><th>Organization</th><th>Plan</th><th>Message</th></tr></thead>
      <tbody>${leads.map((l) => `<tr><td>${new Date(l.createdAt).toLocaleDateString('en-US')}</td><td>${esc(l.name)}</td><td>${esc(l.email)}</td><td>${esc(l.company)}</td><td><span class="badge badge-outline">${esc(l.plan)}</span></td><td>${esc(l.message)}</td></tr>`).join('')}</tbody>
    </table></div></div>` : '<div class="card"><p>No requests yet. Submit the form on the landing page to see one here.</p></div>');
}

// ---------- verify ----------
async function verifyView() {
  const receipts = storage.get('sv_receipts', []);
  setTimeout(() => {
    const check = async (secret) => {
      const out = $('#receipt-out');
      try {
        const r = await api('/receipts/verify', { method: 'POST', auth: false, body: { secret } });
        out.innerHTML = r.found
          ? `<div class="alert alert-success"><b>✓ Ballot found in audit-trail entry #${r.block}</b><br>${esc(r.poll)}<br>${r.ballots.map((b) => `${fmt(b.weight)} → <b>${esc(b.choice)}</b>`).join(' · ')}<br><span class="mono">${r.blockHash}</span></div>`
          : '<div class="alert alert-error">No ballot matches this receipt code.</div>';
      } catch (err) {
        out.innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
      }
    };
    $('#receipt-form').addEventListener('submit', (e) => { e.preventDefault(); check(e.target.secret.value); });
    $$('[data-secret]').forEach((b) => b.addEventListener('click', () => { $('#receipt-form').secret.value = b.dataset.secret; check(b.dataset.secret); }));
  });
  return head('Verify my vote', 'Confirm your secret ballot was counted, without revealing your choice to others.') +
    `<div class="grid grid-2" style="align-items:start">
      <form id="receipt-form" class="card">
        <h3>Check a receipt</h3>
        <p class="small">We hash your receipt code (SHA-256) and look for that hash in the audit trail. Only you know the code, so only you can link the ballot to yourself.</p>
        <div class="field"><input name="secret" placeholder="Paste your receipt code" required /></div>
        <button class="btn btn-grad">${icon('search')} Verify my ballot</button>
        <div id="receipt-out" style="margin-top:14px"></div>
      </form>
      <div class="card"><h3>Receipts saved in this browser</h3>
        ${receipts.length ? receipts.map((r) => `<div class="spread" style="padding:10px 0;border-bottom:1px solid var(--line)"><div style="min-width:0;flex:1"><b style="font-size:.9rem">${esc(r.title)}</b><div class="small muted">Entry #${r.block} · ${ago(r.at)}</div></div><button class="btn btn-outline btn-sm" data-secret="${esc(r.secret)}">Verify</button></div>`).join('') : '<p>No receipts yet — vote in a secret ballot to get one.</p>'}
      </div>
    </div>`;
}

// ---------- wallet ----------
async function walletView() {
  const u = state.user, s = state.stats;
  const { denominations } = (state.keyset ??= await api('/blind/keys', { auth: false }));
  const coins = {};
  let left = u.tokens;
  for (const d of denominations.slice().reverse()) while (left >= d) { coins[d] = (coins[d] || 0) + 1; left -= d; }
  return head('My voting rights', 'Your voting weight from the verified participant register.') +
    `<div class="grid grid-2" style="align-items:start">
      <div class="card">
        <h3>Share of all votes</h3>
        <div class="poll-grid" style="margin-top:8px">${donut([{ label: 'You', value: u.tokens }, { label: 'Other shareholders', value: s.totalSupply - u.tokens }], { center: pct(u.tokens, s.totalSupply, 1), sub: 'of votes' })}
        <div>${legendBars([{ label: 'You', value: u.tokens }, { label: 'Other shareholders', value: s.totalSupply - u.tokens }])}</div></div>
      </div>
      <div class="card">
        <h3>Registration</h3>
        <dl class="kv"><dt>Register pseudonym</dt><dd class="mono">${u.address}</dd><dt>Voting weight</dt><dd><b>${fmt(u.tokens)}</b> votes</dd><dt>Secret ballots per poll</dt><dd>${Object.entries(coins).reverse().map(([d, n]) => `${n} × ${fmt(d)}`).join(' + ')} blind-signed ballot tokens</dd></dl>
        <div class="alert alert-info" style="margin:16px 0 0">Your pseudonym is a one-way hash of your account. In secret ballots your choice is not linked to it; in roll-call votes it is, as that procedure requires. Voting tokens are not shares.</div>
      </div>
    </div>`;
}

start();

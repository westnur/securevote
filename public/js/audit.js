(async () => {
  const id = new URLSearchParams(location.search).get('poll');
  let a;
  try {
    a = await api('/polls/' + encodeURIComponent(id) + '/audit', { auth: false });
  } catch (err) {
    $('#doc').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
    return;
  }
  const r = a.results;
  const items = a.poll.options.map((o) => ({ label: o, value: r.counts[o] }));
  const final = a.poll.status === 'closed';
  document.title = `Audit — ${a.poll.title}`;

  $('#doc').innerHTML = `
    <div class="spread no-print" style="margin-bottom:18px"><a href="/app#polls">← Back to dashboard</a><button class="btn btn-grad" id="print">${icon('file')} Print / Save as PDF</button></div>
    <div class="card">
      <div class="spread" style="align-items:flex-start">
        <div><div class="small muted" style="text-transform:uppercase;letter-spacing:.1em;font-weight:700">Certified voting audit report</div>
          <h1 style="font-size:1.7rem;margin:6px 0">${esc(a.poll.title)}</h1><p class="muted" style="margin:0">${esc(a.poll.description)}</p></div>
        ${a.chain.valid ? '<span class="seal">✓ CHAIN VERIFIED</span>' : '<span class="decision bad">✕ CHAIN INVALID</span>'}
      </div>
      <dl class="kv" style="margin-top:20px">
        <dt>Poll ID</dt><dd class="mono">${a.poll.id}</dd>
        <dt>Resolution type</dt><dd>${a.poll.kind === 'special' ? 'Special (≥ 2/3 of votes cast)' : 'Ordinary (> 50% of votes cast)'}</dd>
        <dt>Voting period</dt><dd>${new Date(a.poll.startsAt).toLocaleString('en-US')} — ${new Date(a.poll.endsAt).toLocaleString('en-US')}</dd>
        <dt>Status</dt><dd>${final ? 'Closed — final result' : 'Open — interim result'}</dd>
        <dt>Report generated</dt><dd>${new Date(a.generatedAt).toLocaleString('en-US')}</dd>
      </dl>
    </div>

    <div class="card">
      <div class="spread"><h3 style="margin:0">Result</h3>${decisionBadge(r.decision, final ? 'closed' : 'active')}</div>
      <div class="poll-grid">${donut(items, { center: pct(r.castWeight, r.supply, 0), sub: 'turnout' })}<div>${legendBars(items)}</div></div>
      <div class="table-wrap" style="margin-top:18px"><table>
        <thead><tr><th>Option</th><th class="num">Votes (tokens)</th><th class="num">Share of votes cast</th></tr></thead>
        <tbody>${items.map((i) => `<tr><td>${esc(i.label)}</td><td class="num">${fmt(i.value)}</td><td class="num">${pct(i.value, r.castWeight)}</td></tr>`).join('')}
          <tr><td><b>Total cast</b></td><td class="num"><b>${fmt(r.castWeight)}</b></td><td class="num">${pct(r.castWeight, r.supply)} of ${fmt(r.supply)} eligible</td></tr></tbody>
      </table></div>
      <dl class="kv" style="margin-top:18px">
        <dt>Quorum</dt><dd>${a.poll.quorum}% required · ${pct(r.castWeight, r.supply)} reached · ${r.quorumMet ? '✓ met' : '✕ not met'}</dd>
        ${r.support !== null ? `<dt>Support</dt><dd>${pct(r.support, 1)} For (excluding abstentions) · threshold ${a.poll.kind === 'special' ? '66.7%' : '50%'}</dd>` : ''}
        <dt>Ballots issued</dt><dd>${a.ballotsIssuedTo} shareholder(s) received blind-signed ballots · ${a.votes.length} anonymous submission(s)</dd>
      </dl>
    </div>

    <div class="card">
      <h3>On-chain evidence</h3>
      <dl class="kv">
        <dt>Poll created</dt><dd>Block #${a.created.blockIndex} · <span class="mono">${a.created.blockHash}</span></dd>
        <dt>Rules hash</dt><dd class="mono">${a.created.rulesHash}</dd>
        ${a.closed ? `<dt>Poll closed</dt><dd>Block #${a.closed.blockIndex} · <span class="mono">${a.closed.blockHash}</span></dd><dt>Results hash</dt><dd class="mono">${a.closed.resultsHash}</dd>` : ''}
      </dl>
      <div class="table-wrap" style="margin-top:16px"><table>
        <thead><tr><th>Block</th><th>Time</th><th>Ballots (weight → choice)</th><th>Nullifiers</th></tr></thead>
        <tbody>${a.votes.map((v) => `<tr><td><a href="/explorer">#${v.block}</a></td><td>${new Date(v.timestamp).toLocaleString('en-US')}</td><td>${v.ballots.map((b) => `${fmt(b.weight)} → ${esc(b.choice)}`).join('<br>')}</td><td class="mono">${v.ballots.map((b) => b.nullifier.slice(0, 16) + '…').join('<br>')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No ballots yet</td></tr>'}</tbody>
      </table></div>
    </div>

    <div class="card">
      <h3>Ledger integrity</h3>
      <dl class="kv">
        <dt>Verification</dt><dd>${a.chain.valid ? `✓ All ${fmt(a.chain.blocks)} blocks valid (Merkle roots, hashes, links, proof-of-work, validator signatures)` : `✕ ${esc(a.chain.reason)} at block #${a.chain.brokenAt}`}</dd>
        <dt>Chain head</dt><dd class="mono">${a.chain.head}</dd>
        <dt>Validators</dt><dd>${a.chain.validators.map(esc).join(' · ')}</dd>
        <dt>Report fingerprint</dt><dd class="mono">SHA-256 ${a.reportHash}</dd>
      </dl>
      <p class="small muted" style="margin:16px 0 0">Anyone can reproduce this report: every figure is recomputed from the public ledger at <span class="mono">/api/chain</span>. Voter identities are never stored on-chain.</p>
    </div>`;
  $('#print').addEventListener('click', () => print());
})();

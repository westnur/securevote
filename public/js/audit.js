// Draft minutes in English, Russian and Kazakh.
const MIN = {
  en: { title: 'DRAFT MINUTES', sub: 'of electronic voting', org: 'Organization', item: 'Agenda item', form: 'Form of voting', secret: 'secret ballot', open: 'open (roll-call) vote', period: 'Voting period', total: 'Total voting weight of participants', cast: 'Votes cast', quorum: 'Quorum', req: 'required', met: 'present', notMet: 'not present', option: 'Option', votes: 'Votes', share: 'Share', rule: 'Majority rule', simple: 'simple majority (more than 50% of votes cast)', special: 'special majority (at least 2/3 of votes cast)', most: 'most votes', decision: 'Decision', PASSED: 'The decision is ADOPTED.', REJECTED: 'The decision is NOT ADOPTED.', NOQ: 'No quorum — the vote is not valid.', ELECTED: 'Elected:', TIE: 'The votes are tied.', NOVOTES: 'No votes were cast.', interim: 'Interim result — voting is still open.', integrity: 'Audit-trail integrity check', passed: 'passed', failed: 'failed', fp: 'Report fingerprint', roll: 'Roll-call record', chair: 'Chair', secretary: 'Secretary', date: 'Date', note: 'Draft generated automatically by SecureVote. Legal significance depends on compliance with the applicable procedure and the required signatures.', opts: {} },
  ru: { title: 'ПРОЕКТ ПРОТОКОЛА', sub: 'электронного голосования', org: 'Организация', item: 'Вопрос повестки дня', form: 'Форма голосования', secret: 'тайное голосование', open: 'открытое (поименное) голосование', period: 'Период голосования', total: 'Общее количество голосов участников', cast: 'Подано голосов', quorum: 'Кворум', req: 'требуется', met: 'имеется', notMet: 'отсутствует', option: 'Вариант', votes: 'Голоса', share: 'Доля', rule: 'Порядок принятия решения', simple: 'простое большинство (более 50% поданных голосов)', special: 'квалифицированное большинство (не менее 2/3 поданных голосов)', most: 'наибольшее число голосов', decision: 'Решение', PASSED: 'Решение ПРИНЯТО.', REJECTED: 'Решение НЕ ПРИНЯТО.', NOQ: 'Кворум отсутствует — голосование не состоялось.', ELECTED: 'Избран(а):', TIE: 'Голоса разделились поровну.', NOVOTES: 'Голоса не поданы.', interim: 'Промежуточные итоги — голосование продолжается.', integrity: 'Проверка целостности журнала', passed: 'пройдена', failed: 'не пройдена', fp: 'Цифровой отпечаток отчёта', roll: 'Поименные результаты', chair: 'Председатель', secretary: 'Секретарь', date: 'Дата', note: 'Проект сформирован автоматически системой SecureVote. Юридическая значимость зависит от соблюдения применимой процедуры и наличия необходимых подписей.', opts: { For: 'За', Against: 'Против', Abstain: 'Воздержался' } },
  kk: { title: 'ХАТТАМА ЖОБАСЫ', sub: 'электрондық дауыс беру', org: 'Ұйым', item: 'Күн тәртібіндегі мәселе', form: 'Дауыс беру нысаны', secret: 'жасырын дауыс беру', open: 'ашық (атаулы) дауыс беру', period: 'Дауыс беру кезеңі', total: 'Қатысушылардың жалпы дауыс саны', cast: 'Берілген дауыстар', quorum: 'Кворум', req: 'талап етіледі', met: 'бар', notMet: 'жоқ', option: 'Нұсқа', votes: 'Дауыстар', share: 'Үлесі', rule: 'Шешім қабылдау тәртібі', simple: 'жай көпшілік (берілген дауыстардың 50%-дан астамы)', special: 'білікті көпшілік (берілген дауыстардың кемінде 2/3 бөлігі)', most: 'ең көп дауыс', decision: 'Шешім', PASSED: 'Шешім ҚАБЫЛДАНДЫ.', REJECTED: 'Шешім ҚАБЫЛДАНБАДЫ.', NOQ: 'Кворум жоқ — дауыс беру өтпеді деп танылады.', ELECTED: 'Сайланды:', TIE: 'Дауыстар тең бөлінді.', NOVOTES: 'Дауыс берілмеді.', interim: 'Аралық нәтиже — дауыс беру жалғасуда.', integrity: 'Журнал тұтастығын тексеру', passed: 'сәтті өтті', failed: 'өтпеді', fp: 'Есептің цифрлық ізі', roll: 'Атаулы нәтижелер', chair: 'Төраға', secretary: 'Хатшы', date: 'Күні', note: 'Жобаны SecureVote жүйесі автоматты түрде жасады. Заңды күші қолданылатын рәсімнің сақталуына және қажетті қолтаңбалардың болуына байланысты.', opts: { For: 'Қолдаймын', Against: 'Қарсымын', Abstain: 'Қалыс қаламын' } },
};
const LOCALE = { en: 'en-US', ru: 'ru-RU', kk: 'kk-KZ' };

function minutes(a, lang) {
  const T = MIN[lang], r = a.results, final = a.poll.status === 'closed';
  const opt = (o) => T.opts[o] || o;
  const d = (iso) => {
    const t = new Date(iso);
    if (lang !== 'kk') return t.toLocaleString(LOCALE[lang], { dateStyle: 'long', timeStyle: 'short' });
    // Not every browser ships Kazakh month names, so format them explicitly.
    const months = ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'];
    const hm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    return `${t.getFullYear()} ж. ${t.getDate()} ${months[t.getMonth()]}, ${hm}`;
  };
  let decision;
  if (r.decision === 'PASSED') decision = T.PASSED;
  else if (r.decision === 'REJECTED') decision = T.REJECTED;
  else if (r.decision === 'NO QUORUM') decision = T.NOQ;
  else if (r.decision.startsWith('ELECTED')) decision = `${T.ELECTED} ${esc(r.decision.slice(9))}`;
  else if (r.decision === 'TIE') decision = T.TIE;
  else decision = T.NOVOTES;
  const rule = 'For' in r.counts ? (a.poll.kind === 'special' ? T.special : T.simple) : T.most;
  return `<div class="minutes">
    <h2>${T.title}</h2><div class="center">${T.sub} · ${esc(a.org?.name || '')}${a.org?.city ? ', ' + esc(a.org.city) : ''}</div>
    <p><b>${T.item}:</b> ${esc(a.poll.title)}</p>
    <p><b>${T.form}:</b> ${a.poll.mode === 'open' ? T.open : T.secret}<br>
      <b>${T.period}:</b> ${d(a.poll.startsAt)} — ${d(a.poll.endsAt)}<br>
      <b>${T.total}:</b> ${fmt(r.supply)} · <b>${T.cast}:</b> ${fmt(r.castWeight)} (${pct(r.castWeight, r.supply)})<br>
      <b>${T.quorum}</b> (${T.req} ${a.poll.quorum}%): ${r.quorumMet ? T.met : T.notMet}<br>
      <b>${T.rule}:</b> ${rule}</p>
    <table><thead><tr><th>${T.option}</th><th class="num">${T.votes}</th><th class="num">${T.share}</th></tr></thead>
      <tbody>${a.poll.options.map((o) => `<tr><td>${esc(opt(o))}</td><td class="num">${fmt(r.counts[o])}</td><td class="num">${pct(r.counts[o], r.castWeight)}</td></tr>`).join('')}</tbody></table>
    ${a.rollCall ? `<p style="margin-top:14px"><b>${T.roll}:</b> ${a.rollCall.map((v) => `${esc(v.name)} — ${v.ballots.map((b) => `${esc(opt(b.choice))} (${fmt(b.weight)})`).join(', ')}`).join('; ')}</p>` : ''}
    <p style="margin-top:14px"><b>${T.decision}:</b> ${decision}${final ? '' : ` <i>${T.interim}</i>`}</p>
    <p class="small">${T.integrity}: ${a.chain.valid ? T.passed : T.failed}. ${T.fp}: <span class="mono">${a.reportHash.slice(0, 32)}…</span></p>
    <div class="sign"><div>${T.chair}</div><div>${T.secretary}</div></div>
    <p class="small muted" style="margin-top:18px">${T.date}: ${d(a.generatedAt)}. ${T.note}</p>
  </div>`;
}

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
        <div><div class="small muted" style="text-transform:uppercase;letter-spacing:.1em;font-weight:700">Voting audit report · ${esc(a.org?.name || '')}</div>
          <h1 style="font-size:1.7rem;margin:6px 0">${esc(a.poll.title)}</h1><p class="muted" style="margin:0">${esc(a.poll.description)}</p></div>
        ${a.chain.valid ? '<span class="seal">✓ INTEGRITY CHECK PASSED</span>' : '<span class="decision bad">✕ INTEGRITY CHECK FAILED</span>'}
      </div>
      <dl class="kv" style="margin-top:20px">
        <dt>Poll ID</dt><dd class="mono">${a.poll.id}</dd>
        <dt>Majority rule</dt><dd>${a.poll.kind === 'special' ? 'Special majority (≥ 2/3 of votes cast)' : 'Simple majority (> 50% of votes cast)'}</dd>
        <dt>Ballot type</dt><dd>${a.poll.mode === 'open' ? 'Roll-call (open) vote' : 'Secret ballot (blind signatures)'}</dd>
        <dt>Voting period</dt><dd>${new Date(a.poll.startsAt).toLocaleString('en-US')} — ${new Date(a.poll.endsAt).toLocaleString('en-US')}</dd>
        <dt>Status</dt><dd>${final ? 'Closed — final result' : 'Open — interim result'}</dd>
        <dt>Report generated</dt><dd>${new Date(a.generatedAt).toLocaleString('en-US')}</dd>
      </dl>
    </div>

    <div class="card">
      <div class="spread"><h3 style="margin:0">Result</h3>${decisionBadge(r.decision, final ? 'closed' : 'active')}</div>
      <div class="poll-grid">${donut(items, { center: pct(r.castWeight, r.supply, 0), sub: 'turnout' })}<div>${legendBars(items)}</div></div>
      <div class="table-wrap" style="margin-top:18px"><table>
        <thead><tr><th>Option</th><th class="num">Votes (by weight)</th><th class="num">Share of votes cast</th></tr></thead>
        <tbody>${items.map((i) => `<tr><td>${esc(i.label)}</td><td class="num">${fmt(i.value)}</td><td class="num">${pct(i.value, r.castWeight)}</td></tr>`).join('')}
          <tr><td><b>Total cast</b></td><td class="num"><b>${fmt(r.castWeight)}</b></td><td class="num">${pct(r.castWeight, r.supply)} of ${fmt(r.supply)} eligible</td></tr></tbody>
      </table></div>
      <dl class="kv" style="margin-top:18px">
        <dt>Quorum</dt><dd>${a.poll.quorum}% required · ${pct(r.castWeight, r.supply)} reached · ${r.quorumMet ? '✓ met' : '✕ not met'}</dd>
        ${r.support !== null ? `<dt>Support</dt><dd>${pct(r.support, 1)} For (excluding abstentions) · threshold ${a.poll.kind === 'special' ? '66.7%' : '50%'}</dd>` : ''}
        <dt>Participation</dt><dd>${a.ballotsIssuedTo} participant(s) voted · ${a.votes.length} ballot submission(s)</dd>
      </dl>
    </div>

    <div class="card">
      <div class="spread"><h3 style="margin:0">Draft minutes</h3><div class="lang-tabs no-print">${['en', 'ru', 'kk'].map((l) => `<button data-lang="${l}" class="${l === 'ru' ? 'active' : ''}">${{ en: 'English', ru: 'Русский', kk: 'Қазақша' }[l]}</button>`).join('')}</div></div>
      <div id="minutes" style="margin-top:18px">${minutes(a, 'ru')}</div>
    </div>

    ${a.rollCall ? `<div class="card"><h3>Roll-call record</h3><p class="small">Visible to the organizer only.</p><div class="table-wrap"><table><thead><tr><th>Participant</th><th>Vote</th><th class="num">Weight</th></tr></thead>
      <tbody>${a.rollCall.map((v) => v.ballots.map((b) => `<tr><td>${esc(v.name)}</td><td>${esc(b.choice)}</td><td class="num">${fmt(b.weight)}</td></tr>`).join('')).join('')}</tbody></table></div></div>` : ''}

    <div class="card">
      <h3>Audit-trail evidence</h3>
      <dl class="kv">
        <dt>Poll created</dt><dd>Entry #${a.created.blockIndex} · <span class="mono">${a.created.blockHash}</span></dd>
        <dt>Rules hash</dt><dd class="mono">${a.created.rulesHash}</dd>
        ${a.closed ? `<dt>Poll closed</dt><dd>Entry #${a.closed.blockIndex} · <span class="mono">${a.closed.blockHash}</span></dd><dt>Results hash</dt><dd class="mono">${a.closed.resultsHash}</dd>` : ''}
      </dl>
      <div class="table-wrap" style="margin-top:16px"><table>
        <thead><tr><th>Entry</th><th>Time</th><th>Ballots (weight → choice)</th><th>${a.poll.mode === 'open' ? 'Voter pseudonym' : 'Nullifiers'}</th></tr></thead>
        <tbody>${a.votes.map((v) => `<tr><td><a href="/explorer">#${v.block}</a></td><td>${new Date(v.timestamp).toLocaleString('en-US')}</td><td>${v.ballots.map((b) => `${fmt(b.weight)} → ${esc(b.choice)}`).join('<br>')}</td><td class="mono">${v.voter ? v.voter.slice(0, 18) + '…' : v.ballots.map((b) => b.nullifier.slice(0, 16) + '…').join('<br>')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No ballots yet</td></tr>'}</tbody>
      </table></div>
    </div>

    <div class="card">
      <h3>Audit-trail integrity</h3>
      <dl class="kv">
        <dt>Verification</dt><dd>${a.chain.valid ? `✓ All ${fmt(a.chain.blocks)} blocks valid (Merkle roots, hashes, links, proof-of-work, validator signatures)` : `✕ ${esc(a.chain.reason)} at block #${a.chain.brokenAt}`}</dd>
        <dt>Chain head</dt><dd class="mono">${a.chain.head}</dd>
        <dt>Validators</dt><dd>${a.chain.validators.map(esc).join(' · ')}</dd>
        <dt>Report fingerprint</dt><dd class="mono">SHA-256 ${a.reportHash}</dd>
      </dl>
      <p class="small muted" style="margin:16px 0 0">Every figure is recomputed from the audit trail at <span class="mono">/api/chain</span>. Names and contacts are not stored in the trail. The legal significance of the result depends on the applicable procedure.</p>
    </div>`;
  $('#print').addEventListener('click', () => print());
  $$('[data-lang]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-lang]').forEach((x) => x.classList.toggle('active', x === b));
    $('#minutes').innerHTML = minutes(a, b.dataset.lang);
  }));
})();

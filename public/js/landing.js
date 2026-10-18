fetch('/api/stats').then((r) => r.json()).then((s) => {
  document.getElementById('s-blocks').textContent = s.blocks;
  document.getElementById('s-votes').textContent = s.votes;
  document.getElementById('s-polls').textContent = s.polls;
  document.getElementById('s-supply').textContent = s.totalSupply.toLocaleString();
  const badge = document.getElementById('chain-status');
  badge.textContent = s.valid ? 'Chain verified' : 'Integrity error';
  badge.className = 'badge ' + (s.valid ? 'badge-active' : 'badge-closed');
});

document.querySelectorAll('.plan-btn').forEach((b) =>
  b.addEventListener('click', () => (document.getElementById('l-plan').value = b.dataset.plan))
);

document.getElementById('lead-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('lead-msg');
  const val = (id) => document.getElementById(id).value.trim();
  const res = await fetch('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: val('l-name'), email: val('l-email'), company: val('l-company'), plan: val('l-plan'), message: val('l-message') }),
  });
  const data = await res.json();
  if (res.ok) {
    msg.innerHTML = '<div class="alert alert-success">Thank you! Our team will contact you shortly.</div>';
    e.target.reset();
  } else {
    msg.innerHTML = `<div class="alert alert-error">${data.error}</div>`;
  }
});

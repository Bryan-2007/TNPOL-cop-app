(function () {
  const loginPanel = document.getElementById('loginPanel');
  const dashboard = document.getElementById('dashboard');
  const form = document.getElementById('policeLoginForm');
  const formError = document.getElementById('formError');
  const statusSelect = document.getElementById('statusSelect');
  const refreshBtn = document.getElementById('refreshBtn');
  const complaintsBox = document.getElementById('policeComplaints');

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatTime(ts) {
    if (!ts) return '-';
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return String(ts);
    }
  }

  async function apiJson(url, options) {
    const res = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options && options.headers ? options.headers : {}) },
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text };
    }
    if (!res.ok) {
      const msg = (data && data.error) ? data.error : `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  async function loadComplaints() {
    if (!complaintsBox) return;
    complaintsBox.textContent = 'Loading...';
    const status = statusSelect ? statusSelect.value : 'submitted';
    const res = await fetch(`/api/police/complaints?status=${encodeURIComponent(status)}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Could not load complaints.');
    const data = await res.json();
    const complaints = data.complaints || [];

    if (!complaints.length) {
      complaintsBox.innerHTML = '<div class="muted">No complaints for this status.</div>';
      return;
    }

    complaintsBox.innerHTML = '';
    for (const c of complaints) {
      const card = document.createElement('div');
      card.className = 'card';
      const notesId = `notes_${c.id}`;
      const imgs = c.images && c.images.length ? c.images.map((u) => `<img src="${escapeHtml(u)}" alt="evidence" />`).join('') : '';

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div>
            <div class="status">Status: ${escapeHtml(c.status)}</div>
            <div class="muted">Submitted: ${escapeHtml(formatTime(c.createdAt))}</div>
            <div style="margin-top:6px;"><b>Crime Type:</b> ${escapeHtml(c.crimeType)}</div>
            <div style="margin-top:6px;"><b>Location:</b> ${escapeHtml(c.locationTag)}</div>
            <div style="margin-top:6px;"><b>Description:</b> ${escapeHtml(c.description)}</div>
            <div style="margin-top:6px;"><b>Reporter:</b> ${escapeHtml(c.reporter.displayName)} (${escapeHtml(c.reporter.email)})</div>
            ${c.reporterName ? `<div style="margin-top:6px;"><b>Contact Name:</b> ${escapeHtml(c.reporterName)}</div>` : ''}
            ${c.reporterPhone ? `<div style="margin-top:6px;"><b>Contact Phone:</b> ${escapeHtml(c.reporterPhone)}</div>` : ''}
            ${c.identityText ? `<div style="margin-top:6px;"><b>Identity (optional):</b> ${escapeHtml(c.identityText)}</div>` : ''}
            ${c.policeNotes ? `<div style="margin-top:6px;"><b>Police notes:</b> ${escapeHtml(c.policeNotes)}</div>` : ''}
          </div>
        </div>
        <div class="thumbs" style="margin-top:10px;">
          ${imgs ? imgs : '<div class="muted">No evidence images</div>'}
        </div>
        <div style="margin-top:10px;">
          <label for="${escapeHtml(notesId)}" style="margin-top:0;">Police notes (optional)</label>
          <textarea id="${escapeHtml(notesId)}" placeholder="Add verification decision notes..."></textarea>
          <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
            <button class="primary" data-action="verify" data-id="${escapeHtml(c.id)}" type="button">Verify</button>
            <button class="danger" data-action="reject" data-id="${escapeHtml(c.id)}" type="button">Reject</button>
          </div>
        </div>
      `;
      complaintsBox.appendChild(card);
    }

    complaintsBox.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');
        const notesEl = document.getElementById(`notes_${id}`);
        const policeNotes = notesEl ? notesEl.value : '';

        btn.disabled = true;
        const prevText = btn.textContent;
        btn.textContent = 'Processing...';
        try {
          await apiJson(`/api/police/complaints/${encodeURIComponent(id)}/action`, {
            method: 'POST',
            body: JSON.stringify({ action, policeNotes }),
          });
          await loadComplaints();
        } catch (e) {
          alert(e.message || 'Action failed');
          btn.disabled = false;
          btn.textContent = prevText;
        }
      });
    });
  }

  if (statusSelect) statusSelect.addEventListener('change', loadComplaints);
  if (refreshBtn) refreshBtn.addEventListener('click', loadComplaints);

  form &&
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (formError) formError.textContent = '';
      try {
        const payload = {
          username: document.getElementById('username').value,
          password: document.getElementById('password').value,
        };
        await apiJson('/api/police/login', { method: 'POST', body: JSON.stringify(payload) });
        if (loginPanel) loginPanel.classList.add('hidden');
        if (dashboard) dashboard.classList.remove('hidden');
        await loadComplaints();
      } catch (err) {
        if (formError) formError.textContent = err.message || 'Login failed';
      }
    });
})();


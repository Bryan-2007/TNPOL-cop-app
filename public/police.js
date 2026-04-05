(function () {
  const dashboard = document.getElementById('dashboard');
  const statusSelect = document.getElementById('statusSelect');
  const refreshBtn = document.getElementById('refreshBtn');
  const complaintsBox = document.getElementById('policeComplaints');
  const loginPanel = document.getElementById('loginPanel');
  const logoutBtn = document.getElementById('logoutBtn');

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

  async function loadMe() {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user;
  }

  async function loadComplaints() {
    if (!complaintsBox) return;
    complaintsBox.textContent = 'Loading...';
    try {
      const status = statusSelect ? statusSelect.value : 'submitted';
      const data = await apiJson(`/api/police/complaints?status=${encodeURIComponent(status)}`);
      const complaints = data.complaints || [];

      if (!complaints.length) {
        complaintsBox.innerHTML = '<div class="muted">No complaints for this status.</div>';
        return;
      }

      complaintsBox.innerHTML = '';
      for (const c of complaints) {
        const card = document.createElement('div');
        card.className = 'card';
        const statusSelectId = `status_${c.id}`;

        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <div style="flex: 1;">
              <div class="status">ID: ${escapeHtml(String(c.id))} • Current Status: ${escapeHtml(c.status)}</div>
              <div class="muted">Submitted: ${escapeHtml(formatTime(c.created_at))}</div>
              <div style="margin-top:6px;"><b>Title:</b> ${escapeHtml(c.title)}</div>
              <div style="margin-top:6px;"><b>Category:</b> ${escapeHtml(c.category || 'N/A')}</div>
              <div style="margin-top:6px;"><b>Description:</b> ${escapeHtml(c.description)}</div>
              <div style="margin-top:6px;"><b>Priority:</b> ${escapeHtml(c.priority)}</div>
              <div style="margin-top:6px;"><b>Reporter:</b> ${escapeHtml(c.reporter?.displayName || 'Unknown')} (${escapeHtml(c.reporter?.email || 'N/A')})</div>
            </div>
          </div>
          <div style="margin-top:10px;">
            <label for="${escapeHtml(statusSelectId)}" style="margin-top:0;">Update Status</label>
            <div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
              <select id="${escapeHtml(statusSelectId)}" style="flex: 1; min-width:150px; padding:10px; border-radius:6px; border:1px solid #e0e6ed; font-size:14px;">
                <option value="submitted">📥 Open</option>
                <option value="verified">✓ Resolved</option>
                <option value="rejected">✗ Rejected</option>
              </select>
              <button class="primary" data-id="${escapeHtml(String(c.id))}" type="button" style="margin:0;">Update</button>
            </div>
          </div>
        `;
        complaintsBox.appendChild(card);

        // Set current status in dropdown
        const selectEl = document.getElementById(statusSelectId);
        if (selectEl) {
          selectEl.value = c.status;
        }
      }

      complaintsBox.querySelectorAll('button[data-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const selectEl = document.getElementById(`status_${id}`);
          const newStatus = selectEl ? selectEl.value : 'submitted';

          btn.disabled = true;
          const prevText = btn.textContent;
          btn.textContent = 'Updating...';
          try {
            await apiJson(`/api/police/complaints/${encodeURIComponent(id)}/status`, {
              method: 'POST',
              body: JSON.stringify({ status: newStatus }),
            });
            alert(`Complaint status updated to ${newStatus}!`);
            await loadComplaints();
          } catch (e) {
            alert(e.message || 'Action failed');
            btn.disabled = false;
            btn.textContent = prevText;
          }
        });
      });
    } catch (err) {
      complaintsBox.innerHTML = `<div class="error">${escapeHtml(err.message || 'Failed to load complaints')}</div>`;
    }
  }

  if (statusSelect) statusSelect.addEventListener('change', loadComplaints);
  if (refreshBtn) refreshBtn.addEventListener('click', loadComplaints);

  // Sort functionality
  let sortOrder = 'desc'; // desc = newest first, asc = oldest first
  const sortBtnEl = document.getElementById('sortBtn');
  if (sortBtnEl && complaintsBox) {
    sortBtnEl.addEventListener('click', () => {
      sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
      const cards = Array.from(complaintsBox.querySelectorAll('.card'));
      if (cards.length > 0) {
        const container = complaintsBox;
        cards.reverse();
        container.innerHTML = '';
        cards.forEach(card => container.appendChild(card));
        sortBtnEl.textContent = `↓ Date (${sortOrder === 'desc' ? 'Newest' : 'Oldest'} first)`;
      }
    });
  }

  // Load rewards history
  async function loadRewardsHistory() {
    const rewardsContainer = document.getElementById('rewardsHistory');
    if (!rewardsContainer) return;

    try {
      const data = await apiJson('/api/police/rewards-history');
      const rewards = data.rewards || [];

      if (!rewards.length) {
        rewardsContainer.innerHTML = '<div class="muted">No rewards distributed yet.</div>';
        return;
      }

      rewardsContainer.innerHTML = '';
      const table = document.createElement('table');
      table.style.cssText = 'width:100%; border-collapse:collapse; margin-top:12px;';
      
      const headerRow = table.insertRow();
      headerRow.style.background = '#f8f9fa';
      const headers = ['User', 'Amount', 'Currency', 'Reason', 'Date'];
      headers.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        th.style.cssText = 'padding:12px; text-align:left; border-bottom:1px solid #e0e6ed; font-weight:600; font-size:13px;';
        headerRow.appendChild(th);
      });

      rewards.forEach(r => {
        const row = table.insertRow();
        row.style.borderBottom = '1px solid #e0e6ed';
        const cells = [
          escapeHtml(r.user_name || r.userName || 'Unknown'),
          escapeHtml(String(r.amount)),
          escapeHtml(r.currency || 'INR'),
          escapeHtml(r.source_type === 'complaint_verified' ? 'Complaint Verified' : r.sourceType || 'Unknown'),
          escapeHtml(formatTime(r.created_at))
        ];
        cells.forEach(cell => {
          const td = document.createElement('td');
          td.innerHTML = cell;
          td.style.cssText = 'padding:12px; font-size:13px;';
          row.appendChild(td);
        });
      });

      rewardsContainer.appendChild(table);
    } catch (err) {
      rewardsContainer.innerHTML = `<div class="error">${escapeHtml(err.message || 'Failed to load rewards')}</div>`;
    }
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      } catch {
        // ignore
      } finally {
        location.href = '/login.html';
      }
    });
  }

  // Initialize
  (async () => {
    try {
      const user = await loadMe();
      if (!user) {
        // Not logged in
        if (loginPanel) loginPanel.classList.remove('hidden');
        if (dashboard) dashboard.classList.add('hidden');
        return;
      }

      if (user.role !== 'police') {
        alert('Police access required. Redirecting...');
        location.href = '/';
        return;
      }

      // Police user logged in
      if (loginPanel) loginPanel.classList.add('hidden');
      if (dashboard) dashboard.classList.remove('hidden');
      await loadComplaints();
      await loadRewardsHistory();
    } catch (err) {
      console.error('Error initializing police dashboard:', err);
    }
  })();
})();


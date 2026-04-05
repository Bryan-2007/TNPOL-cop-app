(function () {
  const page = document.body && document.body.dataset ? document.body.dataset.page : null;
  const REF_STORAGE_KEY = 'tnpol_referral';

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function setError(el, msg) {
    if (!el) return;
    el.textContent = msg || '';
  }

  function getReferralFromUrlOrStorage() {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get('ref');

    // Some browsers/environments block localStorage (private mode / strict policies).
    // We must not crash the whole app if that happens.
    try {
      if (fromUrl) {
        localStorage.setItem(REF_STORAGE_KEY, fromUrl.trim().toUpperCase());
      }
      return localStorage.getItem(REF_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  async function apiJson(url, options) {
    const res = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options && options.headers ? options.headers : {}),
      },
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

  async function apiForm(url, formData) {
    const res = await fetch(url, {
      method: 'POST',
      body: formData,
      credentials: 'include',
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

  function formatTime(ts) {
    if (!ts) return '-';
    try {
      const d = new Date(ts);
      return d.toLocaleString();
    } catch {
      return String(ts);
    }
  }

  function renderComplaints(container, complaints) {
    if (!container) return;
    if (!complaints || complaints.length === 0) {
      container.classList.remove('hidden');
      container.innerHTML = '<div class="muted">No reports yet.</div>';
      return;
    }
    container.classList.remove('hidden');

    container.innerHTML = '';
    for (const c of complaints) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="row" style="justify-content:space-between; align-items:flex-start;">
          <div>
            <div class="status">Status: ${escapeHtml(c.status)}</div>
            <div class="muted">Submitted: ${escapeHtml(formatTime(c.created_at))}</div>
            ${c.title ? `<div style="margin-top:6px;"><b>Title:</b> ${escapeHtml(c.title)}</div>` : ''}
            ${c.category ? `<div style="margin-top:6px;"><b>Category:</b> ${escapeHtml(c.category)}</div>` : ''}
            <div style="margin-top:6px;"><b>Description:</b> ${escapeHtml(c.description)}</div>
            ${c.priority ? `<div style="margin-top:6px;"><b>Priority:</b> ${escapeHtml(c.priority)}</div>` : ''}
          </div>
        </div>
      `;
      container.appendChild(card);
    }
  }

  async function initComplaintPage() {
    const user = await loadMe();
    
    // Redirect police users to their dashboard
    if (user && user.role === 'police') {
      location.href = '/police.html';
      return;
    }

    const meNotice = document.getElementById('meNotice');
    const loginLink = document.getElementById('loginLink');
    const registerLink = document.getElementById('registerLink');
    const form = document.getElementById('complaintForm');
    const reportSectionTitle = document.getElementById('reportSectionTitle');
    const formError = document.getElementById('formError');
    const viewMyReportsBtn = document.getElementById('viewMyReportsBtn');
    const myReports = document.getElementById('myReports');
    const profileWrap = document.getElementById('profileWrap');
    const profileToggleBtn = document.getElementById('profileToggleBtn');
    const profileMenu = document.getElementById('profileMenu');
    const profileMenuHeader = document.getElementById('profileMenuHeader');
    const feedbackBtn = document.getElementById('feedbackBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const profileCloseBtn = document.getElementById('profileCloseBtn');
    const feedbackModal = document.getElementById('feedbackModal');
    const feedbackMessage = document.getElementById('feedbackMessage');
    const feedbackSubmitBtn = document.getElementById('feedbackSubmitBtn');
    const feedbackCloseBtn = document.getElementById('feedbackCloseBtn');
    const feedbackError = document.getElementById('feedbackError');
    const alarmOverlay = document.getElementById('alarmOverlay');
    const rewardsLink = document.getElementById('rewardsLink');

    function setHidden(el, hidden) {
      if (!el) return;
      if (hidden) el.classList.add('hidden');
      else el.classList.remove('hidden');
    }

    function hideAlarmOverlay() {
      if (!alarmOverlay) return;
      setHidden(alarmOverlay, true);
      alarmOverlay.setAttribute('aria-hidden', 'true');
      if (alarmOverlay._hideTimer) clearTimeout(alarmOverlay._hideTimer);
      alarmOverlay._hideTimer = null;
    }

    function showAlarmOverlay() {
      if (!alarmOverlay) return;
      setHidden(alarmOverlay, false);
      alarmOverlay.setAttribute('aria-hidden', 'false');
      if (alarmOverlay._hideTimer) clearTimeout(alarmOverlay._hideTimer);
      alarmOverlay._hideTimer = setTimeout(() => {
        hideAlarmOverlay();
      }, 4500);
    }

    function openProfileMenu() {
      if (!profileMenu) return;
      setHidden(profileMenu, false);
      profileMenu.setAttribute('aria-hidden', 'false');
    }

    function closeProfileMenu() {
      if (!profileMenu) return;
      setHidden(profileMenu, true);
      profileMenu.setAttribute('aria-hidden', 'true');
    }

    // Profile menu: open on touch/click, close on outside touch.
    if (profileToggleBtn && profileMenu) {
      profileToggleBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isHidden = profileMenu.classList.contains('hidden');
        if (isHidden) openProfileMenu();
        else closeProfileMenu();
      });

      document.addEventListener('pointerdown', (e) => {
        if (!profileMenu || profileMenu.classList.contains('hidden')) return;
        if (profileMenu.contains(e.target) || profileToggleBtn.contains(e.target)) return;
        closeProfileMenu();
      });
    }

    if (profileCloseBtn) {
      profileCloseBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        closeProfileMenu();
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        } catch {
          // logout failure is handled by redirect
        } finally {
          closeProfileMenu();
          location.href = '/login.html';
        }
      });
    }

    if (feedbackBtn) {
      feedbackBtn.addEventListener('click', () => {
        closeProfileMenu();
        setHidden(feedbackModal, false);
        if (feedbackModal) feedbackModal.setAttribute('aria-hidden', 'false');
        if (feedbackMessage) {
          setTimeout(() => {
            try {
              feedbackMessage.focus();
            } catch {
              // ignore
            }
          }, 0);
        }
      });
    }

    if (feedbackCloseBtn) {
      feedbackCloseBtn.addEventListener('click', () => {
        setHidden(feedbackModal, true);
        if (feedbackModal) feedbackModal.setAttribute('aria-hidden', 'true');
        if (feedbackError) {
          feedbackError.classList.add('hidden');
          feedbackError.textContent = '';
        }
      });
    }

    if (feedbackSubmitBtn) {
      feedbackSubmitBtn.addEventListener('click', async () => {
        if (!feedbackMessage) return;
        if (feedbackError) {
          feedbackError.classList.add('hidden');
          feedbackError.textContent = '';
        }
        const msg = feedbackMessage.value ? feedbackMessage.value.trim() : '';
        if (!msg) {
          if (feedbackError) {
            feedbackError.textContent = 'Please write a message.';
            feedbackError.classList.remove('hidden');
          }
          return;
        }

        try {
          await apiJson('/api/feedback', {
            method: 'POST',
            body: JSON.stringify({ message: msg }),
          });
          feedbackMessage.value = '';
          setHidden(feedbackModal, true);
          if (feedbackModal) feedbackModal.setAttribute('aria-hidden', 'true');
          alert('Thanks for your feedback.');
        } catch (e) {
          if (feedbackError) {
            feedbackError.textContent = e.message || 'Feedback failed';
            feedbackError.classList.remove('hidden');
          } else {
            alert(e.message || 'Feedback failed');
          }
        }
      });
    }

    const currentLoggedInUser = await loadMe();
    if (currentLoggedInUser) {
      if (meNotice) meNotice.classList.add('hidden');
      if (loginLink) loginLink.classList.add('hidden');
      if (registerLink) registerLink.classList.add('hidden');
      if (form) form.classList.remove('hidden');
      if (reportSectionTitle) reportSectionTitle.classList.remove('hidden');
      if (viewMyReportsBtn) viewMyReportsBtn.classList.remove('hidden');
      if (profileWrap) profileWrap.classList.remove('hidden');
      if (profileMenuHeader) profileMenuHeader.textContent = currentLoggedInUser.displayName || 'User';
    } else {
      if (meNotice) meNotice.classList.remove('hidden');
      if (loginLink) loginLink.classList.remove('hidden');
      if (registerLink) registerLink.classList.remove('hidden');
      if (form) form.classList.add('hidden');
      if (reportSectionTitle) reportSectionTitle.classList.add('hidden');
      if (viewMyReportsBtn) viewMyReportsBtn.classList.add('hidden');
      if (profileWrap) profileWrap.classList.add('hidden');
      closeProfileMenu();
    }

    viewMyReportsBtn && viewMyReportsBtn.addEventListener('click', async () => {
      formError.textContent = '';
      myReports.classList.toggle('hidden');
      if (!myReports.classList.contains('hidden')) {
        try {
          const res = await fetch('/api/complaints/mine', { credentials: 'include' });
          if (!res.ok) throw new Error('Please login to view your reports.');
          const data = await res.json();
          renderComplaints(myReports, data.complaints);
        } catch (e) {
          setError(formError, e.message);
        }
      }
    });

    rewardsLink && rewardsLink.addEventListener('click', async (e) => {
      e.preventDefault();
      const rewardsUser = await loadMe();
      if (!rewardsUser) {
        alert('You must login for viewing rewards');
        return;
      }
      location.href = '/rewards.html';
    });

    form && form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setError(formError, '');

      const formUser = await loadMe();
      if (!formUser) {
        setError(formError, 'Please login first.');
        location.href = '/login.html';
        return;
      }

      const title = document.getElementById('title')?.value || '';
      const description = document.getElementById('description')?.value || '';
      const category = document.getElementById('category')?.value || '';

      if (!title || !description) {
        setError(formError, 'Title and description are required.');
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      const prev = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      try {
        const data = await apiJson('/api/complaints', {
          method: 'POST',
          body: JSON.stringify({ title, description, category }),
        });
        setError(formError, '');
        alert('Report submitted. Police will verify it for rewards.');
        form.reset();
        if (myReports && !myReports.classList.contains('hidden')) {
          const res = await fetch('/api/complaints/mine', { credentials: 'include' });
          const mine = await res.json();
          renderComplaints(myReports, mine.complaints);
        }
      } catch (err) {
        setError(formError, err.message || 'Submission failed');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = prev;
      }
    });
  }

  async function initRewardsPage() {
    const meLine = document.getElementById('meLine');
    const referralCodeEl = document.getElementById('referralCode');
    const referralLinkEl = document.getElementById('referralLink');
    const copyBtn = document.getElementById('copyReferralBtn');
    const rewardsList = document.getElementById('rewardsList');

    try {
      const user = await loadMe();
      if (!user) {
        meLine.textContent = 'Please login to view rewards.';
        location.href = '/login';
        return;
      }

      meLine.textContent = `Logged in as ${user.displayName}`;
      referralCodeEl.textContent = user.referralCode;
      const link = `${location.origin}/?ref=${encodeURIComponent(user.referralCode)}`;
      referralLinkEl.value = link;

      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(link);
          alert('Referral link copied.');
        } catch {
          referralLinkEl.select();
          document.execCommand('copy');
        }
      });

      const res = await fetch('/api/rewards/mine', { credentials: 'include' });
      if (!res.ok) throw new Error('Could not load rewards.');
      const data = await res.json();
      const rewards = data.rewards || [];

      if (rewards.length === 0) {
        rewardsList.textContent = 'No rewards yet.';
        return;
      }

      rewardsList.innerHTML = '';
      for (const r of rewards) {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
          <div class="status">+ ${escapeHtml(String(r.amount))} ${escapeHtml(r.currency || 'points')} (${escapeHtml(r.status)})</div>
          <div class="muted">Source: ${escapeHtml(r.source_type || r.sourceType || 'complaint')} • ${escapeHtml(formatTime(r.created_at))}</div>
        `;
        rewardsList.appendChild(card);
      }
    } catch (e) {
      if (meLine) meLine.textContent = e.message || 'Failed to load rewards.';
    }
  }

  async function initRegisterPage() {
    const form = document.getElementById('registerForm');
    const errorEl = document.getElementById('formError');
    const goLoginBtn = document.getElementById('goLoginBtn');
    const referralCode = getReferralFromUrlOrStorage();
    goLoginBtn && goLoginBtn.addEventListener('click', () => (location.href = '/login'));

    form && form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setError(errorEl, '');

      const payload = {
        name: document.getElementById('displayName').value,
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
      };
      if (referralCode) payload.referralCode = referralCode;

      try {
        const data = await apiJson('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) });
        if (data?.ok) location.href = '/';
      } catch (err) {
        setError(errorEl, err.message || 'Registration failed');
      }
    });
  }

  async function initLoginPage() {
    const form = document.getElementById('loginForm');
    const errorEl = document.getElementById('formError');
    const goRegisterBtn = document.getElementById('goRegisterBtn');
    goRegisterBtn && goRegisterBtn.addEventListener('click', () => (location.href = '/register'));

    form && form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setError(errorEl, '');

      const payload = {
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
      };

      try {
        const data = await apiJson('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
        console.log('[LOGIN] Login response:', data);
        console.log('[LOGIN] User role:', data?.user?.role);
        if (data?.ok) {
          if (data.user?.role === 'police') {
            console.log('[LOGIN] Police user detected, redirecting to /police.html');
            location.href = '/police.html';
          } else {
            console.log('[LOGIN] Citizen user, redirecting to /');
            location.href = '/';
          }
        }
      } catch (err) {
        console.error('[LOGIN] Login error:', err);
        setError(errorEl, err.message || 'Login failed');
      }
    });
  }

  // Capture referral code as early as possible.
  // This supports “referrals on install + register” as “referrals on first open + register”.
  getReferralFromUrlOrStorage();

  if (page === 'complaint') initComplaintPage();
  if (page === 'rewards') initRewardsPage();
  if (page === 'register') initRegisterPage();
  if (page === 'login') initLoginPage();
})();


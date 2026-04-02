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
            <div class="muted">Submitted: ${escapeHtml(formatTime(c.createdAt))}</div>
            ${c.crimeType ? `<div style="margin-top:6px;"><b>Crime Type:</b> ${escapeHtml(c.crimeType)}</div>` : ''}
            <div style="margin-top:6px;"><b>Location:</b> ${escapeHtml(c.locationTag)}</div>
            <div style="margin-top:6px;"><b>Description:</b> ${escapeHtml(c.description)}</div>
            ${c.reporterName ? `<div style="margin-top:6px;"><b>Contact Name:</b> ${escapeHtml(c.reporterName)}</div>` : ''}
            ${c.reporterPhone ? `<div style="margin-top:6px;"><b>Contact Phone:</b> ${escapeHtml(c.reporterPhone)}</div>` : ''}
            ${c.identityText ? `<div style="margin-top:6px;"><b>Identity (optional):</b> ${escapeHtml(c.identityText)}</div>` : ''}
            ${c.policeNotes ? `<div style="margin-top:6px;"><b>Police notes:</b> ${escapeHtml(c.policeNotes)}</div>` : ''}
          </div>
        </div>
        <div class="thumbs" style="margin-top:10px;">
          ${c.images && c.images.length ? c.images.map((u) => `<img src="${escapeHtml(u)}" alt="evidence" />`).join('') : '<div class="muted">No images</div>'}
        </div>
      `;
      container.appendChild(card);
    }
  }

  async function initComplaintPage() {
    const meNotice = document.getElementById('meNotice');
    const loginLink = document.getElementById('loginLink');
    const registerLink = document.getElementById('registerLink');
    const form = document.getElementById('complaintForm');
    const formError = document.getElementById('formError');
    const gpsBtn = document.getElementById('gpsBtn');
    const locationTagInput = document.getElementById('locationTag');
    const gpsResultEl = document.getElementById('gpsResult');
    const reporterNameInput = document.getElementById('reporterName');
    const reporterPhoneInput = document.getElementById('reporterPhone');
    const crimeTypeSelect = document.getElementById('crimeType');
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

    const user = await loadMe();
    if (user) {
      if (meNotice) meNotice.classList.add('hidden');
      if (loginLink) loginLink.classList.add('hidden');
      if (registerLink) registerLink.classList.add('hidden');
      if (viewMyReportsBtn) viewMyReportsBtn.classList.remove('hidden');
      if (profileWrap) profileWrap.classList.remove('hidden');
      if (profileMenuHeader) profileMenuHeader.textContent = user.displayName || 'User';
    } else {
      if (viewMyReportsBtn) viewMyReportsBtn.classList.add('hidden');
      if (profileWrap) profileWrap.classList.add('hidden');
      closeProfileMenu();
    }

    gpsBtn && gpsBtn.addEventListener('click', async () => {
      formError.textContent = '';
      if (!navigator.geolocation) {
        setError(formError, 'GPS not supported on this device.');
        return;
      }
      gpsBtn.disabled = true;
      gpsBtn.textContent = 'Getting GPS...';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const coords = `${lat.toFixed(6)},${lng.toFixed(6)}`;
          locationTagInput.value = coords;
          gpsBtn.disabled = false;
          gpsBtn.textContent = '✓ Location Updated';
          if (gpsResultEl) {
            gpsResultEl.textContent = `📍 ${coords}`;
            gpsResultEl.style.display = 'block';
          }
        },
        (err) => {
          gpsBtn.disabled = false;
          gpsBtn.textContent = '📍 Use my GPS';
          setError(formError, err && err.message ? err.message : 'Could not get location.');
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 1000 }
      );
    });

    const sosBtn = document.getElementById('sosBtn');
    if (sosBtn) {
      let tapCount = 0;
      let lastTapAt = 0;
      const maxGapMs = 2200;
      sosBtn.addEventListener('click', () => {
        const now = Date.now();
        if (now - lastTapAt > maxGapMs) tapCount = 0;
        tapCount += 1;
        lastTapAt = now;
        if (tapCount >= 3) {
          showAlarmOverlay();
          // Auto-call in background (mobile browsers may still require user gesture; this
          // runs within the click handler, which counts as a gesture).
          setTimeout(() => {
            window.location.href = 'tel:100';
          }, 80);
          tapCount = 0;
        } else {
          sosBtn.textContent = `SOS (Tap ${Math.max(0, 3 - tapCount)} times)`;
          setTimeout(() => {
            sosBtn.textContent = 'SOS (Tap 3 times)';
          }, 1400);
        }
      });
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
      const user = await loadMe();
      if (!user) {
        alert('You must login for viewing rewards');
        return;
      }
      location.href = '/rewards.html';
    });

    form && form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setError(formError, '');

      const currentUser = await loadMe();
      if (!currentUser) {
        setError(formError, 'Please login first.');
        location.href = '/login';
        return;
      }

      const fd = new FormData();
      fd.append('locationTag', locationTagInput.value);
      fd.append('description', document.getElementById('description').value);
      fd.append('crimeType', crimeTypeSelect.value);
      if (reporterNameInput && reporterNameInput.value) {
        fd.append('reporterName', reporterNameInput.value);
      }
      if (reporterPhoneInput && reporterPhoneInput.value) {
        fd.append('reporterPhone', reporterPhoneInput.value);
      }
      const evidenceInput = document.getElementById('evidence');
      if (evidenceInput && evidenceInput.files && evidenceInput.files.length) {
        for (const f of evidenceInput.files) fd.append('evidence', f);
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      const prev = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      try {
        const data = await apiForm('/api/complaints', fd);
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
          <div class="status">+ ${escapeHtml(r.amount)} ${escapeHtml(r.currency)} (${escapeHtml(r.status)})</div>
          <div class="muted">Source: ${escapeHtml(r.sourceType)} • ${escapeHtml(formatTime(r.createdAt))}</div>
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
        displayName: document.getElementById('displayName').value,
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
      };
      if (referralCode) payload.referralCode = referralCode;

      try {
        const data = await apiJson('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) });
        if (data && data.ok) location.href = '/';
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
        if (data && data.ok) location.href = '/';
      } catch (err) {
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


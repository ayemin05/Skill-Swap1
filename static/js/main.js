/*
  Skill Swap — main.js
  This is the entire frontend. I chose not to use React or any framework —
  everything is vanilla JavaScript. The whole site is one HTML page and I
  show/hide different sections depending on what the user clicks.
  All app state lives in the S object below.
*/

// S holds everything the frontend needs at runtime:
// who's logged in, what page we're on, current conversation, etc.
const S = {
  user:         null,   // the logged-in user object (null if guest)
  page:         'home',
  prev:         'home',
  filter:       'all',  // current browse filter
  scheduleWith: null,   // user ID we're scheduling a session with
  scheduleType: 'video',
  teachTags:    [],
  learnTags:    [],
  activeConv:   null,   // user ID of the open conversation
  successCb:    null,
  avatarData:   null,   // temporarily holds a new avatar URL before saving
  pollTimer:    null,   // interval ID for chat polling
  sidebarTimer: null,   // interval ID for sidebar refresh
};

const COLORS = ['#7986CB','#26A69A','#EF5350','#66BB6A','#FFA726','#AB47BC','#5C6BC0','#00897B'];

// Browse cache — stores last fetched users so switching back to Browse is instant
let _usersCache = null;
let _usersCacheTime = 0;

// ── API helper ───────────────────────────────────────
// All API calls go through here. It adds JSON headers and throws on error responses.
async function api(method, path, body) {
  const opts = { method, headers: {'Content-Type': 'application/json'}, credentials: 'include' };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── App startup ──────────────────────────────────────
// On load: check if there's a valid session cookie and restore the logged-in state.
async function init() {
  try {
    S.user = await api('GET', '/api/me');
    onLoggedIn();
  } catch { /* no session — guest mode */ }

  // Default the schedule date to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  document.getElementById('sched-date').value = tomorrowStr;
  document.getElementById('sched-date').min   = tomorrowStr;

  loadUsers();
}

// ── Navigation ───────────────────────────────────────
// showPage hides all page divs and shows the requested one.
// It also triggers any data loading needed for that page.
function toggleMobileMenu() {
  const links = document.getElementById('nav-links');
  const btn   = document.getElementById('hamburger-btn');
  const open  = links.classList.toggle('mobile-open');
  btn.classList.toggle('open', open);
}

function closeMobileMenu() {
  document.getElementById('nav-links').classList.remove('mobile-open');
  document.getElementById('hamburger-btn').classList.remove('open');
}

function showPage(pg) {
  closeMobileMenu();
  document.getElementById('page-messages')?.classList.remove('conv-open');
  if (pg !== 'messages') stopPolling();

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + pg);
  if (!el) return;
  el.classList.add('active');
  S.prev = S.page;
  S.page = pg;
  updateNav();

  if (pg === 'browse')   loadUsers();
  if (pg === 'sessions') { if (!S.user) { openAuthModal('login'); return; } loadSessions(); refreshSessionBadge(); }
  if (pg === 'admin')    { if (!S.user || !S.user.is_admin) { showPage('home'); return; } loadAdminUsers(); }
  if (pg === 'messages') {
    if (!S.user) { openAuthModal('login'); return; }
    loadConversations();
    if (!S.sidebarTimer) {
      S.sidebarTimer = setInterval(() => {
        if (S.page !== 'messages') { clearInterval(S.sidebarTimer); S.sidebarTimer = null; return; }
        loadConversations();
      }, 8000);
    }
  }
  if (pg === 'create-profile' && S.user) {
    // Populate the profile form with existing data when the user opens it
    document.getElementById('pf-title').textContent = S.user.is_admin ? '\u2699\uFE0F My Profile (Admin)' : 'My Profile';
    document.getElementById('pf-name').value = S.user.name || '';
    document.getElementById('pf-bio').value  = S.user.bio  || '';
    const avEl = document.getElementById('av-preview');
    if (avEl) {
      if (S.user.avatar) {
        avEl.innerHTML = '<img src="' + S.user.avatar + '" alt="Profile photo" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>';
      } else {
        avEl.innerHTML = '\uD83D\uDCF7';
      }
    }
    S.avatarData = null;
    const locEl = document.getElementById('pf-location');
    if (locEl) locEl.value = S.user.location || '';
    const pref  = S.user.session_pref || 'both';
    const radio = document.querySelector('input[name="session_pref"][value="' + pref + '"]');
    if (radio) { radio.checked = true; onPrefChange(radio); }
    S.teachTags = [...(S.user.teach || [])];
    S.learnTags = [...(S.user.learn || [])];
    renderTagsUI();
  }
  window.scrollTo(0, 0);
}

function goBack() { showPage(S.prev || 'home'); }

// updateNav shows/hides navigation elements based on login state and current page.
function updateNav() {
  const backPages = ['create-profile', 'schedule'];
  const loggedIn  = !!S.user;

  document.getElementById('nav-getstarted-btn').style.display  = loggedIn ? 'none' : '';
  document.getElementById('nav-back-btn').style.display        = loggedIn && backPages.includes(S.page) ? '' : 'none';
  const profileBtn = document.getElementById('nav-profile-btn');
  if (profileBtn) {
    profileBtn.style.display = loggedIn && !backPages.includes(S.page) ? '' : 'none';
    profileBtn.textContent   = 'My Profile';
  }
  document.getElementById('nav-logout-btn').style.display      = loggedIn ? '' : 'none';
  document.getElementById('nav-msg-link').style.display        = loggedIn ? '' : 'none';
  document.getElementById('nav-sessions-link').style.display   = loggedIn ? '' : 'none';
  const adminLink = document.getElementById('nav-admin-link');
  if (adminLink) adminLink.style.display = (loggedIn && S.user && S.user.is_admin) ? '' : 'none';
}

function heroSearch() {
  const v = document.getElementById('hero-q').value.trim();
  showPage('browse');
  if (v) setTimeout(() => { document.getElementById('browse-q').value = v; loadUsers(); }, 80);
}

function onGetStarted() {
  if (!S.user) openAuthModal('register');
  else         showPage('create-profile');
}

// ── Auth ─────────────────────────────────────────────
function openAuthModal(tab) {
  switchTab(tab || 'login');
  const modal = document.getElementById('auth-modal');
  modal.classList.add('show');
  setTimeout(() => {
    const first = modal.querySelector('input, button:not(.modal-close-btn)');
    if (first) first.focus();
  }, 50);
}
function closeAuthModal() { document.getElementById('auth-modal').classList.remove('show'); }
function switchTab(tab) {
  document.getElementById('login-form').style.display    = tab === 'login'    ? '' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? '' : 'none';
  document.getElementById('tab-login').classList.toggle('active',    tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const err   = document.getElementById('login-err');
  const btn   = document.getElementById('login-btn');
  err.classList.remove('show');
  if (!email || !pass) { err.textContent = 'Please fill all fields'; err.classList.add('show'); return; }
  btn.disabled = true; btn.textContent = 'Signing in\u2026';
  try {
    const data = await api('POST', '/api/login', {email, password: pass});
    S.user = data.user;
    closeAuthModal(); onLoggedIn();
    showToast('Welcome back, ' + S.user.name + '! \uD83D\uDC4B');
  } catch(e) { err.textContent = e.message; err.classList.add('show'); }
  finally { btn.disabled = false; btn.textContent = 'Sign In'; }
}

async function doRegister() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-pass').value;
  const err   = document.getElementById('reg-err');
  const btn   = document.getElementById('reg-btn');
  err.classList.remove('show');
  if (!name || !email || !pass) { err.textContent = 'Please fill all fields'; err.classList.add('show'); return; }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) { err.textContent = 'Please enter a valid email address'; err.classList.add('show'); return; }
  if (pass.length < 6) { err.textContent = 'Password must be at least 6 characters'; err.classList.add('show'); return; }
  btn.disabled = true; btn.textContent = 'Creating account\u2026';
  try {
    const data = await api('POST', '/api/register', {name, email, password: pass});
    S.user = data.user;
    closeAuthModal(); onLoggedIn();
    document.getElementById('pf-title').textContent = 'Create Your Profile';
    document.getElementById('pf-name').value = S.user.name;
    S.teachTags = []; S.learnTags = []; renderTagsUI();
    showPage('create-profile');
    showToast('Account created! Add your skills to get started.');
  } catch(e) { err.textContent = e.message; err.classList.add('show'); }
  finally { btn.disabled = false; btn.textContent = 'Create Account'; }
}

// onLoggedIn runs after every successful login or on page load with an existing session.
// It pre-loads badges and conversation data in the background.
function onLoggedIn() {
  updateNav();
  refreshUnreadBadge();
  refreshSessionBadge();
  const heroCta = document.getElementById('hero-cta-btn');
  if (heroCta) heroCta.textContent = 'Edit Profile';
  requestNotifPermission();
}

function requestNotifPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function showMsgNotification(senderName, content) {
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    const n = new Notification(senderName + ' sent you a message', {
      body: content.length > 80 ? content.slice(0, 80) + '…' : content,
      icon: '/static/avatars/user-3.jpg'
    });
    n.onclick = () => { window.focus(); showPage('messages'); n.close(); };
  }
}

async function doLogout() {
  _usersCache = null; _usersCacheTime = 0;
  try { await api('POST', '/api/logout'); } catch {}
  S.user = null;
  S.activeConv = null;
  stopPolling();
  updateNav();
  updateMsgBadge(0);
  const list = document.getElementById('msg-conv-list');
  if (list) list.innerHTML = '<div style="padding:20px;color:var(--gray);font-size:.88rem">Loading\u2026</div>';
  const main = document.getElementById('msg-main');
  if (main) main.innerHTML = '<div class="msg-empty"><span style="font-size:2.2rem">\uD83D\uDCAC</span><span>Select a conversation to start messaging</span></div>';
  const heroCta = document.getElementById('hero-cta-btn');
  if (heroCta) heroCta.textContent = 'Create Profile';
  const heroBtn = document.getElementById('hero-cta-btn');
  if (heroBtn) heroBtn.textContent = 'Create Profile';
  showPage('home');
  showToast('Logged out. See you soon!');
}

// ── Profile ──────────────────────────────────────────
// previewAv: when the user picks a photo, show a preview and upload it to the server right away.
// Storing the server URL (not base64) means it persists after logout.
function previewAv(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result;
    const el = document.getElementById('av-preview');
    el.innerHTML = '<img src="' + base64 + '" alt="Your uploaded profile photo" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>';
    try {
      const res = await fetch('/api/upload-avatar', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        credentials: 'include',
        body: JSON.stringify({data: base64})
      });
      const json = await res.json();
      if (json.url) {
        S.avatarData = json.url;
        el.innerHTML = '<img src="' + json.url + '" alt="Your uploaded profile photo" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>';
      }
    } catch { showToast('Photo preview saved locally \u2014 will upload on Save.'); }
  };
  reader.readAsDataURL(file);
}

function addTag(type) {
  const input = document.getElementById(type + '-in');
  const val   = input.value.trim(); if (!val) return;
  if (type === 'teach' && !S.teachTags.includes(val)) S.teachTags.push(val);
  if (type === 'learn' && !S.learnTags.includes(val)) S.learnTags.push(val);
  input.value = ''; renderTagsUI();
}

function removeTag(type, val) {
  if (type === 'teach') S.teachTags = S.teachTags.filter(s => s !== val);
  else                  S.learnTags = S.learnTags.filter(s => s !== val);
  renderTagsUI();
}

// renderTagsUI redraws the skill tag pills in the profile form
function renderTagsUI() {
  document.getElementById('teach-tags').innerHTML = S.teachTags.map(s => {
    const safe = s.replace(/'/g, "\\'");
    return '<span class="tag">' + s + '<span class="remove" onclick="removeTag(\'teach\',\'' + safe + '\')">\u2715</span></span>';
  }).join('');
  document.getElementById('learn-tags').innerHTML = S.learnTags.map(s => {
    const safe = s.replace(/'/g, "\\'");
    return '<span class="tag">' + s + '<span class="remove" onclick="removeTag(\'learn\',\'' + safe + '\')">\u2715</span></span>';
  }).join('');
}

async function saveProfile() {
  if (!S.user) { openAuthModal('login'); return; }
  const name = document.getElementById('pf-name').value.trim();
  if (!name) { showToast('Please enter your name'); return; }
  const btn = document.getElementById('pf-save-btn');
  btn.disabled = true; btn.textContent = 'Saving\u2026';
  try {
    const prefEl   = document.querySelector('input[name="session_pref"]:checked');
    const pref     = prefEl ? prefEl.value : 'both';
    const location = (document.getElementById('pf-location')?.value || '').trim();
    const avatar   = S.avatarData || S.user.avatar || '';
    S.user = await api('PUT', '/api/profile', {
      name,
      bio:          document.getElementById('pf-bio').value.trim(),
      avatar,
      location,
      session_pref: pref,
      teach:        S.teachTags,
      learn:        S.learnTags,
    });
    S.avatarData = null;
    _usersCache = null; _usersCacheTime = 0;
    showSuccess('\uD83C\uDF89', 'Profile Saved!', 'Your profile is live, ' + S.user.name + '! Start browsing matches.', () => showPage('browse'));
  } catch(e) { showToast('Error: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Save Profile & Continue'; }
}

// ── Browse ───────────────────────────────────────────
function setFilter(f, btn) {
  S.filter = f;
  document.querySelectorAll('.filter-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
  btn.classList.add('active');
  btn.setAttribute('aria-pressed', 'true');
  loadUsers();
}

async function loadUsers() {
  const q    = document.getElementById('browse-q')?.value || '';
  const grid = document.getElementById('cards-grid');
  if (!grid) return;

  // Show cached results instantly if available and fresh (within 30 seconds) and no search query
  if (_usersCache && !q && S.filter === 'all' && Date.now() - _usersCacheTime < 30000) {
    renderCards(_usersCache);
  } else {
    grid.innerHTML = '<div class="spinner">Loading\u2026</div>';
  }

  try {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (S.filter === 'video' || S.filter === 'in-person') params.set('filter', S.filter);
    let users = await api('GET', '/api/users?' + params.toString());
    // Client-side filters for online and suggested
    if (S.filter === 'online')    users = users.filter(u => u.is_online);
    if (S.filter === 'suggested' && S.user) {
      const myTeach = S.user.teach || [];
      const myLearn = S.user.learn || [];
      users = users.filter(u =>
        (u.teach||[]).some(s => myLearn.includes(s)) ||
        (u.learn||[]).some(s => myTeach.includes(s))
      );
    }
    // Cache the unfiltered results for instant tab switching
    if (!q && S.filter === 'all') { _usersCache = users; _usersCacheTime = Date.now(); }
    renderCards(users);
  } catch { grid.innerHTML = '<div class="no-results">Could not load users.</div>'; }
}

// avatarHtml returns the correct avatar element — photo if available, coloured initials otherwise
function avatarHtml(u, size, colorIndex) {
  const color    = COLORS[colorIndex % COLORS.length];
  const initials = u.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  if (u.avatar) {
    return '<div class="card-avatar" style="background:' + color + ';overflow:hidden;padding:0;width:' + size + 'px;height:' + size + 'px">'
      + '<img src="' + u.avatar + '" alt="' + u.name + ' profile photo" style="width:100%;height:100%;object-fit:cover"/>'
      + '</div>';
  }
  return '<div class="card-avatar" style="background:' + color + ';width:' + size + 'px;height:' + size + 'px">' + initials + '</div>';
}

// renderCards builds and injects all user cards into the browse grid
function renderCards(users) {
  const grid = document.getElementById('cards-grid');
  if (!grid) return;
  if (!users || !users.length) {
    grid.innerHTML = '<div class="no-results">No matches found yet. Be the first to join! \uD83D\uDE80</div>';
    return;
  }
  const prefMap = { video: '\uD83C\uDFA5 Video Call', 'in-person': '\uD83D\uDC65 In-Person', both: '\u2728 Video & In-Person' };
  grid.innerHTML = users.map((u, i) => {
    const teach     = (u.teach || []).slice(0, 3);
    const learn     = (u.learn || []).slice(0, 3);
    const stars     = '\u2605'.repeat(Math.round(u.rating)) + '\u2606'.repeat(5 - Math.round(u.rating));
    const prefClass = u.session_pref || 'both';
    const prefLabel = prefMap[prefClass] || '\u2728 Video & In-Person';
    const locHtml   = u.location ? '<div class="card-location">\uD83D\uDCCD ' + u.location + '</div>' : '';
    const onlineDot = u.is_online ? '<span class="online-dot" title="Online now"></span>' : '';
    const en        = u.name.replace(/'/g, "\\'");

    // Show "This is you" label instead of Message button on your own card
    const actionBtn = (S.user && S.user.id === u.id)
      ? '<span style="font-size:.82rem;color:var(--gray);padding:9px 4px">This is you</span>'
      : '<button class="btn-msg" onclick="startMessage(' + u.id + ',\'' + en + '\')">Message</button>';

    // Admins see a "View / Manage" label so they know they can take action
    const viewLabel = (S.user && S.user.is_admin && u.id !== S.user.id) ? '\u2699\uFE0F View / Manage' : 'View Profile';

    const teachHtml = teach.length
      ? '<div class="section-label">Can Teach</div><div class="card-tags">'
        + teach.map(s => '<span class="card-tag">' + s + '</span>').join('') + '</div>'
      : '';
    const learnHtml = learn.length
      ? '<div class="section-label">Wants to Learn</div><div class="card-tags">'
        + learn.map(s => '<span class="card-tag learn">' + s + '</span>').join('') + '</div>'
      : '';

    return '<div class="user-card">'
      + '<div class="card-header">'
      + avatarHtml(u, 46, i)
      + '<div>'
      + '<div class="card-name">' + onlineDot + u.name + '</div>'
      + '<div class="card-stars">' + stars + ' ' + u.rating.toFixed(1) + '</div>'
      + '<div class="card-swaps">' + u.swaps + ' skill swaps completed</div>'
      + '</div></div>'
      + '<span class="card-pref ' + prefClass + '">' + prefLabel + '</span>'
      + locHtml
      + teachHtml + learnHtml
      + '<div class="card-btns">'
      + actionBtn
      + '<button class="btn-view" onclick="viewProfile(' + u.id + ')">' + viewLabel + '</button>'
      + '</div></div>';
  }).join('');
}

// ── Profile View Modal ────────────────────────────────
// viewProfile fetches a user and opens a modal with their full profile.
// When the viewer is an admin, extra management buttons appear at the bottom.
async function viewProfile(id) {
  try {
    const u        = await api('GET', '/api/users/' + id);
    const initials = u.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const color    = COLORS[id % COLORS.length];
    const en       = u.name.replace(/'/g, "\\'");

    const pvAvatar = u.avatar
      ? '<div class="pv-avatar" style="background:' + color + ';overflow:hidden;padding:0">'
        + '<img src="' + u.avatar + '" alt="' + u.name + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>'
        + '</div>'
      : '<div class="pv-avatar" style="background:' + color + '">' + initials + '</div>';

    const prefLabels = { video: '\uD83C\uDFA5 Video Call', 'in-person': '\uD83D\uDC65 In-Person', both: '\u2728 Video & In-Person' };
    const pvPref = prefLabels[u.session_pref] || '\u2728 Video & In-Person';
    const pvLoc  = u.location
      ? '<div style="font-size:.82rem;color:var(--gray);margin-top:3px">\uD83D\uDCCD ' + u.location + '</div>'
      : '';

    // Admin actions are shown only when the viewer is an admin and this is a different user
    const isAdminView = S.user && S.user.is_admin && u.id !== S.user.id;
    let adminHtml = '';
    if (isAdminView) {
      const banBtn = u.is_banned
        ? '<button class="sa-btn sa-confirm" onclick="closePVModal();adminAction(\'unban\',' + u.id + ',\'' + en + '\')">\u2713 Unban User</button>'
        : '<button class="sa-btn sa-decline" onclick="closePVModal();adminAction(\'ban\',' + u.id + ',\'' + en + '\')">\uD83D\uDEAB Ban User</button>';
      adminHtml =
        '<div class="pv-admin-actions">'
        + '<div class="pv-admin-label">\u2699\uFE0F Admin Actions</div>'
        + banBtn
        + '<button class="sa-btn sa-reschedule" onclick="closePVModal();adminWarn(' + u.id + ',\'' + en + '\')">\u26A0\uFE0F Send Warning</button>'
        + '<button class="sa-btn" style="background:#1F2937;color:#fff" onclick="closePVModal();adminAction(\'delete\',' + u.id + ',\'' + en + '\')">\uD83D\uDDD1 Delete Account</button>'
        + '</div>';
    }

    const teachHtml = (u.teach||[]).length
      ? '<div class="pv-section"><div class="pv-section-label">Can Teach</div><div class="pv-tags">'
        + u.teach.map(s => '<span class="pv-tag">' + s + '</span>').join('') + '</div></div>'
      : '';
    const learnHtml = (u.learn||[]).length
      ? '<div class="pv-section"><div class="pv-section-label">Wants to Learn</div><div class="pv-tags">'
        + u.learn.map(s => '<span class="pv-tag" style="background:var(--tag-teal)">' + s + '</span>').join('') + '</div></div>'
      : '';

    document.getElementById('pv-content').innerHTML =
      '<button onclick="closePVModal()" style="position:absolute;top:12px;right:14px;background:none;border:none;font-size:1.3rem;cursor:pointer;color:#999">\u2715</button>'
      + '<div class="pv-header">' + pvAvatar
      + '<div>'
      + '<div class="pv-name">' + u.name + '</div>'
      + '<div style="color:var(--gray);font-size:.82rem">\u2605 ' + u.rating.toFixed(1) + ' \u00B7 ' + u.swaps + ' swaps</div>'
      + pvLoc
      + '<span class="card-pref ' + (u.session_pref || 'both') + '" style="margin-top:6px;display:inline-flex">' + pvPref + '</span>'
      + '</div></div>'
      + (u.bio ? '<div class="pv-section"><div class="pv-section-label">About</div><p style="font-size:.88rem;color:#444;line-height:1.6">' + u.bio + '</p></div>' : '')
      + teachHtml + learnHtml
      + '<div class="pv-btns">'
      + '<button class="btn-msg"  onclick="closePVModal();startMessage(' + u.id + ',\'' + en + '\')">Message</button>'
      + '<button class="btn-view" onclick="closePVModal();openSchedule(' + u.id + ',\'' + en + '\')">Schedule Session</button>'
      + '</div>'
      + adminHtml;

    document.getElementById('pv-modal').classList.add('show');
  } catch (e) { showToast('Could not load profile'); }
}

function closePVModal(e) {
  if (!e || e.target === document.getElementById('pv-modal'))
    document.getElementById('pv-modal').classList.remove('show');
}

// ── Messages ─────────────────────────────────────────
function startMessage(userId, name) {
  if (!S.user) { openAuthModal('login'); return; }
  showPage('messages');
  setTimeout(() => openConversation(userId, name), 150);
}

// refreshUnreadBadge fetches conversations and updates the nav badge with total unread count
async function refreshUnreadBadge() {
  if (!S.user) return;
  try {
    const convs = await api('GET', '/api/conversations');
    const total = (convs||[]).reduce((sum, c) => sum + (c.unread || 0), 0);
    updateMsgBadge(total);
    if (convs && convs.length) renderConvList(convs);
  } catch {}
}

function updateMsgBadge(count) {
  const link = document.getElementById('nav-msg-link');
  if (!link) return;
  let badge = link.querySelector('.nav-badge');
  if (count > 0) {
    if (!badge) { badge = document.createElement('span'); badge.className = 'nav-badge'; link.appendChild(badge); }
    badge.textContent = count;
  } else {
    if (badge) badge.remove();
  }
}

// renderConvList builds the conversation sidebar.
// Uses string concatenation throughout to avoid Node v22 template literal parsing issues.
function renderConvList(convs) {
  const list = document.getElementById('msg-conv-list');
  if (!list) return;
  if (!convs || !convs.length) {
    list.innerHTML = '<div style="padding:18px;color:var(--gray);font-size:.85rem">No conversations yet.<br/>Message someone from Browse!</div>';
    updateMsgBadge(0);
    return;
  }
  list.innerHTML = convs.map((c, i) => {
    const u      = c.user;
    const inits  = u.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const unread = c.unread || 0;
    const bg     = COLORS[i % COLORS.length];
    const en     = u.name.replace(/'/g, "\\'");
    const active = S.activeConv === u.id ? 'msg-item active' : 'msg-item';
    const av     = u.avatar
      ? '<div class="card-avatar" style="background:' + bg + ';width:40px;height:40px;overflow:hidden;padding:0"><img src="' + u.avatar + '" alt="' + u.name + '" style="width:100%;height:100%;object-fit:cover"/></div>'
      : '<div class="card-avatar" style="background:' + bg + ';width:40px;height:40px;font-size:.88rem">' + inits + '</div>';
    const udot  = (unread > 0 && S.activeConv !== u.id) ? '<span class="conv-unread-dot">' + unread + '</span>' : '';
    const pvcls = (unread > 0 && S.activeConv !== u.id) ? 'msg-item-preview unread-preview' : 'msg-item-preview';
    return '<div class="' + active + '" onclick="openConversation(' + u.id + ',\'' + en + '\')">'
      + av
      + '<div class="msg-item-info">'
      + '<div class="msg-item-name">' + u.name + udot + '</div>'
      + '<div class="' + pvcls + '">' + (c.last_message || '\u2026') + '</div>'
      + '</div>'
      + '<div class="msg-item-actions">'
      + '<button class="msg-item-btn" onclick="event.stopPropagation();viewProfile(' + u.id + ')" title="View profile">\uD83D\uDC64</button>'
      + '<button class="msg-item-btn msg-item-btn--del" onclick="event.stopPropagation();deleteConversation(' + u.id + ',\'' + en + '\')" title="Delete conversation">\uD83D\uDDD1</button>'
      + '</div></div>';
  }).join('');
  const total = convs.reduce((sum, c) => sum + (c.unread || 0), 0);
  updateMsgBadge(total);
}

async function loadConversations() {
  const list = document.getElementById('msg-conv-list');
  try {
    const convs = await api('GET', '/api/conversations');
    renderConvList(convs);
  } catch {
    if (list) list.innerHTML = '<div style="padding:18px;color:var(--gray)">Could not load</div>';
  }
}

async function openConversation(userId, name) {
  if (!S.user) return;
  S.activeConv = userId;
  stopPolling();
  document.getElementById('page-messages').classList.add('conv-open');

  // Instantly clear the unread dot for this conversation in the DOM
  const items = document.querySelectorAll('.msg-item');
  items.forEach(item => {
    if (item.getAttribute('onclick') && item.getAttribute('onclick').includes('openConversation(' + userId + ',')) {
      const dot = item.querySelector('.conv-unread-dot');
      if (dot) dot.remove();
      const preview = item.querySelector('.msg-item-preview');
      if (preview) preview.classList.remove('unread-preview');
    }
  });
  // Decrement the global nav badge immediately
  const navBadge = document.querySelector('#nav-msg-link .nav-badge');
  if (navBadge) {
    const cur = parseInt(navBadge.textContent) || 0;
    if (cur <= 1) navBadge.remove(); else navBadge.textContent = cur - 1;
  }

  // Fetch partner avatar for topbar
  const color    = COLORS[userId % COLORS.length];
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  let topbarAv = '<div class="card-avatar" style="background:' + color + ';width:40px;height:40px;font-size:.88rem">' + initials + '</div>';

  const en   = name.replace(/'/g, "\\'");
  const main = document.getElementById('msg-main');
  main.innerHTML =
    '<div class="msg-topbar">'
    + '<button class="msg-back-btn" onclick="closeMobileConversation()" aria-label="Back to conversations">\u2190 Back</button>'
    + '<div class="msg-topbar-left" onclick="viewProfile(' + userId + ')" style="cursor:pointer;gap:12px">'
    + topbarAv
    + '<div>'
    + '<div class="msg-topbar-name">' + name + '</div>'
    + '<div style="font-size:.75rem;color:var(--blue)">View profile \u2192</div>'
    + '</div></div>'
    + '<div style="display:flex;gap:8px;align-items:center">'
    + '<button class="btn-view" style="font-size:.82rem;padding:8px 14px" onclick="viewProfile(' + userId + ')">Profile</button>'
    + '<button class="btn-primary" style="font-size:.82rem;padding:8px 16px" onclick="openSchedule(' + userId + ',\'' + en + '\')">Schedule Session</button>'
    + '</div></div>'
    + '<div class="msg-body" id="msg-body"></div>'
    + '<div class="msg-footer">'
    + '<input type="text" class="msg-input" id="msg-in" placeholder="Type your message\u2026" onkeydown="if(event.key===\'Enter\')sendMsg(' + userId + ')"/>'
    + '<button class="msg-send" onclick="sendMsg(' + userId + ')">Send</button>'
    + '</div>';

  // Fetch avatar in background without blocking chat open
  api('GET', '/api/users/' + userId).then(tu => {
    if (tu && tu.avatar) {
      const avEl = document.querySelector('.msg-topbar .card-avatar');
      if (avEl) avEl.outerHTML = '<div class="card-avatar" style="background:' + color + ';width:40px;height:40px;overflow:hidden;padding:0"><img src="' + tu.avatar + '" alt="' + name + '" style="width:100%;height:100%;object-fit:cover"/></div>';
    }
  }).catch(() => {});

  await fetchMessages(userId);
  loadConversations();

  // Poll every 2s for messages only — conversations update separately at 5s
  let _pollCount = 0;
  S.pollTimer = setInterval(async () => {
    if (S.activeConv !== userId || S.page !== 'messages') { stopPolling(); return; }
    await fetchMessagesSilent(userId);
    _pollCount++;
    // Only refresh conversation list every 5th tick (every 10s) to avoid flooding
    if (_pollCount % 5 === 0) loadConversations();
  }, 2000);
}

function stopPolling() {
  if (S.pollTimer)    { clearInterval(S.pollTimer);    S.pollTimer    = null; }
  if (S.sidebarTimer) { clearInterval(S.sidebarTimer); S.sidebarTimer = null; }
}

function closeMobileConversation() {
  document.getElementById('page-messages').classList.remove('conv-open');
  S.activeConv = null;
  stopPolling();
  loadConversations();
}

// renderMessages builds the chat bubbles.
// Right-click or double-click a bubble to get a context menu (unsend, copy).
function renderMessages(msgs, body) {
  if (!msgs || !Array.isArray(msgs)) return;
  body.innerHTML = msgs.map(m => {
    const isMe = m.sender_id === S.user.id;
    const tick = isMe
      ? (m.is_read
          ? '<span style="color:#5DCAA5;font-size:.65rem;margin-left:3px">&#10003;&#10003;</span>'
          : m.is_delivered
            ? '<span style="color:rgba(255,255,255,.65);font-size:.65rem;margin-left:3px">&#10003;&#10003;</span>'
            : '<span style="color:rgba(255,255,255,.45);font-size:.65rem;margin-left:3px">&#10003;</span>')
      : '';
    return '<div class="msg-bubble-row ' + (isMe ? 'me' : '') + '" data-msg-id="' + m.id + '"'
      + ' ondblclick="showMsgMenu(event,' + m.id + ',' + (isMe ? 1 : 0) + ')"'
      + ' oncontextmenu="showMsgMenu(event,' + m.id + ',' + (isMe ? 1 : 0) + ');return false;">'
      + '<div class="msg-bubble ' + (isMe ? 'me' : 'them') + '">'
      + m.content
      + '<div class="msg-time">' + new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) + tick + '</div>'
      + '</div></div>';
  }).join('');
  body.scrollTop = body.scrollHeight;
}

// Context menu: appears on right-click or double-click on a message bubble
function showMsgMenu(e, msgId, isMe) {
  e.preventDefault();
  closeMsgMenu();
  const menu = document.createElement('div');
  menu.id = 'msg-ctx-menu';
  menu.className = 'msg-ctx-menu';
  menu.innerHTML =
    (isMe ? '<button onclick="closeMsgMenu();deleteMessage(' + msgId + ')">\uD83D\uDDD1 Unsend / Delete</button>' : '')
    + '<button onclick="closeMsgMenu();copyMsgText(' + msgId + ')">\uD83D\uDCCB Copy</button>'
    + '<button onclick="closeMsgMenu()">\u2715 Cancel</button>';
  menu.style.left = Math.min(e.clientX, window.innerWidth  - 170) + 'px';
  menu.style.top  = Math.min(e.clientY, window.innerHeight - 130) + 'px';
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', closeMsgMenu, {once: true}), 10);
}
function closeMsgMenu() { const m = document.getElementById('msg-ctx-menu'); if (m) m.remove(); }
function copyMsgText(msgId) {
  const row = document.querySelector('[data-msg-id="' + msgId + '"] .msg-bubble');
  if (!row) return;
  navigator.clipboard.writeText(row.childNodes[0].textContent.trim()).then(() => showToast('Copied!'));
}

async function fetchMessages(userId) {
  _fetchLock = false; // force-release lock so this full fetch always runs
  const body = document.getElementById('msg-body');
  if (!body) return;
  try {
    _fetchLock = true;
    const msgs = await api('GET', '/api/messages?with=' + userId);
    renderMessages(msgs || [], body);
  } catch {}
  finally { _fetchLock = false; }
}

// Silent version: only re-renders if message count changed (avoids flicker while typing)
let _fetchLock = false;
async function fetchMessagesSilent(userId) {
  if (_fetchLock) return;
  _fetchLock = true;
  const body = document.getElementById('msg-body');
  if (!body) { _fetchLock = false; return; }
  try {
    const msgs = await api('GET', '/api/messages?with=' + userId);
    const list = msgs || [];
    const currentRows = body.querySelectorAll('.msg-bubble-row');
    // Re-render if message count changed OR if read/delivered status changed
    const statusChanged = list.some((m, i) => {
      if (m.sender_id !== S.user.id) return false;
      const row = currentRows[i];
      if (!row) return false;
      const hasGreenTick  = !!row.querySelector('span[style*="5DCAA5"]');
      const hasDoubleTick = row.querySelectorAll('span').length > 0 &&
                            row.querySelector('.msg-time').textContent.includes('\u2713\u2713');
      return (m.is_read && !hasGreenTick) || (m.is_delivered && !hasDoubleTick && !hasGreenTick);
    });
    if (list.length !== currentRows.length || statusChanged) {
      renderMessages(list, body);
    }
    // Show browser notification for new incoming messages when tab is hidden
    if (list.length > currentRows.length) {
      const newMsgs = list.slice(currentRows.length);
      newMsgs.forEach(m => {
        if (m.sender_id !== S.user.id && document.hidden) {
          showMsgNotification(m.sender_name || 'Someone', m.content);
        }
      });
    }
  } catch {}
  finally { _fetchLock = false; }
}

async function sendMsg(userId) {
  const input   = document.getElementById('msg-in');
  const content = input.value.trim(); if (!content) return;
  input.value   = '';

  // Show message immediately without waiting for server response
  const body = document.getElementById('msg-body');
  if (body) {
    const temp = document.createElement('div');
    temp.className = 'msg-bubble-row me';
    temp.id = 'msg-sending-temp';
    temp.innerHTML = '<div class="msg-bubble me">' + content + '<div class="msg-time" style="opacity:.6">sending…</div></div>';
    body.appendChild(temp);
    body.scrollTop = body.scrollHeight;
  }

  try {
    await api('POST', '/api/messages', {receiver_id: userId, content});
    fetchMessages(userId);
  } catch(e) {
    const temp = document.getElementById('msg-sending-temp');
    if (temp) temp.remove();
    showToast('Could not send: ' + e.message);
  }
}

async function deleteMessage(msgId) {
  try {
    await api('DELETE', '/api/messages/' + msgId);
    if (S.activeConv) fetchMessages(S.activeConv);
  } catch(e) { showToast('Could not unsend: ' + e.message); }
}

async function deleteConversation(userId, name) {
  if (!confirm('Delete entire conversation with ' + name + '? This cannot be undone.')) return;
  try {
    await api('DELETE', '/api/conversations/' + userId);
    if (S.activeConv === userId) {
      S.activeConv = null;
      const main = document.getElementById('msg-main');
      if (main) main.innerHTML = '<div class="msg-empty"><span style="font-size:2.2rem">\uD83D\uDCAC</span><span>Select a conversation to start messaging</span></div>';
    }
    loadConversations();
    showToast('Conversation deleted');
  } catch(e) { showToast('Could not delete: ' + e.message); }
}

// ── Schedule ─────────────────────────────────────────
// openSchedule populates the schedule form with both users' skills as dropdowns
async function openSchedule(userId, name) {
  if (!S.user) { openAuthModal('login'); return; }
  S.scheduleWith = userId;
  document.getElementById('sched-title').textContent = 'Skill Swap with ' + name;
  showPage('schedule');

  let partner = { teach: [], learn: [] };
  try { partner = await api('GET', '/api/users/' + userId); } catch {}

  const myTeach  = S.user.teach  || [];
  const partTeach = partner.teach || [];
  const teachOpts = myTeach.length   ? myTeach   : ['(add teach skills to your profile)'];
  const learnOpts = partTeach.length ? partTeach : ['(partner has no teach skills listed)'];

  const teachSel = document.getElementById('sched-teach-sel');
  const learnSel = document.getElementById('sched-learn-sel');
  teachSel.innerHTML = '<option value="">— select a skill —</option>'
    + teachOpts.map(s => '<option value="' + s + '">' + s + '</option>').join('');
  learnSel.innerHTML = '<option value="">— select a skill —</option>'
    + learnOpts.map(s => '<option value="' + s + '">' + s + '</option>').join('');
  if (teachOpts.length) teachSel.value = teachOpts[0];
  if (learnOpts.length) learnSel.value = learnOpts[0];
}

function selType(btn, type) {
  document.querySelectorAll('.type-btn').forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-pressed', 'false'); });
  btn.classList.add('selected');
  btn.setAttribute('aria-pressed', 'true');
  S.scheduleType = type;
  // Show call link field only for video or recorded session types
  const linkGroup = document.getElementById('sched-link-group');
  if (linkGroup) linkGroup.style.display = (type === 'video' || type === 'recorded') ? '' : 'none';
}

async function confirmSession() {
  const date       = document.getElementById('sched-date').value;
  const time       = document.getElementById('sched-time').value;
  const teachSkill = document.getElementById('sched-teach-sel')?.value || '';
  const learnSkill = document.getElementById('sched-learn-sel')?.value || '';
  const callLink   = document.getElementById('sched-call-link')?.value?.trim() || '';

  if (!date || !time)  { showToast('Please select a date and time'); return; }
  if (!S.scheduleWith) { showToast('No partner selected'); return; }
  if (!teachSkill)     { showToast('Please select a skill you will teach'); return; }
  if (!learnSkill)     { showToast('Please select a skill you want to learn'); return; }

  const btn = document.querySelector('#page-schedule .btn-primary');
  btn.disabled = true; btn.textContent = 'Sending request\u2026';
  try {
    await api('POST', '/api/sessions', {
      partner_id:   S.scheduleWith,
      date, time,
      session_type: S.scheduleType,
      duration:     parseInt(document.getElementById('sched-dur').value),
      agenda:       document.getElementById('sched-agenda').value,
      teach_skill:  teachSkill,
      learn_skill:  learnSkill,
      call_link:    callLink,
    });
    document.getElementById('sched-call-link').value = '';
    document.getElementById('sched-agenda').value    = '';
    showSuccess('\uD83D\uDCC5', 'Request Sent!',
      'Your session request for ' + date + ' at ' + time + ' has been sent. Waiting for confirmation.',
      () => showPage('sessions'));
  } catch(e) { showToast('Error: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Send Session Request'; }
}

// ── Sessions list ────────────────────────────────────
async function loadSessions() {
  const list = document.getElementById('sessions-list');
  try {
    const sessions = await api('GET', '/api/sessions');
    if (!sessions || !sessions.length) {
      list.innerHTML = '<div class="sessions-empty"><div style="font-size:2.5rem;margin-bottom:16px">📅</div><h3>No sessions yet</h3><p>Browse people with skills you want to learn and send them a session request!</p><button class="btn-primary" style="margin-top:16px" onclick="showPage(\'browse\')">Browse Skills</button></div>';
      return;
    }
    list.innerHTML = sessions.map(s => renderSessionCard(s)).join('');
  } catch(e) { list.innerHTML = '<div style="color:var(--gray)">Could not load sessions</div>'; }
}

// sessionHasPassed checks if the session end time (start + duration) is in the past.
// This is used to decide when to show the rating form.
function sessionHasPassed(s) {
  if (!s.date || !s.time) return false;
  const startDt = new Date(s.date + 'T' + s.time);
  const endDt   = new Date(startDt.getTime() + (s.duration || 60) * 60000);
  return endDt < new Date();
}

// getSessionStatus returns the derived display status.
// A confirmed session becomes "completed" once the end time has passed.
function getSessionStatus(s) {
  if (s.status === 'cancelled' || s.status === 'declined') return s.status;
  if (s.status === 'pending')   return 'pending';
  if (s.status === 'confirmed') return sessionHasPassed(s) ? 'completed' : 'confirmed';
  return s.status;
}

// renderSessionCard builds the HTML for a single session card.
// Different states (pending/confirmed/completed) show different action buttons.
function renderSessionCard(s) {
  const isRequester   = S.user && s.requester_id === S.user.id;
  const otherName     = isRequester ? s.partner_name : s.requester_name;
  const typeLabel     = s.session_type === 'video'     ? '\uD83C\uDFA5 Video Call'
                      : s.session_type === 'in-person' ? '\uD83D\uDC65 In-Person' : '\uD83C\uDFA6 Recorded';
  const derivedStatus = getSessionStatus(s);
  const isPending     = derivedStatus === 'pending';
  const isConfirmed   = derivedStatus === 'confirmed';
  const isCompleted   = derivedStatus === 'completed';
  const isReceiver    = !isRequester;
  const alreadyRated  = isRequester ? s.requester_rated > 0 : s.partner_rated > 0;
  const canRate       = isCompleted && !alreadyRated;
  let actionHtml = '';

  // Receiver (the person who received the request) gets confirm/decline/reschedule buttons
  if (isPending && isReceiver) {
    actionHtml =
      '<div class="session-actions">'
      + '<button class="sa-btn sa-confirm"    onclick="sessionAction(' + s.id + ',\'confirm\')">\u2713 Confirm</button>'
      + '<button class="sa-btn sa-decline"    onclick="sessionAction(' + s.id + ',\'decline\'">\u2715 Decline</button>'
      + '<button class="sa-btn sa-reschedule" onclick="openReschedule(' + s.id + ')">\uD83D\uDCC3 Suggest New Time</button>'
      + '</div>';
  }
  // Sender (the person who sent the request) can edit or cancel
  if (isPending && isRequester) {
    actionHtml =
      '<div class="session-awaiting">\u23F3 Waiting for ' + otherName + ' to confirm\u2026</div>'
      + '<div class="session-actions" style="margin-top:10px">'
      + '<button class="sa-btn sa-reschedule" onclick="openReschedule(' + s.id + ')">\u270F\uFE0F Edit Time</button>'
      + '<button class="sa-btn sa-decline"    onclick="sessionAction(' + s.id + ',\'cancel\')">\u2715 Cancel Request</button>'
      + '</div>';
  }

  // Confirmed — show call link (video) or recording link (recorded), plus reschedule/cancel
  if (isConfirmed) {
    if (s.call_link && s.session_type !== 'recorded') {
      actionHtml += '<div class="session-actions" style="margin-top:12px">'
        + '<a href="' + s.call_link + '" target="_blank" rel="noopener" class="sa-btn sa-confirm" style="text-decoration:none">\uD83C\uDFA5 Join Video Call</a>'
        + '</div>';
    }
    // For recorded sessions: show the link if added, or a form to add it
    if (s.session_type === 'recorded') {
      if (s.call_link) {
        actionHtml += '<div class="session-actions" style="margin-top:12px">'
          + '<a href="' + s.call_link + '" target="_blank" rel="noopener" class="sa-btn sa-reschedule" style="text-decoration:none">\uD83C\uDFA6 View Recording</a>'
          + '</div>';
      } else if (isRequester) {
        actionHtml += '<div class="session-actions" style="margin-top:12px;flex-direction:column;align-items:flex-start;gap:8px">'
          + '<span style="font-size:.82rem;color:var(--muted)">Paste a recording link so the other person can watch later:</span>'
          + '<div style="display:flex;gap:8px;width:100%">'
          + '<input type="url" id="rec-link-' + s.id + '" placeholder="https://drive.google.com/... or YouTube link" style="flex:1;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.85rem"/>'
          + '<button class="sa-btn sa-confirm" onclick="saveRecordingLink(' + s.id + ')">Save Link</button>'
          + '</div></div>';
      }
    }
    actionHtml += '<div class="session-actions">'
      + '<button class="sa-btn sa-reschedule" onclick="openReschedule(' + s.id + ')">\u270F\uFE0F Edit / Reschedule</button>'
      + (isRequester ? '<button class="sa-btn sa-decline" onclick="sessionAction(' + s.id + ',\'cancel\')">\u2715 Cancel Session</button>' : '')
      + '</div>';
  }

  // Completed — show recording link if exists, and rating section
  if (isCompleted && s.session_type === 'recorded' && s.call_link) {
    actionHtml += '<div class="session-actions">'
      + '<a href="' + s.call_link + '" target="_blank" rel="noopener" class="sa-btn sa-reschedule" style="text-decoration:none">\uD83C\uDFA6 View Recording</a>'
      + '</div>';
  }

  if (s.status === 'declined')  actionHtml += '<div class="session-awaiting" style="color:#DC2626">\u2715 Declined by ' + otherName + '</div>';
  if (s.status === 'cancelled') actionHtml += '<div class="session-awaiting" style="color:#DC2626">\u2715 Cancelled</div>';

  // Rating form — only shown after the session end time has passed
  if (canRate) {
    actionHtml += '<div class="session-rate" id="rate-' + s.id + '">'
      + '<span style="font-size:.85rem;font-weight:600;color:var(--muted)">How was your session with ' + otherName + '? Leave a rating:</span>'
      + '<div class="star-picker" id="stars-' + s.id + '" data-selected="0">'
      + [1,2,3,4,5].map(n =>
          '<span class="star" data-n="' + n + '"'
          + ' onmouseover="hoverStars(' + s.id + ',' + n + ')"'
          + ' onmouseout="hoverStars(' + s.id + ',0)"'
          + ' onclick="selectStar(' + s.id + ',' + n + ')">\u2606</span>'
        ).join('')
      + '</div>'
      + '<button class="sa-btn sa-confirm" id="rate-submit-' + s.id + '" style="display:none" onclick="confirmRating(' + s.id + ')">Submit Rating</button>'
      + '<p id="rate-hint-' + s.id + '" style="font-size:.76rem;color:var(--gray);margin-top:4px"></p>'
      + '</div>';
  }
  if (isCompleted && alreadyRated) {
    const myStars = isRequester ? s.requester_rated : s.partner_rated;
    actionHtml += '<div class="session-rated">Your rating: '
      + '\u2605'.repeat(myStars) + '\u2606'.repeat(5 - myStars) + '</div>';
  }

  // Reschedule form (hidden by default, toggled by openReschedule)
  const rescheduleForm =
    '<div class="reschedule-form" id="reschedule-' + s.id + '" style="display:none">'
    + '<p style="font-size:.83rem;color:var(--muted);margin-bottom:10px">Suggest a new time — the other person will need to re-confirm.</p>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">'
    + '<div><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:4px">New Date</label>'
    + '<input type="date" id="rs-date-' + s.id + '" class="teal-input" min="' + new Date().toISOString().split('T')[0] + '"/></div>'
    + '<div><label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:4px">New Time</label>'
    + '<input type="time" id="rs-time-' + s.id + '" class="teal-input" value="18:00"/></div>'
    + '<button class="sa-btn sa-confirm" onclick="submitReschedule(' + s.id + ')">Send Suggestion</button>'
    + '<button class="sa-btn sa-decline" onclick="document.getElementById(\'reschedule-' + s.id + '\').style.display=\'none\'">Cancel</button>'
    + '</div></div>';

  const completedLabel = isCompleted ? ' <span style="color:#22C55E;font-size:.75rem">\u2713 Completed</span>' : '';

  return '<div class="session-card" id="session-' + s.id + '">'
    + '<div class="session-card-header">'
    + '<div>'
    + '<h3>Skill Swap with ' + otherName + '</h3>'
    + '<div class="session-meta">'
    + '<span>\uD83D\uDCC5 ' + s.date + ' at ' + s.time + completedLabel + '</span>'
    + '<span>\uD83D\uDD50 ' + s.duration + ' min</span>'
    + '<span>' + typeLabel + '</span>'
    + '</div>'
    + (s.teach_skill ? '<div style="font-size:.82rem;color:var(--muted);margin-top:4px">You teach: <strong>' + s.teach_skill + '</strong></div>' : '')
    + '</div>'
    + '<span class="status-badge status-' + derivedStatus + '">' + (derivedStatus === 'completed' ? '\u2713 completed' : s.status) + '</span>'
    + '</div>'
    + (s.agenda ? '<p class="session-agenda">' + s.agenda.slice(0, 160) + (s.agenda.length > 160 ? '\u2026' : '') + '</p>' : '')
    + (isCompleted && !alreadyRated ? '<div class="session-processing">\u2713 Session completed \u2014 please leave your rating below</div>' : '')
    + actionHtml
    + rescheduleForm
    + '</div>';
}

// ── Star rating ───────────────────────────────────────
function hoverStars(sessionId, n) {
  const picker   = document.getElementById('stars-' + sessionId);
  if (!picker) return;
  const selected = parseInt(picker.dataset.selected || '0');
  picker.querySelectorAll('.star').forEach((s, i) => {
    const active   = n > 0 ? i < n : i < selected;
    s.textContent  = active ? '\u2605' : '\u2606';
    s.style.color  = active ? '#F59E0B' : '#D1D5DB';
  });
}

function selectStar(sessionId, n) {
  const picker = document.getElementById('stars-' + sessionId);
  if (!picker) return;
  picker.dataset.selected = n;
  hoverStars(sessionId, n);
  const labels = ['', '\uD83D\uDE1E Poor', '\uD83D\uDE15 Fair', '\uD83D\uDE10 OK', '\uD83D\uDE0A Good', '\uD83E\uDD29 Excellent!'];
  const hint   = document.getElementById('rate-hint-' + sessionId);
  if (hint) hint.textContent = labels[n] || '';
  const btn = document.getElementById('rate-submit-' + sessionId);
  if (btn) { btn.style.display = ''; btn.textContent = 'Submit ' + n + ' Star' + (n === 1 ? '' : 's'); }
}

async function confirmRating(sessionId) {
  const picker = document.getElementById('stars-' + sessionId);
  if (!picker) return;
  const stars  = parseInt(picker.dataset.selected || '0');
  if (!stars) { showToast('Please select a star rating first'); return; }
  const labels = ['', 'Poor', 'Fair', 'OK', 'Good', 'Excellent'];
  if (!confirm('Submit ' + stars + ' star' + (stars===1?'':'s') + ' (' + labels[stars] + ')? You cannot change this later.')) return;
  try {
    await api('PUT', '/api/sessions/' + sessionId, {action: 'rate', stars});
    showToast('\u2B50 Rating submitted! Thank you.');
    setTimeout(loadSessions, 600);
  } catch(e) { showToast('Error: ' + e.message); }
}

async function sessionAction(sessionId, action) {
  try {
    await api('PUT', '/api/sessions/' + sessionId, {action});
    showToast(action === 'confirm' ? '\u2713 Session confirmed! Swap count updated.' : '\u2715 Session ' + action);
    loadSessions();
    refreshSessionBadge();
  } catch(e) { showToast('Error: ' + e.message); }
}

function openReschedule(sessionId) {
  const form = document.getElementById('reschedule-' + sessionId);
  if (form) form.style.display = form.style.display === 'none' ? '' : 'none';
}

async function submitReschedule(sessionId) {
  const date = document.getElementById('rs-date-' + sessionId)?.value;
  const time = document.getElementById('rs-time-' + sessionId)?.value;
  if (!date || !time) { showToast('Please pick a date and time'); return; }
  try {
    await api('PUT', '/api/sessions/' + sessionId, {action: 'reschedule', date, time});
    showToast('\uD83D\uDCC3 New time suggested!');
    loadSessions();
  } catch(e) { showToast('Error: ' + e.message); }
}

// saveRecordingLink is for "Recorded" sessions — the host pastes a link after recording.
// It's stored permanently in the session so both people can always find it.
async function saveRecordingLink(sessionId) {
  const input = document.getElementById('rec-link-' + sessionId);
  const link  = input?.value?.trim();
  if (!link) { showToast('Please enter a link'); return; }
  try {
    await api('PUT', '/api/sessions/' + sessionId, {action: 'add_recording', call_link: link});
    showToast('\uD83C\uDFA6 Recording link saved!');
    loadSessions();
  } catch(e) { showToast('Error: ' + e.message); }
}

// refreshSessionBadge counts pending sessions where the current user is the receiver
// and shows a badge on the Sessions nav link
async function refreshSessionBadge() {
  if (!S.user) return;
  try {
    const sessions = await api('GET', '/api/sessions');
    const pending  = (sessions||[]).filter(s => s.status === 'pending' && s.partner_id === S.user.id).length;
    const link     = document.getElementById('nav-sessions-link');
    if (!link) return;
    let badge = link.querySelector('.nav-badge');
    if (pending > 0) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'nav-badge'; link.appendChild(badge); }
      badge.textContent = pending;
    } else {
      if (badge) badge.remove();
    }
  } catch {}
}

// ── Admin ─────────────────────────────────────────────
// loadAdminUsers fetches all users and renders the admin panel with stats and action buttons.
async function loadAdminUsers() {
  const list = document.getElementById('admin-user-list');
  if (!list) return;
  list.innerHTML = '<div class="spinner">Loading\u2026</div>';
  try {
    const users = await api('GET', '/api/admin/users');
    if (!users.length) { list.innerHTML = '<p style="color:var(--gray)">No users found.</p>'; return; }

    const total  = users.length;
    const banned = users.filter(u => u.is_banned).length;
    const real   = users.filter(u => !u.email.endsWith('@skillswap.demo')).length;

    const statsHtml =
      '<div class="admin-stats">'
      + '<div class="admin-stat"><div class="admin-stat-n">' + total  + '</div><div class="admin-stat-l">Total Users</div></div>'
      + '<div class="admin-stat"><div class="admin-stat-n">' + real   + '</div><div class="admin-stat-l">Real Users</div></div>'
      + '<div class="admin-stat"><div class="admin-stat-n" style="color:#DC2626">' + banned + '</div><div class="admin-stat-l">Banned</div></div>'
      + '</div>';

    const searchHtml =
      '<div class="admin-search-row">'
      + '<input type="text" id="admin-search-input" class="admin-search-input" placeholder="Search by name or email\u2026" oninput="filterAdminUsers()"/>'
      + '</div>';

    const guideHtml =
      '<div class="admin-guide">'
      + '<div class="admin-guide-grid">'
      + '<div class="admin-guide-item"><span>\uD83D\uDEAB</span><div><strong>Ban</strong><p>Kicks out immediately, hides from browse</p></div></div>'
      + '<div class="admin-guide-item"><span>\u2713</span><div><strong>Unban</strong><p>Restores full access</p></div></div>'
      + '<div class="admin-guide-item"><span>\u26A0\uFE0F</span><div><strong>Warn</strong><p>Sends a warning to their inbox</p></div></div>'
      + '<div class="admin-guide-item"><span>\u2B50</span><div><strong>Make Admin</strong><p>Grants admin rights</p></div></div>'
      + '<div class="admin-guide-item"><span>\uD83D\uDDD1</span><div><strong>Delete</strong><p>Permanently removes all data</p></div></div>'
      + '</div></div>';

    const usersHtml = users.map(u => {
      const isSelf  = S.user && u.id === S.user.id;
      const isBot   = u.email.endsWith('@skillswap.demo');
      const stars   = '\u2605'.repeat(Math.round(u.rating)) + '\u2606'.repeat(5 - Math.round(u.rating));
      const en      = u.name.replace(/'/g, "\\'");
      const tags    = (u.is_admin  ? '<span class="admin-tag admin-tag--admin">Admin</span>'  : '')
                    + (u.is_banned ? '<span class="admin-tag admin-tag--banned">Banned</span>' : '')
                    + (isBot       ? '<span class="admin-tag admin-tag--bot">Demo Bot</span>'  : '')
                    + (isSelf      ? '<span class="admin-tag" style="background:#D1FAE5;color:#065F46">You</span>' : '');
      const avatar  = u.avatar
        ? '<img src="' + u.avatar + '" class="admin-avatar"/>'
        : '<div class="admin-avatar admin-avatar-init">' + (u.name[0] || '?').toUpperCase() + '</div>';

      const actions = (isSelf || isBot) ? '<span style="color:var(--gray);font-size:.82rem;padding:8px">\u2014</span>' :
        '<div class="admin-actions">'
        + (u.is_banned
          ? '<button class="sa-btn sa-confirm"    onclick="adminAction(\'unban\','  + u.id + ',\'' + en + '\')">\u2713 Unban</button>'
          : '<button class="sa-btn sa-decline"    onclick="adminAction(\'ban\','    + u.id + ',\'' + en + '\')">\uD83D\uDEAB Ban</button>')
        + '<button class="sa-btn sa-reschedule"   onclick="adminWarn('             + u.id + ',\'' + en + '\')">\u26A0\uFE0F Warn</button>'
        + (!u.is_admin ? '<button class="sa-btn sa-reschedule" style="background:#EDE9FE;color:#5B21B6" onclick="adminAction(\'make_admin\',' + u.id + ',\'' + en + '\')">\u2B50 Make Admin</button>' : '')
        + '<button class="sa-btn sa-decline" onclick="adminAction(\'delete\',' + u.id + ',\'' + en + '\')">\uD83D\uDDD1 Delete</button>'
        + '</div>';

      return '<div class="admin-user-row ' + (u.is_banned ? 'admin-banned' : '') + '">'
        + '<div class="admin-user-info">'
        + avatar
        + '<div>'
        + '<div class="admin-user-name">' + u.name + ' ' + tags + '</div>'
        + '<div class="admin-user-meta">' + u.email + ' \u00B7 ' + u.swaps + ' swaps \u00B7 ' + stars + ' ' + u.rating.toFixed(1) + ' \u00B7 Joined ' + u.created_at.slice(0, 10) + '</div>'
        + '</div></div>'
        + '<div class="admin-row-actions">' + actions + '</div>'
        + '</div>';
    }).join('');

    list.innerHTML = statsHtml + searchHtml + guideHtml + usersHtml;
  } catch(e) { list.innerHTML = '<p style="color:var(--gray)">Could not load: ' + e.message + '</p>'; }
}

// Warn modal — replaces browser prompt() with a proper styled modal
let _warnUserId = null;
let _warnUserName = null;

function adminWarn(userId, name) {
  _warnUserId   = userId;
  _warnUserName = name;
  const sub = document.getElementById('warn-modal-sub');
  if (sub) sub.textContent = 'Send a warning message to ' + name + '.';
  const input = document.getElementById('warn-msg-input');
  if (input) input.value = '';
  document.getElementById('warn-modal').classList.add('show');
  setTimeout(() => { if (input) input.focus(); }, 50);
}

function closeWarnModal() {
  document.getElementById('warn-modal').classList.remove('show');
  _warnUserId = null; _warnUserName = null;
}

async function submitWarn() {
  if (!_warnUserId) return;
  const msg = document.getElementById('warn-msg-input').value.trim();
  try {
    await api('PUT', '/api/admin/action', {action: 'warn', user_id: _warnUserId, warn_msg: msg});
    showToast('\u26A0\uFE0F Warning sent to ' + _warnUserName);
    closeWarnModal();
  } catch(e) { showToast('Error: ' + e.message); }
}

async function adminAction(action, userId, name) {
  const labels = {
    ban:       'Ban ' + name + '? They will be logged out immediately and cannot log back in.',
    unban:     'Unban ' + name + '? They will regain full access.',
    delete:    'Permanently delete ' + name + ' and ALL their data (messages, sessions, skills)? This CANNOT be undone.',
    make_admin:'Give ' + name + ' admin rights?'
  };
  if (!confirm(labels[action] || 'Are you sure?')) return;
  try {
    await api('PUT', '/api/admin/action', {action, user_id: userId});
    showToast(action === 'ban'        ? '\uD83D\uDEAB ' + name + ' banned'
            : action === 'unban'      ? '\u2713 ' + name + ' unbanned'
            : action === 'delete'     ? '\uD83D\uDDD1 ' + name + ' deleted'
            : '\u2B50 ' + name + ' is now admin');
    loadAdminUsers();
  } catch(e) { showToast('Error: ' + e.message); }
}

// ── Delete account ────────────────────────────────────
async function deleteAccount() {
  if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return;
  if (!confirm('Last chance \u2014 this will permanently delete your profile, messages and sessions.')) return;
  try {
    await api('DELETE', '/api/account');
    S.user = null; updateNav(); showPage('home');
    showToast('Account deleted. Sorry to see you go!');
  } catch(e) { showToast('Could not delete account: ' + e.message); }
}

// ── Modals & Toast ────────────────────────────────────
// ── Forgot Password ──────────────────────────────────
function openForgotModal() {
  const err = document.getElementById('forgot-err');
  if (err) err.classList.remove('show');
  const input = document.getElementById('forgot-email');
  if (input) input.value = '';
  document.getElementById('forgot-modal').classList.add('show');
  setTimeout(() => { if (input) input.focus(); }, 50);
}

function closeForgotModal() {
  document.getElementById('forgot-modal').classList.remove('show');
}

async function submitForgot() {
  const email = document.getElementById('forgot-email').value.trim();
  const err   = document.getElementById('forgot-err');
  const btn   = document.getElementById('forgot-btn');
  err.classList.remove('show');
  if (!email) { err.textContent = 'Please enter your email address'; err.classList.add('show'); return; }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) { err.textContent = 'Please enter a valid email address'; err.classList.add('show'); return; }
  btn.disabled = true; btn.textContent = 'Sending\u2026';
  try {
    await api('POST', '/api/forgot-password', {email});
    closeForgotModal();
    showToast('\uD83D\uDCE7 Reset link sent! Check your inbox.');
  } catch(e) {
    // Show success either way so we don't reveal which emails are registered
    closeForgotModal();
    showToast('\uD83D\uDCE7 If that email exists, a reset link has been sent.');
  } finally { btn.disabled = false; btn.textContent = 'Send Reset Link'; }
}

// ── Admin user search (client-side filter) ────────────
function filterAdminUsers() {
  const q = (document.getElementById('admin-search-input')?.value || '').toLowerCase().trim();
  document.querySelectorAll('.admin-user-row').forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = (!q || text.includes(q)) ? '' : 'none';
  });
}

function showSuccess(icon, title, msg, cb) {
  document.getElementById('sm-icon').textContent  = icon;
  document.getElementById('sm-title').textContent = title;
  document.getElementById('sm-msg').textContent   = msg;
  S.successCb = cb;
  document.getElementById('success-modal').classList.add('show');
}
function closeSuccess() {
  document.getElementById('success-modal').classList.remove('show');
  if (S.successCb) { S.successCb(); S.successCb = null; }
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ── Session preference ────────────────────────────────
// Show/hide the location field depending on session preference selection
function onPrefChange(radio) {
  const locGroup = document.getElementById('location-group');
  if (locGroup) {
    locGroup.style.display = (radio.value === 'in-person' || radio.value === 'both') ? '' : 'none';
  }
}

// ── Boot ─────────────────────────────────────────────
init();

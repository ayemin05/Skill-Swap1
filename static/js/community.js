/*
  Peerly — community.js
  Feed, posts, likes, comments, groups and the welcome (onboarding) flow.
  Uses api(), S, showPage(), showToast() from main.js and t() from i18n.js.
*/

const C = {
  feedScope:  'all',
  feedPosts:  [],
  groupId:    null,
  groupPosts: [],
  groups:     null,        // cached list of groups
  composerImg: {},         // composer id -> compressed image data URL
  emoji:      '💬',
  people:     {},          // user id -> name, for the "Say hi" buttons
};
const PAGE_SIZE = 20;
const GROUP_EMOJIS = ['💬','🇲🇲','🇫🇮','🌏','🗣️','💻','🎓','🍜','🎬','🎸','⚽','📚','💼','🧘','🎨','✈️'];

// ── Small helpers ─────────────────────────────────────────

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Escape first, then turn plain URLs into links and newlines into <br>
function richText(s) {
  return esc(s)
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" target="_blank" rel="noopener noreferrer nofollow">$1</a>')
    .replace(/\n/g, '<br>');
}

function parseTime(ts) {
  if (!ts) return new Date();
  let s = String(ts).replace(' ', 'T');
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += 'Z'; // SQLite stores UTC
  const d = new Date(s);
  return isNaN(d) ? new Date() : d;
}

function timeAgo(ts) {
  const sec = Math.max(0, (Date.now() - parseTime(ts).getTime()) / 1000);
  if (sec < 60)     return t('time.now');
  if (sec < 3600)   return t('time.m', {n: Math.floor(sec / 60)});
  if (sec < 86400)  return t('time.h', {n: Math.floor(sec / 3600)});
  if (sec < 604800) return t('time.d', {n: Math.floor(sec / 86400)});
  return parseTime(ts).toLocaleDateString(LANG === 'my' ? 'my-MM' : undefined, {day: 'numeric', month: 'short'});
}

function peerAvatar(a, size) {
  size = size || 40;
  const name = (a && a.name) || '?';
  const initials = name.split(/\s+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 2);
  const color = COLORS[((a && a.id) || 0) % COLORS.length];
  const style = 'width:' + size + 'px;height:' + size + 'px;background:' + color + ';font-size:' + Math.round(size * 0.38) + 'px';
  const img = a && a.avatar && /^\/(uploads|static)\//.test(a.avatar)
    ? '<img src="' + esc(a.avatar) + '" alt="" loading="lazy"/>' : esc(initials);
  return '<span class="p-av" style="' + style + '">' + img + '</span>';
}

// "1 member" vs "5 members" (Burmese has no plural, so it just uses the normal key)
function countLabel(key, n) {
  if (n === 1 && I18N[LANG][key.replace(/s$/, '1')]) return t(key.replace(/s$/, '1'));
  return t(key, {n: n});
}

function groupName(g) {
  return (LANG === 'my' && g.name_my) ? g.name_my : g.name;
}

function requireLogin() {
  if (S.user) return true;
  showToast(t('toast.loginFirst'));
  openAuthModal('register');
  return false;
}

// ── Navigation hooks (called from main.js) ────────────────

function goHome() { showPage(S.user ? 'feed' : 'home'); }

function onPageShown(pg) {
  updateTabbar();
  const steps = document.getElementById('pf-steps');
  if (steps) steps.style.display = (pg === 'create-profile' && S.onboarding) ? '' : 'none';

  if (pg === 'feed') {
    if (!S.user) { showPage('home'); return; }
    renderComposer('feed-composer', 0);
    loadFeed(false);
    loadSidebar();
  }
  if (pg === 'home')    { if (S.user) { showPage('feed'); return; } loadHomePreview(); }
  if (pg === 'groups')  loadGroupsPage();
  if (pg === 'onboard') renderOnboarding();
}

function updateTabbar() {
  const bar = document.getElementById('tabbar');
  if (!bar) return;
  bar.querySelectorAll('button').forEach(b => {
    const pg = b.getAttribute('data-pg');
    const active = pg === S.page || (pg === 'groups' && S.page === 'group');
    b.classList.toggle('active', active);
  });
}

function onLangChanged() {
  if (S.page === 'feed')    { renderComposer('feed-composer', 0); renderPostList('feed-list', C.feedPosts, C.feedScope === 'mine' ? t('feed.emptyMine') : t('feed.empty')); loadSidebar(); }
  if (S.page === 'groups')  renderGroupsGrid();
  if (S.page === 'group' && C.groupId) openGroup(C.groupId, true);
  if (S.page === 'home')    loadHomePreview();
  if (S.page === 'onboard') renderOnboarding();
}

// ── Composer ──────────────────────────────────────────────

function renderComposer(id, groupId) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!S.user) {
    el.innerHTML = '<div class="composer-guest">' + esc(t('comp.guest'))
      + ' <button class="btn-primary btn-sm" onclick="openAuthModal(\'register\')">' + esc(t('nav.join')) + '</button></div>';
    return;
  }
  const first = (S.user.name || '').split(' ')[0];
  let ph = t('comp.ph', {name: first});
  let where = '';
  if (groupId) {
    const g = (C.groups || []).find(x => x.id === groupId);
    if (g) ph = t('comp.phGroup', {group: groupName(g)});
  } else {
    // On the main feed you can choose which group to post in
    const mine = (C.groups || []).filter(g => g.is_member);
    where = '<select class="comp-where" id="' + id + '-group" aria-label="' + esc(t('comp.where')) + '">'
      + '<option value="0">🌍 ' + esc(t('comp.everyone')) + '</option>'
      + mine.map(g => '<option value="' + g.id + '">' + esc(g.emoji + ' ' + groupName(g)) + '</option>').join('')
      + '</select>';
  }
  C.composerImg[id] = null;
  el.innerHTML =
    '<div class="comp-row">' + peerAvatar(S.user, 42)
    + '<textarea id="' + id + '-text" rows="2" maxlength="3000" placeholder="' + esc(ph) + '" oninput="autoGrow(this)"></textarea></div>'
    + '<div class="comp-preview" id="' + id + '-preview"></div>'
    + '<div class="comp-actions">'
    + '<label class="comp-photo">🖼️ <span>' + esc(t('comp.photo')) + '</span>'
    + '<input type="file" accept="image/*" hidden onchange="pickComposerImage(\'' + id + '\', this)"/></label>'
    + where
    + '<button class="btn-primary btn-sm" id="' + id + '-btn" onclick="submitPost(\'' + id + '\',' + (groupId || 0) + ')">' + esc(t('comp.post')) + '</button>'
    + '</div>';
}

function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 320) + 'px';
}

// Shrink photos in the browser before upload — much faster on mobile data
function compressImage(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/gif') { // keep GIFs animated
      const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

async function pickComposerImage(id, input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) { showToast(t('toast.tooBig')); return; }
  try {
    const data = await compressImage(file, 1600, 0.85);
    if (data.length > 8 * 1024 * 1024) { showToast(t('toast.tooBig')); return; }
    C.composerImg[id] = data;
    document.getElementById(id + '-preview').innerHTML =
      '<div class="comp-img"><img src="' + data + '" alt=""/><button onclick="clearComposerImage(\'' + id + '\')" aria-label="Remove photo">✕</button></div>';
  } catch { showToast('Could not read that photo'); }
  input.value = '';
}

function clearComposerImage(id) {
  C.composerImg[id] = null;
  document.getElementById(id + '-preview').innerHTML = '';
}

async function submitPost(id, groupId) {
  if (!requireLogin()) return;
  const ta  = document.getElementById(id + '-text');
  const btn = document.getElementById(id + '-btn');
  const sel = document.getElementById(id + '-group');
  const content = ta.value.trim();
  const image = C.composerImg[id] || '';
  if (!content && !image) { ta.focus(); return; }
  const gid = groupId || (sel ? parseInt(sel.value, 10) : 0) || 0;
  btn.disabled = true; btn.textContent = t('comp.posting');
  try {
    const post = await api('POST', '/api/posts', {content, image, group_id: gid});
    ta.value = ''; ta.style.height = ''; clearComposerImage(id);
    if (id === 'group-composer') { C.groupPosts.unshift(post); renderPostList('group-feed', C.groupPosts, t('groups.empty')); }
    else { C.feedPosts.unshift(post); renderPostList('feed-list', C.feedPosts, t('feed.empty')); }
  } catch (e) { showToast(e.message); }
  finally { btn.disabled = false; btn.textContent = t('comp.post'); }
}

// ── Feed ──────────────────────────────────────────────────

function setFeedScope(scope, btn) {
  C.feedScope = scope;
  document.querySelectorAll('.feed-tab').forEach(b => b.classList.toggle('active', b === btn));
  loadFeed(false);
}

async function loadFeed(more) {
  const list = document.getElementById('feed-list');
  const moreBtn = document.getElementById('feed-more');
  if (!more) { C.feedPosts = []; if (!list.children.length) list.innerHTML = skeletonPosts(); }
  const before = more && C.feedPosts.length ? C.feedPosts[C.feedPosts.length - 1].id : 0;
  try {
    const posts = await api('GET', '/api/feed?scope=' + C.feedScope + (before ? '&before=' + before : ''));
    C.feedPosts = more ? C.feedPosts.concat(posts) : posts;
    renderPostList('feed-list', C.feedPosts, C.feedScope === 'mine' ? t('feed.emptyMine') : t('feed.empty'));
    moreBtn.style.display = posts.length === PAGE_SIZE ? '' : 'none';
  } catch { list.innerHTML = '<div class="no-results">Could not load the feed.</div>'; }
}

function skeletonPosts() {
  return '<div class="post skeleton"></div><div class="post skeleton"></div>';
}

function renderPostList(containerId, posts, emptyText) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!posts.length) { el.innerHTML = '<div class="feed-empty">' + esc(emptyText) + '</div>'; return; }
  el.innerHTML = posts.map(renderPost).join('');
}

function renderPost(p) {
  const showGroup = p.group_id && p.group_name && !(S.page === 'group' && C.groupId === p.group_id);
  const gname = (LANG === 'my' && p.group_name_my) ? p.group_name_my : p.group_name;
  const groupChip = showGroup
    ? ' <span class="post-in">' + esc(t('post.in')) + '</span> <a class="post-group" onclick="openGroup(' + p.group_id + ')">' + esc(p.group_emoji + ' ' + gname) + '</a>'
    : '';
  const del = p.can_delete
    ? '<button class="post-more" onclick="deletePostUI(' + p.id + ')" title="' + esc(t('post.delete')) + '">🗑</button>' : '';
  return '<article class="post" id="post-' + p.id + '">'
    + '<header class="post-head">'
    + '<a onclick="viewProfile(' + p.author.id + ')">' + peerAvatar(p.author, 42) + '</a>'
    + '<div class="post-meta"><div><a class="post-author" onclick="viewProfile(' + p.author.id + ')">' + esc(p.author.name) + '</a>' + groupChip + '</div>'
    + '<time datetime="' + esc(p.created_at) + '">' + esc(timeAgo(p.created_at)) + '</time></div>'
    + del + '</header>'
    + (p.content ? '<div class="post-body">' + richText(p.content) + '</div>' : '')
    + (p.image ? '<img class="post-img" src="' + esc(p.image) + '" alt="" loading="lazy" onclick="window.open(this.src)"/>' : '')
    + '<div class="post-actions">'
    + '<button class="pa-like' + (p.liked_by_me ? ' on' : '') + '" onclick="toggleLike(' + p.id + ', this)">'
    + '<span class="heart">' + (p.liked_by_me ? '❤️' : '🤍') + '</span> <span class="n">' + (p.like_count || '') + '</span> <span class="lbl">' + esc(t('post.like')) + '</span></button>'
    + '<button onclick="toggleComments(' + p.id + ')">💬 <span class="n" id="cc-' + p.id + '">' + (p.comment_count || '') + '</span> <span class="lbl">' + esc(t('post.comment')) + '</span></button>'
    + '</div>'
    + '<div class="post-comments" id="comments-' + p.id + '" hidden></div>'
    + '</article>';
}

function findPost(id) {
  return C.feedPosts.find(p => p.id === id) || C.groupPosts.find(p => p.id === id);
}

async function toggleLike(id, btn) {
  if (!requireLogin()) return;
  // Update the screen instantly, then confirm with the server
  const p = findPost(id);
  const wasOn = btn.classList.contains('on');
  const nEl = btn.querySelector('.n');
  const optimistic = (parseInt(nEl.textContent, 10) || 0) + (wasOn ? -1 : 1);
  btn.classList.toggle('on', !wasOn);
  btn.querySelector('.heart').textContent = wasOn ? '🤍' : '❤️';
  nEl.textContent = optimistic || '';
  btn.classList.add('pop'); setTimeout(() => btn.classList.remove('pop'), 300);
  try {
    const r = await api('POST', '/api/posts/' + id + '/like');
    nEl.textContent = r.like_count || '';
    btn.classList.toggle('on', r.liked);
    btn.querySelector('.heart').textContent = r.liked ? '❤️' : '🤍';
    if (p) { p.liked_by_me = r.liked; p.like_count = r.like_count; }
  } catch (e) { showToast(e.message); }
}

async function toggleComments(id) {
  const box = document.getElementById('comments-' + id);
  if (!box) return;
  if (!box.hidden) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = '<div class="cmt-loading">…</div>';
  try {
    const list = await api('GET', '/api/posts/' + id + '/comments');
    box.innerHTML = '<div class="cmt-list" id="cmt-list-' + id + '">'
      + (list.length ? list.map(renderComment).join('') : '<div class="cmt-none">' + esc(t('cmt.none')) + '</div>')
      + '</div>'
      + (S.user
        ? '<div class="cmt-form">' + peerAvatar(S.user, 30)
          + '<input type="text" id="cmt-in-' + id + '" maxlength="1000" placeholder="' + esc(t('cmt.ph')) + '" onkeydown="if(event.key===\'Enter\')sendComment(' + id + ')"/>'
          + '<button onclick="sendComment(' + id + ')">' + esc(t('cmt.send')) + '</button></div>'
        : '');
    const inp = document.getElementById('cmt-in-' + id);
    if (inp) inp.focus();
  } catch { box.innerHTML = '<div class="cmt-none">Could not load comments.</div>'; }
}

function renderComment(c) {
  return '<div class="cmt" id="cmt-' + c.id + '">'
    + '<a onclick="viewProfile(' + c.author.id + ')">' + peerAvatar(c.author, 30) + '</a>'
    + '<div class="cmt-bubble"><a class="cmt-author" onclick="viewProfile(' + c.author.id + ')">' + esc(c.author.name) + '</a>'
    + '<div>' + richText(c.content) + '</div></div>'
    + '<div class="cmt-meta">' + esc(timeAgo(c.created_at))
    + (c.can_delete ? ' · <a onclick="deleteCommentUI(' + c.id + ',' + c.post_id + ')">' + esc(t('post.delete')) + '</a>' : '')
    + '</div></div>';
}

async function sendComment(postId) {
  if (!requireLogin()) return;
  const inp = document.getElementById('cmt-in-' + postId);
  const content = (inp.value || '').trim();
  if (!content) return;
  inp.disabled = true;
  try {
    const c = await api('POST', '/api/posts/' + postId + '/comments', {content});
    const list = document.getElementById('cmt-list-' + postId);
    const none = list.querySelector('.cmt-none'); if (none) none.remove();
    list.insertAdjacentHTML('beforeend', renderComment(c));
    inp.value = '';
    bumpCommentCount(postId, 1);
  } catch (e) { showToast(e.message); }
  finally { inp.disabled = false; inp.focus(); }
}

function bumpCommentCount(postId, d) {
  const p = findPost(postId);
  if (p) p.comment_count = Math.max(0, (p.comment_count || 0) + d);
  const el = document.getElementById('cc-' + postId);
  if (el) el.textContent = (p ? p.comment_count : Math.max(0, (parseInt(el.textContent, 10) || 0) + d)) || '';
}

async function deleteCommentUI(id, postId) {
  try {
    await api('DELETE', '/api/comments/' + id);
    const el = document.getElementById('cmt-' + id); if (el) el.remove();
    bumpCommentCount(postId, -1);
  } catch (e) { showToast(e.message); }
}

async function deletePostUI(id) {
  if (!confirm(t('post.confirmDelete'))) return;
  try {
    await api('DELETE', '/api/posts/' + id);
    C.feedPosts  = C.feedPosts.filter(p => p.id !== id);
    C.groupPosts = C.groupPosts.filter(p => p.id !== id);
    const el = document.getElementById('post-' + id);
    if (el) { el.classList.add('removing'); setTimeout(() => el.remove(), 200); }
  } catch (e) { showToast(e.message); }
}

// ── Sidebar ───────────────────────────────────────────────

async function ensureGroups(force) {
  if (!C.groups || force) {
    try { C.groups = await api('GET', '/api/groups'); } catch { C.groups = C.groups || []; }
  }
  return C.groups;
}

async function loadSidebar() {
  const groups = await ensureGroups(true);
  renderComposer('feed-composer', 0); // refresh the group picker with fresh memberships
  const mine = groups.filter(g => g.is_member);
  const sg = document.getElementById('side-groups');
  if (sg) {
    sg.innerHTML = mine.length
      ? mine.slice(0, 6).map(g => '<a class="side-group" onclick="openGroup(' + g.id + ')"><span class="sg-emoji">' + esc(g.emoji) + '</span><span>' + esc(groupName(g)) + '</span></a>').join('')
      : '<p class="side-empty">' + esc(t('side.nogroups')) + '</p><button class="btn-secondary btn-sm" onclick="showPage(\'groups\')">' + esc(t('side.find')) + '</button>';
  }
  const sp = document.getElementById('side-people');
  if (sp) {
    try {
      const users = await api('GET', '/api/users');
      const pick = users.filter(u => !S.user || u.id !== S.user.id).sort((a, b) => (b.is_online - a.is_online)).slice(0, 4);
      sp.innerHTML = pick.map(u => '<div class="side-person"><a onclick="viewProfile(' + u.id + ')">' + peerAvatar(u, 36) + '</a>'
        + '<div class="sp-info"><a onclick="viewProfile(' + u.id + ')">' + esc(u.name) + (u.is_online ? ' <span class="online-dot"></span>' : '') + '</a>'
        + '<small>' + esc((u.teach || []).slice(0, 2).join(' · ')) + '</small></div>'
        + '<button class="sp-hi" onclick="sayHi(' + u.id + ')">' + esc(t('side.say')) + '</button></div>').join('');
      pick.forEach(u => { C.people[u.id] = u.name; });
    } catch { sp.innerHTML = ''; }
  }
}

function sayHi(id) { startMessage(id, C.people[id] || ''); }

// ── Groups ────────────────────────────────────────────────

async function loadGroupsPage() {
  await ensureGroups(true);
  renderGroupsGrid();
}

function renderGroupsGrid() {
  const grid = document.getElementById('groups-grid');
  if (!grid) return;
  const groups = C.groups || [];
  grid.innerHTML = groups.map(g =>
    '<div class="group-card">'
    + '<div class="gc-top" onclick="openGroup(' + g.id + ')"><span class="gc-emoji">' + esc(g.emoji) + '</span>'
    + '<div><h3>' + esc(groupName(g)) + '</h3>'
    + (LANG === 'my' && g.name_my ? '<div class="gc-alt">' + esc(g.name) + '</div>' : (g.name_my ? '<div class="gc-alt">' + esc(g.name_my) + '</div>' : ''))
    + '</div></div>'
    + '<p>' + esc(g.description) + '</p>'
    + '<div class="gc-foot"><span>' + esc(countLabel('groups.members', g.member_count)) + ' · ' + esc(countLabel('groups.posts', g.post_count)) + '</span>'
    + joinButton(g) + '</div></div>'
  ).join('');
}

function joinButton(g) {
  return g.is_member
    ? '<button class="gc-btn joined" onclick="event.stopPropagation();openGroup(' + g.id + ')">' + esc(t('groups.joined')) + '</button>'
    : '<button class="gc-btn" onclick="event.stopPropagation();joinGroup(' + g.id + ')">' + esc(t('groups.join')) + '</button>';
}

async function joinGroup(id, quiet) {
  if (!requireLogin()) return;
  try {
    const g = await api('POST', '/api/groups/' + id + '/join');
    replaceGroup(g);
    if (!quiet) showToast(t('groups.joinedToast', {group: groupName(g)}));
    if (S.page === 'groups') renderGroupsGrid();
    if (S.page === 'group')  renderGroupHero(g);
  } catch (e) { showToast(e.message); }
}

async function leaveGroup(id) {
  try {
    const g = await api('POST', '/api/groups/' + id + '/leave');
    replaceGroup(g);
    showToast(t('groups.leftToast', {group: groupName(g)}));
    renderGroupHero(g);
  } catch (e) { showToast(e.message); }
}

function replaceGroup(g) {
  if (!C.groups) C.groups = [];
  const i = C.groups.findIndex(x => x.id === g.id);
  if (i >= 0) C.groups[i] = g; else C.groups.push(g);
}

async function openGroup(id, keepPage) {
  C.groupId = id;
  if (!keepPage) showPage('group');
  await ensureGroups();
  let g = (C.groups || []).find(x => x.id === id);
  try { g = await api('GET', '/api/groups/' + id); replaceGroup(g); } catch {}
  if (!g) { showPage('groups'); return; }
  renderGroupHero(g);
  renderComposer('group-composer', id);
  loadGroupFeed(false);
}

function renderGroupHero(g) {
  const el = document.getElementById('group-hero');
  if (!el || C.groupId !== g.id) return;
  const canDelete = S.user && (S.user.is_admin || (g.created_by && g.created_by === S.user.id));
  el.innerHTML = '<div class="container gh-inner">'
    + '<a class="gh-back" onclick="showPage(\'groups\')">← ' + esc(t('nav.groups')) + '</a>'
    + '<div class="gh-row"><span class="gh-emoji">' + esc(g.emoji) + '</span><div>'
    + '<h1>' + esc(groupName(g)) + '</h1>'
    + (g.name_my && LANG !== 'my' ? '<div class="gh-alt">' + esc(g.name_my) + '</div>' : '')
    + '<p>' + esc(g.description) + '</p>'
    + '<div class="gh-stats">' + esc(countLabel('groups.members', g.member_count)) + ' · ' + esc(countLabel('groups.posts', g.post_count)) + '</div>'
    + '</div></div>'
    + '<div class="gh-actions">'
    + (g.is_member
      ? '<button class="btn-nav-outline nav-btn" onclick="leaveGroup(' + g.id + ')">' + esc(t('groups.leave')) + '</button>'
      : '<button class="btn-primary" onclick="joinGroup(' + g.id + ')">' + esc(t('groups.join')) + '</button>')
    + (canDelete ? '<button class="gh-del" onclick="deleteGroupUI(' + g.id + ')">' + esc(t('groups.delete')) + '</button>' : '')
    + '</div></div>';
}

async function loadGroupFeed(more) {
  const id = C.groupId;
  const list = document.getElementById('group-feed');
  const moreBtn = document.getElementById('group-more');
  if (!more) { C.groupPosts = []; list.innerHTML = skeletonPosts(); }
  const before = more && C.groupPosts.length ? C.groupPosts[C.groupPosts.length - 1].id : 0;
  try {
    const posts = await api('GET', '/api/feed?group=' + id + (before ? '&before=' + before : ''));
    if (C.groupId !== id) return;
    C.groupPosts = more ? C.groupPosts.concat(posts) : posts;
    renderPostList('group-feed', C.groupPosts, t('groups.empty'));
    moreBtn.style.display = posts.length === PAGE_SIZE ? '' : 'none';
  } catch { list.innerHTML = '<div class="no-results">Could not load posts.</div>'; }
}

async function deleteGroupUI(id) {
  if (!confirm(t('groups.confirmDelete'))) return;
  try {
    await api('DELETE', '/api/groups/' + id);
    C.groups = (C.groups || []).filter(g => g.id !== id);
    showPage('groups');
  } catch (e) { showToast(e.message); }
}

function openCreateGroup() {
  if (!requireLogin()) return;
  C.emoji = '💬';
  document.getElementById('cg-emoji').innerHTML = GROUP_EMOJIS.map(e =>
    '<button type="button" class="' + (e === C.emoji ? 'on' : '') + '" onclick="pickEmoji(this)">' + e + '</button>').join('');
  document.getElementById('cg-name').value = '';
  document.getElementById('cg-desc').value = '';
  document.getElementById('cg-err').classList.remove('show');
  document.getElementById('group-modal').classList.add('show');
  setTimeout(() => document.getElementById('cg-name').focus(), 50);
}

function pickEmoji(btn) {
  C.emoji = btn.textContent;
  btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
}

function closeCreateGroup() { document.getElementById('group-modal').classList.remove('show'); }

async function submitCreateGroup() {
  const name = document.getElementById('cg-name').value.trim();
  const description = document.getElementById('cg-desc').value.trim();
  const err = document.getElementById('cg-err');
  const btn = document.getElementById('cg-btn');
  err.classList.remove('show');
  if ([...name].length < 3) { err.textContent = t('cg.short'); err.classList.add('show'); return; }
  btn.disabled = true;
  try {
    const g = await api('POST', '/api/groups', {name, description, emoji: C.emoji});
    replaceGroup(g);
    closeCreateGroup();
    openGroup(g.id);
  } catch (e) { err.textContent = e.message; err.classList.add('show'); }
  finally { btn.disabled = false; }
}

// ── Onboarding (sign up → profile → groups → feed) ───────

function startOnboarding() {
  S.onboarding = true;
  S.teachTags = [...(S.user.teach || [])];
  S.learnTags = [...(S.user.learn || [])];
  showPage('create-profile');
  document.getElementById('pf-title').textContent = t('pf.create');
  document.getElementById('pf-name').value = S.user.name || '';
  renderTagsUI();
}

C.onboardPick = new Set();

async function renderOnboarding() {
  const el = document.getElementById('onboard-groups');
  const groups = await ensureGroups(true);
  groups.filter(g => g.is_member).forEach(g => C.onboardPick.add(g.id));
  el.innerHTML = groups.map(g =>
    '<button type="button" class="ob-group' + (C.onboardPick.has(g.id) ? ' on' : '') + '" onclick="toggleOnboardGroup(' + g.id + ', this)">'
    + '<span class="gc-emoji">' + esc(g.emoji) + '</span>'
    + '<span class="ob-text"><b>' + esc(groupName(g)) + '</b><small>' + esc(countLabel('groups.members', g.member_count)) + '</small></span>'
    + '<span class="ob-check">✓</span></button>'
  ).join('');
}

function toggleOnboardGroup(id, btn) {
  if (C.onboardPick.has(id)) C.onboardPick.delete(id); else C.onboardPick.add(id);
  btn.classList.toggle('on', C.onboardPick.has(id));
}

async function finishOnboarding() {
  if (!C.onboardPick.size) { showToast(t('onb.pick')); return; }
  const btn = document.getElementById('onboard-done');
  btn.disabled = true;
  try {
    await Promise.all([...C.onboardPick].map(id => api('POST', '/api/groups/' + id + '/join')));
    await api('POST', '/api/onboarded');
    S.user.onboarded = true;
    S.onboarding = false;
    C.feedScope = 'mine';
    document.querySelectorAll('.feed-tab').forEach(b => b.classList.toggle('active', b.getAttribute('data-scope') === 'mine'));
    showPage('feed');
    showToast(t('onb.welcome', {name: (S.user.name || '').split(' ')[0]}));
  } catch (e) { showToast(e.message); }
  finally { btn.disabled = false; }
}

// ── Landing page preview ──────────────────────────────────

async function loadHomePreview() {
  try {
    const [posts, stats] = await Promise.all([api('GET', '/api/feed'), api('GET', '/api/stats')]);
    const box = document.getElementById('home-preview');
    box.innerHTML = posts.slice(0, 3).map(p =>
      '<div class="pv-post">' + peerAvatar(p.author, 34)
      + '<div><div class="pv-post-head"><b>' + esc(p.author.name) + '</b>'
      + (p.group_name ? ' <span>' + esc(p.group_emoji + ' ' + ((LANG === 'my' && p.group_name_my) ? p.group_name_my : p.group_name)) + '</span>' : '') + '</div>'
      + '<p>' + esc(p.content.length > 140 ? p.content.slice(0, 140) + '…' : p.content) + '</p>'
      + '<small>❤️ ' + p.like_count + ' · 💬 ' + p.comment_count + ' · ' + esc(timeAgo(p.created_at)) + '</small></div></div>'
    ).join('') || '<div class="pv-post"><p>' + esc(t('feed.empty')) + '</p></div>';
    document.getElementById('p-stats').innerHTML =
      '<span><b>' + stats.members + '</b> ' + esc(t('home.members')) + '</span>'
      + '<span><b>' + stats.groups + '</b> ' + esc(t('home.groupsN')) + '</span>'
      + '<span><b>' + stats.posts + '</b> ' + esc(t('home.postsN')) + '</span>';
  } catch {}
}

// Keep "2m ago" labels fresh while the page is open
setInterval(() => {
  document.querySelectorAll('.post time[datetime]').forEach(el => { el.textContent = timeAgo(el.getAttribute('datetime')); });
}, 60000);

// Close the create-group modal when clicking the dark background
document.getElementById('group-modal').addEventListener('click', e => { if (e.target.id === 'group-modal') closeCreateGroup(); });

if (S.page === 'home' && !S.user) loadHomePreview();

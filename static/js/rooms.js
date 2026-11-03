/*
  Peerly — rooms.js
  Live rooms: Watch together (YouTube or an uploaded video, synced for everyone),
  Study rooms (shared focus/break timer) and Hangouts (just voice + chat).
  Every room has live chat, a "who's here" list and optional voice/video/screen share.

  Sync idea: the server stores {video, playing, position, state_at}. Each browser works
  out where the video *should* be right now and quietly corrects itself if it drifts.
*/

const R = {
  rooms: [],
  kindFilter: 'all',
  room: null,        // the room that's open
  state: null,       // playback state
  timer: null,       // study timer
  offset: 0,         // server clock - local clock (ms)
  es: null,          // EventSource
  player: null,      // player adapter
  loadedId: null,
  ignoreUntil: 0,    // ignore player events we caused ourselves until this time
  driftTimer: null,
  tickTimer: null,
  clientId: Math.random().toString(36).slice(2, 10),
  newKind: 'watch',
  lastPhase: null,
  ytReady: null,
};
const REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👏'];
const KIND_ICON = {watch: '🍿', study: '📚', hangout: '🎧'};

const serverNow = () => Date.now() + R.offset;

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}

function isFileVideo(id) { return (id || '').startsWith('file:'); }

// ── Rooms list ────────────────────────────────────────────

async function loadRoomsPage() {
  const grid = document.getElementById('rooms-grid');
  if (!R.rooms.length) grid.innerHTML = '<div class="spinner">…</div>';
  try { R.rooms = await api('GET', '/api/rooms'); } catch { R.rooms = []; }
  renderRoomsGrid();
}

function setRoomKind(kind, btn) {
  R.kindFilter = kind;
  document.querySelectorAll('.rk-chip').forEach(b => b.classList.toggle('active', b === btn));
  renderRoomsGrid();
}

function roomCardHtml(r) {
  const thumb = r.kind === 'watch' && r.state.video_id && !isFileVideo(r.state.video_id)
    ? '<img src="https://i.ytimg.com/vi/' + esc(r.state.video_id) + '/mqdefault.jpg" alt="" loading="lazy"/>'
    : '<span class="rc-icon">' + KIND_ICON[r.kind] + '</span>';
  const live = r.live > 0 ? '<span class="rc-live">● ' + esc(t('rooms.live', {n: r.live})) + '</span>' : '';
  const sub = r.kind === 'watch'
    ? (r.state.video_title || (r.state.video_id ? t('rooms.videoReady') : t('rooms.noVideo')))
    : r.kind === 'study' && r.timer ? (t('study.' + r.timer.mode) + ' · ' + r.timer.focus_min + '/' + r.timer.break_min + ' min')
    : (r.description || t('rooms.kind.hangout'));
  const gname = r.group_id ? ((LANG === 'my' && r.group_name_my) ? r.group_name_my : r.group_name) : '';
  return '<div class="room-card" onclick="openRoom(' + r.id + ')">'
    + '<div class="rc-thumb k-' + r.kind + '">' + thumb + live + '<span class="rc-kind">' + KIND_ICON[r.kind] + ' ' + esc(t('rooms.kind.' + r.kind)) + '</span></div>'
    + '<div class="rc-body"><h3>' + esc(r.name) + '</h3><p>' + esc(sub) + '</p>'
    + '<small>' + esc(t('rooms.host', {name: r.host_name || t('rooms.peerly')})) + (gname ? ' · ' + esc(gname) : '') + '</small></div></div>';
}

function renderRoomsGrid() {
  const grid = document.getElementById('rooms-grid');
  if (!grid) return;
  const list = R.rooms.filter(r => R.kindFilter === 'all' || r.kind === R.kindFilter);
  grid.innerHTML = list.length ? list.map(roomCardHtml).join('')
    : '<div class="feed-empty">' + esc(t('rooms.empty')) + '</div>';
}

// Small "Live rooms" lists on the feed sidebar and group pages
async function renderMiniRooms(elId, groupId) {
  const el = document.getElementById(elId);
  if (!el) return;
  let rooms = [];
  try { rooms = await api('GET', '/api/rooms' + (groupId ? '?group=' + groupId : '')); } catch {}
  rooms = rooms.slice(0, groupId ? 6 : 4);
  el.innerHTML = rooms.map(r => '<a class="mini-room" onclick="openRoom(' + r.id + ')"><span class="mr-icon">' + KIND_ICON[r.kind] + '</span>'
    + '<span class="mr-text"><b>' + esc(r.name) + '</b><small>' + (r.live ? '<i class="mr-live">● ' + esc(t('rooms.live', {n: r.live})) + '</i>' : esc(t('rooms.kind.' + r.kind))) + '</small></span></a>').join('')
    + '<button class="btn-secondary btn-sm mini-new" onclick="openCreateRoom(' + (groupId || 0) + ')">+ ' + esc(t('rooms.start')) + '</button>';
}

// ── Create room ───────────────────────────────────────────

async function openCreateRoom(groupId, kind) {
  if (!requireLogin()) return;
  await ensureGroups();
  R.newKind = kind || 'watch';
  const sel = document.getElementById('cr-group');
  sel.innerHTML = '<option value="0">🌍 ' + esc(t('comp.everyone')) + '</option>'
    + (C.groups || []).filter(g => g.is_member || g.id === groupId)
      .map(g => '<option value="' + g.id + '"' + (g.id === groupId ? ' selected' : '') + '>' + esc(g.emoji + ' ' + groupName(g)) + '</option>').join('');
  document.getElementById('cr-name').value = '';
  document.getElementById('cr-url').value = '';
  document.getElementById('cr-desc').value = '';
  document.getElementById('cr-err').classList.remove('show');
  pickRoomKind(R.newKind);
  document.getElementById('room-modal').classList.add('show');
}

function pickRoomKind(kind) {
  R.newKind = kind;
  document.querySelectorAll('.kind-pick button').forEach(b => b.classList.toggle('on', b.dataset.kind === kind));
  document.getElementById('cr-url-group').style.display = kind === 'watch' ? '' : 'none';
  document.getElementById('cr-name').placeholder = t('rooms.namePh.' + kind);
}

function closeCreateRoom() { document.getElementById('room-modal').classList.remove('show'); }

async function submitCreateRoom() {
  const err = document.getElementById('cr-err');
  const btn = document.getElementById('cr-btn');
  err.classList.remove('show');
  btn.disabled = true;
  try {
    const r = await api('POST', '/api/rooms', {
      name: document.getElementById('cr-name').value.trim(),
      kind: R.newKind,
      description: document.getElementById('cr-desc').value.trim(),
      group_id: parseInt(document.getElementById('cr-group').value, 10) || 0,
      video_url: R.newKind === 'watch' ? document.getElementById('cr-url').value.trim() : '',
    });
    closeCreateRoom();
    openRoom(r.id);
  } catch (e) { err.textContent = e.message; err.classList.add('show'); }
  finally { btn.disabled = false; }
}

// ── Open / leave a room ───────────────────────────────────

async function openRoom(id) {
  if (!S.user) { S.pendingRoom = id; showToast(t('toast.loginFirst')); openAuthModal('register'); return; }
  leaveRoom();
  showPage('room');
  const root = document.getElementById('room-root');
  root.innerHTML = '<div class="spinner">…</div>';
  let data;
  try { data = await api('GET', '/api/rooms/' + id); }
  catch { root.innerHTML = '<div class="no-results">' + esc(t('rooms.notFound')) + '</div>'; return; }
  R.room = data.room;
  R.state = data.room.state;
  R.timer = data.room.timer || null;
  R.offset = data.now - Date.now();
  R.loadedId = null;
  try { history.replaceState(null, '', '/room/' + id); } catch {}
  renderRoom(data.messages);
  connectRoom(id);
}

function leaveRoom() {
  if (R.es) { R.es.close(); R.es = null; }
  clearInterval(R.driftTimer); clearInterval(R.tickTimer);
  if (R.player) { try { R.player.destroy(); } catch {} R.player = null; }
  if (R.room && inCall('room:' + R.room.id)) leaveCall(true);
  R.room = null; R.loadedId = null;
  if (location.pathname.startsWith('/room/')) { try { history.replaceState(null, '', '/'); } catch {} }
}

function handleDeepLink() {
  const m = location.pathname.match(/^\/room\/(\d+)/);
  if (!m) return;
  const id = parseInt(m[1], 10);
  if (S.user) openRoom(id);
  else { S.pendingRoom = id; showPage('home'); openAuthModal('register'); showToast(t('rooms.joinToEnter')); }
}

function connectRoom(id) {
  const es = new EventSource('/api/rooms/' + id + '/events?client_id=' + R.clientId);
  R.es = es;
  es.onmessage = (e) => {
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    if (!R.room || R.room.id !== id) return;
    const d = msg.data;
    switch (msg.type) {
      case 'hello':
        R.offset = d.now - Date.now();
        setConn(true);
        renderViewers(d.viewers);
        if (d.state) applyState(d.state, false);
        break;
      case 'viewers': renderViewers(d); break;
      case 'message': appendRoomMessage(d); break;
      case 'state':   onRemoteState(d); break;
      case 'title':   if (R.state && R.state.video_id === d.video_id) { R.state.video_title = d.title; renderNowPlaying(); } break;
      case 'react':   floatReaction(d.emoji, d.name); break;
      case 'timer':   R.timer = d; renderTimer(); if (d.by && d.by !== S.user.name) systemLine(t('study.by.' + d.action, {name: d.by})); break;
      case 'closed':  showToast(t('rooms.closed')); leaveRoom(); showPage('rooms'); break;
    }
  };
  es.onerror = () => setConn(false); // EventSource reconnects by itself
}

function setConn(ok) {
  const el = document.getElementById('room-conn');
  if (el) el.classList.toggle('show', !ok);
}

// ── Room page layout ──────────────────────────────────────

function renderRoom(messages) {
  const r = R.room;
  const root = document.getElementById('room-root');
  const gname = r.group_id ? ((LANG === 'my' && r.group_name_my) ? r.group_name_my : r.group_name) : '';
  let stage = '';
  if (r.kind === 'watch') {
    stage = '<div class="player-wrap" id="player-wrap">'
      + '<div id="player-box" class="player-box"></div>'
      + '<div class="react-layer" id="react-layer"></div>'
      + '<button class="tap-sync" id="tap-sync" hidden onclick="tapToSync()">▶ ' + esc(t('watch.tapSync')) + '</button></div>'
      + '<div class="now-bar"><div class="now-info" id="now-info"></div>'
      + '<div class="react-bar">' + REACTIONS.map(e => '<button onclick="sendReaction(\'' + e + '\')">' + e + '</button>').join('') + '</div></div>'
      + '<div class="video-form"><input type="url" id="video-url" placeholder="' + esc(t('watch.pastePh')) + '" onkeydown="if(event.key===\'Enter\')changeVideo()"/>'
      + '<button class="btn-primary btn-sm" onclick="changeVideo()">' + esc(t('watch.play')) + '</button>'
      + '<label class="btn-ghost btn-sm upload-btn" title="' + esc(t('watch.uploadHint')) + '">⬆ ' + esc(t('watch.upload'))
      + '<input type="file" accept="video/mp4,video/webm" hidden onchange="uploadRoomVideo(this)"/></label></div>'
      + '<div class="upload-progress" id="upload-progress" hidden><span></span></div>';
  } else if (r.kind === 'study') {
    stage = '<div class="study-card" id="study-card"></div>'
      + '<div class="react-layer" id="react-layer"></div>';
  } else {
    stage = '<div class="hangout-hero" id="hangout-hero"><span>🎧</span><p>' + esc(r.description || t('hang.sub')) + '</p></div>'
      + '<div class="react-layer" id="react-layer"></div>';
  }
  root.innerHTML =
    '<div class="room-top"><a class="rt-back" onclick="leaveRoom();showPage(\'rooms\')">←</a>'
    + '<div class="rt-title"><h1>' + KIND_ICON[r.kind] + ' ' + esc(r.name) + '</h1><small>' + esc(t('rooms.host', {name: r.host_name || t('rooms.peerly')})) + (gname ? ' · ' + esc(gname) : '') + '</small></div>'
    + '<div class="rt-viewers" id="rt-viewers"></div>'
    + '<button class="rt-btn" onclick="shareRoom()" title="' + esc(t('rooms.share')) + '">🔗</button>'
    + (r.can_delete ? '<button class="rt-btn" onclick="closeRoom()" title="' + esc(t('rooms.close')) + '">🗑</button>' : '')
    + '</div>'
    + '<div class="room-conn" id="room-conn">' + esc(t('rooms.reconnecting')) + '</div>'
    + '<div class="room-layout k-' + r.kind + '">'
    + '<section class="room-stage">' + stage
    + '<div class="call-panel"><div class="call-tiles" id="room-tiles"></div><div class="call-controls" id="room-call"></div></div>'
    + '</section>'
    + '<aside class="room-chat"><div class="rc-head">' + esc(t('rooms.chat')) + '</div>'
    + '<div class="rc-list" id="rc-list"></div>'
    + '<div class="rc-form"><input type="text" id="rc-in" maxlength="500" placeholder="' + esc(t('rooms.chatPh')) + '" onkeydown="if(event.key===\'Enter\')sendRoomMessage()"/>'
    + '<button onclick="sendRoomMessage()">' + esc(t('cmt.send')) + '</button></div></aside></div>';

  const list = document.getElementById('rc-list');
  list.innerHTML = messages.length ? messages.map(roomMessageHtml).join('') : '<div class="rc-empty">' + esc(t('rooms.sayHi')) + '</div>';
  list.scrollTop = list.scrollHeight;
  renderViewers(r.viewers || []);
  renderRoomCall();
  if (r.kind === 'watch') { applyState(R.state, false); R.driftTimer = setInterval(checkDrift, 2000); }
  if (r.kind === 'study') { renderTimer(); R.tickTimer = setInterval(tickTimer, 500); }
}

function renderViewers(list) {
  const el = document.getElementById('rt-viewers');
  if (!el || !list) return;
  el.innerHTML = list.slice(0, 5).map(a => '<span title="' + esc(a.name) + '">' + peerAvatar(a, 30) + '</span>').join('')
    + '<b>' + list.length + '</b>';
}

function shareRoom() {
  const url = location.origin + '/room/' + R.room.id;
  if (navigator.share) { navigator.share({title: R.room.name, url}).catch(() => {}); return; }
  try { navigator.clipboard.writeText(url); showToast(t('rooms.linkCopied')); } catch { prompt('Link', url); }
}

async function closeRoom() {
  if (!confirm(t('rooms.confirmClose'))) return;
  try { await api('DELETE', '/api/rooms/' + R.room.id); leaveRoom(); showPage('rooms'); } catch (e) { showToast(e.message); }
}

// ── Chat & reactions ──────────────────────────────────────

function roomMessageHtml(m) {
  const mine = S.user && m.author.id === S.user.id;
  return '<div class="rmsg' + (mine ? ' mine' : '') + '">' + peerAvatar(m.author, 26)
    + '<div><b>' + esc(m.author.name) + '</b> <span>' + richText(m.content) + '</span></div></div>';
}

function appendRoomMessage(m) {
  const list = document.getElementById('rc-list');
  if (!list) return;
  const empty = list.querySelector('.rc-empty'); if (empty) empty.remove();
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  list.insertAdjacentHTML('beforeend', roomMessageHtml(m));
  if (nearBottom || (S.user && m.author.id === S.user.id)) list.scrollTop = list.scrollHeight;
  if (list.children.length > 300) list.firstElementChild.remove();
}

function systemLine(text) {
  const list = document.getElementById('rc-list');
  if (!list) return;
  list.insertAdjacentHTML('beforeend', '<div class="rsys">' + esc(text) + '</div>');
  list.scrollTop = list.scrollHeight;
}

async function sendRoomMessage() {
  const inp = document.getElementById('rc-in');
  const content = inp.value.trim();
  if (!content) return;
  inp.value = '';
  try { await api('POST', '/api/rooms/' + R.room.id + '/messages', {content}); }
  catch (e) { inp.value = content; showToast(e.message); }
}

function sendReaction(emoji) {
  api('POST', '/api/rooms/' + R.room.id + '/react', {emoji}).catch(() => {});
}

function floatReaction(emoji, name) {
  const layer = document.getElementById('react-layer');
  if (!layer) return;
  const el = document.createElement('div');
  el.className = 'floaty';
  el.style.left = (10 + Math.random() * 75) + '%';
  el.innerHTML = '<span>' + esc(emoji) + '</span><small>' + esc((name || '').split(' ')[0]) + '</small>';
  layer.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// ── Voice / video in rooms ────────────────────────────────

function renderRoomCall() {
  const el = document.getElementById('room-call');
  if (!el || !R.room) return;
  const key = 'room:' + R.room.id;
  if (inCall(key)) { el.innerHTML = callControlsHtml(key); return; }
  el.innerHTML = '<button class="join-voice" onclick="joinRoomCall(false)">🎙️ ' + esc(t(R.room.kind === 'hangout' ? 'call.joinHang' : 'call.joinVoice')) + '</button>'
    + '<button class="join-voice ghost" onclick="joinRoomCall(true)">📹 ' + esc(t('call.joinVideo')) + '</button>';
}

async function joinRoomCall(video) {
  const id = R.room.id;
  await joinCall('room:' + id, () => api('POST', '/api/rooms/' + id + '/call'), {
    video, tilesEl: document.getElementById('room-tiles'),
    onChange: renderRoomCall, onEnd: renderRoomCall,
  });
  renderRoomCall();
}

// ── Players (YouTube + uploaded file) ─────────────────────

function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (R.ytReady) return R.ytReady;
  R.ytReady = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { R.ytReady = null; reject(new Error('YouTube could not load')); };
    document.head.appendChild(s);
  });
  return R.ytReady;
}

function makeYouTubePlayer(box, videoId, start, autoplay) {
  return new Promise(async (resolve, reject) => {
    try { await loadYouTubeAPI(); } catch (e) { reject(e); return; }
    box.innerHTML = '<div id="yt-holder"></div>';
    const p = new YT.Player('yt-holder', {
      videoId, width: '100%', height: '100%',
      playerVars: {start: Math.floor(start), autoplay: autoplay ? 1 : 0, playsinline: 1, rel: 0, modestbranding: 1},
      events: {
        onReady: () => resolve({
          kind: 'yt',
          time: () => p.getCurrentTime() || 0,
          play: () => p.playVideo(),
          pause: () => p.pauseVideo(),
          seek: (s) => p.seekTo(s, true),
          status: () => ({1: 'playing', 2: 'paused', 3: 'buffering', 0: 'ended'})[p.getPlayerState()] || 'idle',
          load: (id, s, play) => play ? p.loadVideoById(id, s) : p.cueVideoById(id, s),
          destroy: () => p.destroy(),
        }),
        onStateChange: (e) => onLocalPlayer(({1: 'playing', 2: 'paused'})[e.data]),
        onError: () => systemLine(t('watch.ytError')),
      },
    });
  });
}

function makeFilePlayer(box, src, start) {
  box.innerHTML = '<video id="file-video" controls playsinline preload="auto"></video>';
  const v = document.getElementById('file-video');
  v.src = src;
  v.addEventListener('loadedmetadata', () => { if (start) v.currentTime = start; }, {once: true});
  v.addEventListener('play', () => onLocalPlayer('playing'));
  v.addEventListener('pause', () => { if (!v.seeking) onLocalPlayer('paused'); });
  v.addEventListener('seeked', () => onLocalPlayer(v.paused ? 'seeked-paused' : 'playing'));
  return Promise.resolve({
    kind: 'file',
    time: () => v.currentTime || 0,
    play: () => v.play().catch(() => { const b = document.getElementById('tap-sync'); if (b) b.hidden = false; }),
    pause: () => v.pause(),
    seek: (s) => { v.currentTime = s; },
    status: () => v.ended ? 'ended' : (v.paused ? 'paused' : (v.readyState < 3 ? 'buffering' : 'playing')),
    load: (id, s) => { v.src = id.slice(5); v.currentTime = s; },
    destroy: () => { v.pause(); v.removeAttribute('src'); v.load(); },
  });
}

function expectedPos(s) {
  s = s || R.state;
  if (!s) return 0;
  return s.playing ? s.position + (serverNow() - s.state_at) / 1000 : s.position;
}

async function applyState(s, ownEcho) {
  R.state = s;
  renderNowPlaying();
  const box = document.getElementById('player-box');
  if (!box) return;
  if (!s.video_id) {
    if (R.player) { try { R.player.destroy(); } catch {} R.player = null; }
    R.loadedId = null;
    box.innerHTML = '<div class="player-empty"><span>🍿</span><p>' + esc(t('watch.empty')) + '</p></div>';
    return;
  }
  // Only mute our own player events when *someone else* changed things
  if (!ownEcho) R.ignoreUntil = Date.now() + 1000;
  if (R.loadedId !== s.video_id) {
    const kind = isFileVideo(s.video_id) ? 'file' : 'yt';
    R.loadedId = s.video_id;
    try {
      if (R.player && R.player.kind === kind) {
        R.player.load(kind === 'file' ? s.video_id : s.video_id, expectedPos(s), s.playing);
      } else {
        if (R.player) { try { R.player.destroy(); } catch {} }
        R.player = null;
        R.player = kind === 'file'
          ? await makeFilePlayer(box, s.video_id.slice(5), expectedPos(s))
          : await makeYouTubePlayer(box, s.video_id, expectedPos(s), s.playing);
      }
    } catch (e) {
      R.loadedId = null;
      box.innerHTML = '<div class="player-empty"><span>⚠️</span><p>' + esc(e.message) + '</p></div>';
      return;
    }
    R.ignoreUntil = Date.now() + 1500;
  }
  if (ownEcho) return;
  syncPlayer();
}

// Move our player to match the room state
function syncPlayer() {
  const p = R.player, s = R.state;
  if (!p || !s) return;
  R.ignoreUntil = Date.now() + 1000;
  const exp = expectedPos(s);
  if (Math.abs(p.time() - exp) > 1) p.seek(exp);
  if (s.playing) p.play(); else p.pause();
}

function onRemoteState(s) {
  const mine = s.client_id && s.client_id === R.clientId;
  const changed = !R.state || R.state.video_id !== s.video_id;
  if (s.by && !mine) {
    const key = s.action === 'video' ? 'watch.by.video' : s.action === 'play' ? 'watch.by.play' : s.action === 'pause' ? 'watch.by.pause' : 'watch.by.seek';
    systemLine(t(key, {name: s.by, time: fmtTime(s.position)}));
  }
  applyState(s, mine && !changed);
}

// Called when the person uses the player's own controls
function onLocalPlayer(status) {
  if (!R.player || !R.state || !R.state.video_id) return;
  if (Date.now() < R.ignoreUntil) return;
  const tNow = R.player.time();
  const exp = expectedPos();
  if (status === 'playing') {
    if (!R.state.playing) sendControl('play', tNow);
    else if (Math.abs(tNow - exp) > 2) sendControl('seek', tNow);
  } else if (status === 'paused') {
    if (R.state.playing) sendControl('pause', tNow);
  } else if (status === 'seeked-paused') {
    if (Math.abs(tNow - R.state.position) > 1) sendControl('seek', tNow);
  }
}

function sendControl(action, position) {
  // Update our own copy straight away so the drift check doesn't fight the person
  R.state = Object.assign({}, R.state, {
    playing: action === 'play' ? true : action === 'pause' ? false : R.state.playing,
    position, state_at: serverNow(),
  });
  api('POST', '/api/rooms/' + R.room.id + '/control', {action, position, client_id: R.clientId}).catch(e => showToast(e.message));
}

// Every 2 seconds: if we've drifted from the room, catch up quietly
function checkDrift() {
  const p = R.player, s = R.state;
  if (!p || !s || !s.video_id || Date.now() < R.ignoreUntil) return;
  const st = p.status();
  const tap = document.getElementById('tap-sync');
  if (s.playing) {
    if (st === 'paused' || st === 'idle') { if (tap) tap.hidden = false; return; } // autoplay blocked
    if (tap) tap.hidden = true;
    if (st === 'playing' && Math.abs(p.time() - expectedPos()) > 1.5) { R.ignoreUntil = Date.now() + 1200; p.seek(expectedPos()); }
  } else {
    if (tap) tap.hidden = true;
    if (st === 'paused' && Math.abs(p.time() - s.position) > 2 && p.kind === 'yt') sendControl('seek', p.time());
    else if (st === 'playing') syncPlayer(); // we're playing but the room is paused — follow the room
  }
  renderNowPlaying();
}

function tapToSync() {
  const tap = document.getElementById('tap-sync');
  if (tap) tap.hidden = true;
  syncPlayer();
}

function renderNowPlaying() {
  const el = document.getElementById('now-info');
  if (!el || !R.state) return;
  const s = R.state;
  if (!s.video_id) { el.innerHTML = '<span class="np-title">' + esc(t('watch.nothing')) + '</span>'; return; }
  el.innerHTML = '<span class="np-dot ' + (s.playing ? 'on' : '') + '"></span>'
    + '<span class="np-title">' + esc(s.video_title || (isFileVideo(s.video_id) ? t('watch.uploaded') : 'YouTube')) + '</span>'
    + '<span class="np-time">' + fmtTime(expectedPos()) + '</span>';
}

async function changeVideo() {
  const inp = document.getElementById('video-url');
  const url = inp.value.trim();
  if (!url) { inp.focus(); return; }
  try {
    await api('POST', '/api/rooms/' + R.room.id + '/video', {url, client_id: R.clientId});
    inp.value = '';
  } catch (e) { showToast(e.message); }
}

function uploadRoomVideo(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  if (file.size > 400 * 1024 * 1024) { showToast(t('watch.tooBig')); return; }
  const bar = document.getElementById('upload-progress');
  bar.hidden = false; bar.firstElementChild.style.width = '0%';
  const fd = new FormData();
  fd.append('client_id', R.clientId);
  fd.append('video', file);
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/rooms/' + R.room.id + '/upload');
  xhr.withCredentials = true;
  xhr.upload.onprogress = (e) => { if (e.lengthComputable) bar.firstElementChild.style.width = Math.round(e.loaded / e.total * 100) + '%'; };
  xhr.onload = () => {
    bar.hidden = true;
    if (xhr.status >= 400) { try { showToast(JSON.parse(xhr.responseText).error); } catch { showToast('Upload failed'); } }
  };
  xhr.onerror = () => { bar.hidden = true; showToast('Upload failed'); };
  xhr.send(fd);
}

// ── Study timer ───────────────────────────────────────────

function timerLeft(tm) {
  if (!tm) return 0;
  if (!tm.running) return tm.left_ms;
  // Mirror the server: roll focus → break → focus while it runs
  let ends = tm.ends_at, mode = tm.mode;
  const now = serverNow();
  for (let i = 0; now >= ends && i < 1000; i++) {
    mode = mode === 'focus' ? 'break' : 'focus';
    ends += (mode === 'break' ? tm.break_min : tm.focus_min) * 60000;
  }
  tm._mode = mode;
  return ends - now;
}

function renderTimer() {
  const card = document.getElementById('study-card');
  if (!card || !R.timer) return;
  const tm = R.timer;
  const left = timerLeft(tm);
  const mode = tm.running ? (tm._mode || tm.mode) : tm.mode;
  const total = (mode === 'break' ? tm.break_min : tm.focus_min) * 60000;
  const pct = Math.max(0, Math.min(100, 100 - left / total * 100));
  card.className = 'study-card ' + mode;
  card.innerHTML = '<div class="st-mode">' + (mode === 'focus' ? '📚 ' : '☕ ') + esc(t('study.' + mode)) + '</div>'
    + '<div class="st-ring" style="--p:' + pct.toFixed(1) + '"><span id="st-time">' + fmtTime(left / 1000) + '</span></div>'
    + '<div class="st-hint">' + esc(t(mode === 'focus' ? 'study.focusHint' : 'study.breakHint')) + '</div>'
    + '<div class="st-controls">'
    + (tm.running ? '<button class="btn-primary btn-sm" onclick="timerAction(\'pause\')">⏸ ' + esc(t('study.pause')) + '</button>'
                  : '<button class="btn-primary btn-sm" onclick="timerAction(\'start\')">▶ ' + esc(t('study.start')) + '</button>')
    + '<button class="btn-ghost btn-sm" onclick="timerAction(\'skip\')">⏭ ' + esc(t('study.skip')) + '</button>'
    + '<button class="btn-ghost btn-sm" onclick="timerAction(\'reset\')">↺</button>'
    + '<select class="st-preset" onchange="setTimerPreset(this.value)" aria-label="Timer length">'
    + ['25/5', '50/10', '90/15'].map(p => '<option' + (p === tm.focus_min + '/' + tm.break_min ? ' selected' : '') + '>' + p + '</option>').join('')
    + (['25/5', '50/10', '90/15'].includes(tm.focus_min + '/' + tm.break_min) ? '' : '<option selected>' + tm.focus_min + '/' + tm.break_min + '</option>')
    + '</select></div>';
  R.lastPhase = mode;
}

function tickTimer() {
  const tm = R.timer;
  if (!tm) return;
  const left = timerLeft(tm);
  const mode = tm.running ? (tm._mode || tm.mode) : tm.mode;
  if (mode !== R.lastPhase) { chime(); systemLine(t(mode === 'break' ? 'study.breakNow' : 'study.focusNow')); renderTimer(); return; }
  const el = document.getElementById('st-time');
  if (el) el.textContent = fmtTime(left / 1000);
  const ring = document.querySelector('.st-ring');
  if (ring) {
    const total = (mode === 'break' ? tm.break_min : tm.focus_min) * 60000;
    ring.style.setProperty('--p', Math.max(0, Math.min(100, 100 - left / total * 100)).toFixed(1));
  }
  if (tm.running) document.title = fmtTime(left / 1000) + ' · ' + t('study.' + mode) + ' — Peerly';
}

function timerAction(action) {
  api('POST', '/api/rooms/' + R.room.id + '/timer', {action}).then(tm => { R.timer = tm; renderTimer(); }).catch(e => showToast(e.message));
}

function setTimerPreset(v) {
  const [f, b] = v.split('/').map(n => parseInt(n, 10));
  api('POST', '/api/rooms/' + R.room.id + '/timer', {action: 'set', focus_min: f, break_min: b})
    .then(tm => { R.timer = tm; renderTimer(); }).catch(e => showToast(e.message));
}

// Soft two-note chime when focus/break switches
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      const at = ctx.currentTime + i * 0.25;
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.2, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
      o.start(at); o.stop(at + 0.65);
    });
  } catch {}
}

// ── Page hooks ────────────────────────────────────────────

const _onPageShownBase = window.onPageShown;
window.onPageShown = function (pg) {
  if (pg !== 'room' && R.room) leaveRoom();
  if (pg !== 'room') document.title = 'Peerly – Learn together. Grow together.';
  _onPageShownBase(pg);
  if (pg === 'rooms') loadRoomsPage();
  if (pg === 'feed') renderMiniRooms('side-rooms', 0);
};

const _openGroupBase = window.openGroup;
window.openGroup = async function (id, keepPage) {
  await _openGroupBase(id, keepPage);
  renderMiniRooms('group-rooms', id);
};

const _onLangBase = window.onLangChanged;
window.onLangChanged = function () {
  _onLangBase();
  if (S.page === 'rooms') renderRoomsGrid();
  if (S.page === 'room' && R.room) openRoom(R.room.id);
};

document.getElementById('room-modal').addEventListener('click', e => { if (e.target.id === 'room-modal') closeCreateRoom(); });

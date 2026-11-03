/*
  Peerly — calls.js
  Voice / video calls and screen sharing with LiveKit (static/vendor/livekit-client-*.umd.js).
  One call at a time. Used inside rooms (voice while watching or studying, hangouts)
  and for private 1-to-1 calls from Messages.
*/

const LIVEKIT_SRC = '/static/vendor/livekit-client-2.23.0.umd.js';

const Call = {
  room: null,          // LivekitClient.Room
  key: null,           // what this call belongs to, e.g. 'room:12' or 'dm:5'
  tilesEl: null,       // where video/avatar tiles are drawn
  onChange: null,      // callback when mic/cam/screen/participants change
  tiles: {},           // tileKey -> element
  enabled: null,       // is LiveKit configured on the server?
};

function loadLivekit() {
  if (window.LivekitClient) return Promise.resolve();
  if (Call._loading) return Call._loading;
  Call._loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = LIVEKIT_SRC; s.onload = resolve; s.onerror = () => reject(new Error('Could not load call library'));
    document.head.appendChild(s);
  });
  return Call._loading;
}

async function callsEnabled() {
  if (Call.enabled === null) {
    try { Call.enabled = (await api('GET', '/api/calls/config')).enabled; } catch { Call.enabled = false; }
  }
  return Call.enabled;
}

function inCall(key) { return !!(Call.room && (!key || Call.key === key)); }

// joinCall connects to LiveKit. getToken() must return {url, token}.
async function joinCall(key, getToken, opts) {
  opts = opts || {};
  if (!(await callsEnabled())) { showToast(t('call.notSetUp')); return false; }
  if (Call.room) await leaveCall(true);
  try {
    await loadLivekit();
    const LK = window.LivekitClient;
    const {url, token} = await getToken();
    const room = new LK.Room({adaptiveStream: true, dynacast: true,
      audioCaptureDefaults: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}});
    Call.room = room; Call.key = key; Call.tilesEl = opts.tilesEl || null; Call.onChange = opts.onChange || null; Call.tiles = {};
    const E = LK.RoomEvent;
    const refresh = () => { renderCallTiles(); if (Call.onChange) Call.onChange(); };
    room
      .on(E.TrackSubscribed, (track) => {
        if (track.kind === 'audio') { const el = track.attach(); el.dataset.lk = '1'; audioSink().appendChild(el); }
        refresh();
      })
      .on(E.TrackUnsubscribed, (track) => { track.detach().forEach(el => el.remove()); refresh(); })
      .on(E.LocalTrackPublished, refresh)
      .on(E.LocalTrackUnpublished, refresh)
      .on(E.TrackMuted, refresh)
      .on(E.TrackUnmuted, refresh)
      .on(E.ParticipantConnected, refresh)
      .on(E.ParticipantDisconnected, refresh)
      .on(E.ActiveSpeakersChanged, markSpeakers)
      .on(E.Disconnected, () => { if (Call.room === room) { cleanupCall(); if (opts.onEnd) opts.onEnd(); } })
      .on(E.AudioPlaybackStatusChanged, () => { if (!room.canPlaybackAudio) showAudioUnlock(); });
    await room.connect(url, token);
    try { await room.localParticipant.setMicrophoneEnabled(true); }
    catch { showToast(t('call.noMic')); }
    if (opts.video) { try { await room.localParticipant.setCameraEnabled(true); } catch { showToast(t('call.noCam')); } }
    if (!room.canPlaybackAudio) showAudioUnlock();
    refresh();
    return true;
  } catch (e) {
    cleanupCall();
    showToast(e.message || t('call.failed'));
    return false;
  }
}

async function leaveCall(silent) {
  const room = Call.room;
  cleanupCall();
  if (room) { try { await room.disconnect(); } catch {} }
  if (!silent && Call.onChange) Call.onChange();
}

function cleanupCall() {
  Object.values(Call.tiles).forEach(el => el.remove());
  Call.tiles = {};
  document.querySelectorAll('#lk-audio audio').forEach(el => el.remove());
  const unlock = document.getElementById('audio-unlock'); if (unlock) unlock.remove();
  Call.room = null; Call.key = null; Call.hadOthers = false;
}

function audioSink() {
  let el = document.getElementById('lk-audio');
  if (!el) { el = document.createElement('div'); el.id = 'lk-audio'; el.hidden = true; document.body.appendChild(el); }
  return el;
}

// Browsers block sound until the person taps something — show a button if needed
function showAudioUnlock() {
  if (document.getElementById('audio-unlock') || !Call.room) return;
  const b = document.createElement('button');
  b.id = 'audio-unlock'; b.className = 'audio-unlock'; b.textContent = '🔊 ' + t('call.tapAudio');
  b.onclick = async () => { try { await Call.room.startAudio(); } catch {} b.remove(); };
  document.body.appendChild(b);
}

async function toggleMic() {
  if (!Call.room) return;
  const lp = Call.room.localParticipant;
  try { await lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled); } catch { showToast(t('call.noMic')); }
  renderCallTiles(); if (Call.onChange) Call.onChange();
}

async function toggleCam() {
  if (!Call.room) return;
  const lp = Call.room.localParticipant;
  try { await lp.setCameraEnabled(!lp.isCameraEnabled); } catch { showToast(t('call.noCam')); }
  renderCallTiles(); if (Call.onChange) Call.onChange();
}

async function toggleScreen() {
  if (!Call.room) return;
  const lp = Call.room.localParticipant;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) { showToast(t('call.noScreen')); return; }
  try { await lp.setScreenShareEnabled(!lp.isScreenShareEnabled, {audio: true}); }
  catch (e) { if (e && e.name !== 'NotAllowedError') showToast(t('call.noScreen')); }
  renderCallTiles(); if (Call.onChange) Call.onChange();
}

function callParticipants() {
  if (!Call.room) return [];
  return [Call.room.localParticipant, ...Call.room.remoteParticipants.values()];
}

function participantAuthor(p) {
  let avatar = '';
  try { avatar = JSON.parse(p.metadata || '{}').avatar || ''; } catch {}
  return {id: parseInt(p.identity, 10) || 0, name: p.name || p.identity, avatar};
}

// Draws one tile per person (camera or avatar) plus a big tile for each screen share.
function renderCallTiles() {
  const box = Call.tilesEl;
  if (!box || !Call.room) return;
  const LK = window.LivekitClient;
  const wanted = {};
  callParticipants().forEach(p => {
    const isLocal = p === Call.room.localParticipant;
    const sources = [['cam', LK.Track.Source.Camera]];
    const screenPub = p.getTrackPublication(LK.Track.Source.ScreenShare);
    if (screenPub && screenPub.track) sources.unshift(['screen', LK.Track.Source.ScreenShare]);
    sources.forEach(([kind, src]) => {
      const key = p.identity + ':' + kind;
      wanted[key] = true;
      let tile = Call.tiles[key];
      if (!tile) {
        tile = document.createElement('div');
        tile.className = 'call-tile ' + (kind === 'screen' ? 'screen' : '');
        tile.dataset.identity = p.identity;
        Call.tiles[key] = tile;
        if (kind === 'screen') box.prepend(tile); else box.appendChild(tile);
      }
      const pub = p.getTrackPublication(src);
      const track = pub && !pub.isMuted ? pub.track : null;
      const a = participantAuthor(p);
      const micOff = !p.isMicrophoneEnabled;
      if (track) {
        let v = tile.querySelector('video');
        if (!v || v.dataset.sid !== track.sid) {
          tile.innerHTML = '';
          v = track.attach(); v.dataset.sid = track.sid; v.muted = true; v.playsInline = true;
          if (isLocal && kind === 'cam') v.classList.add('mirror');
          tile.appendChild(v);
        }
      } else if (tile.querySelector('video') || !tile.querySelector('.p-av')) {
        tile.innerHTML = peerAvatar(a, 56);
      }
      let label = tile.querySelector('.tile-name');
      if (!label) { label = document.createElement('div'); label.className = 'tile-name'; tile.appendChild(label); }
      label.textContent = (kind === 'screen' ? '🖥️ ' : '') + (micOff && kind === 'cam' ? '🔇 ' : '') + a.name + (isLocal ? ' (' + t('call.you') + ')' : '');
      tile.classList.toggle('has-video', !!track);
    });
  });
  Object.keys(Call.tiles).forEach(k => { if (!wanted[k]) { Call.tiles[k].remove(); delete Call.tiles[k]; } });
  box.classList.toggle('has-screen', Object.keys(wanted).some(k => k.endsWith(':screen')));
  markSpeakers(Call.room.activeSpeakers || []);
}

function markSpeakers(speakers) {
  const ids = new Set((speakers || []).map(p => p.identity));
  Object.entries(Call.tiles).forEach(([k, el]) => {
    if (k.endsWith(':cam')) el.classList.toggle('speaking', ids.has(el.dataset.identity));
  });
}

// The mic / camera / screen / leave buttons, drawn from the current call state.
function callControlsHtml(key) {
  if (!inCall(key)) return '';
  const lp = Call.room.localParticipant;
  return '<button class="cc-btn ' + (lp.isMicrophoneEnabled ? '' : 'off') + '" onclick="toggleMic()" title="' + esc(t('call.mic')) + '">' + (lp.isMicrophoneEnabled ? '🎙️' : '🔇') + '</button>'
    + '<button class="cc-btn ' + (lp.isCameraEnabled ? 'on' : '') + '" onclick="toggleCam()" title="' + esc(t('call.cam')) + '">' + (lp.isCameraEnabled ? '📹' : '📷') + '</button>'
    + '<button class="cc-btn ' + (lp.isScreenShareEnabled ? 'on' : '') + '" onclick="toggleScreen()" title="' + esc(t('call.screen')) + '">🖥️</button>'
    + '<button class="cc-btn leave" onclick="leaveCall()" title="' + esc(t('call.leave')) + '">' + esc(t('call.leave')) + '</button>';
}

// ── 1-to-1 calls from Messages ─────────────────────────────

async function startDMCall(userId, video, isJoin) {
  if (!requireLogin()) return;
  const name = S.activeConvName || C.people[userId] || '';
  const ok = await joinCall('dm:' + userId,
    () => api('POST', '/api/calls/dm/' + userId, {video: !!video, notify: !isJoin}),
    {video: !!video, tilesEl: openCallOverlay(name), onChange: renderCallOverlay, onEnd: closeCallOverlay});
  if (!ok) closeCallOverlay();
  else if (!isJoin && S.activeConv === userId) setTimeout(() => fetchMessages(userId), 400);
}

function joinDMCall(userId, video) { startDMCall(userId, video, true); }

function openCallOverlay(name) {
  let ov = document.getElementById('call-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'call-overlay'; ov.className = 'call-overlay';
    ov.innerHTML = '<div class="co-head"><span class="co-dot"></span><span id="co-title"></span></div>'
      + '<div class="call-tiles big" id="co-tiles"></div><div class="call-controls" id="co-controls"></div>';
    document.body.appendChild(ov);
  }
  document.getElementById('co-title').textContent = t('call.with', {name: name});
  ov.classList.add('show');
  return document.getElementById('co-tiles');
}

function renderCallOverlay() {
  const ctrl = document.getElementById('co-controls');
  if (!ctrl) return;
  if (!inCall()) { closeCallOverlay(); return; }
  ctrl.innerHTML = callControlsHtml(Call.key);
  const others = Call.room.remoteParticipants.size;
  // 1-to-1: when the other person hangs up, end the call for us too
  if (others > 0) Call.hadOthers = true;
  else if (Call.hadOthers) { Call.hadOthers = false; showToast(t('call.ended')); leaveCall(true); closeCallOverlay(); return; }
  const title = document.getElementById('co-title');
  if (title && !others) title.dataset.waiting = '1'; else if (title) delete title.dataset.waiting;
}

function closeCallOverlay() {
  const ov = document.getElementById('call-overlay');
  if (ov) { ov.classList.remove('show'); const tl = document.getElementById('co-tiles'); if (tl) tl.innerHTML = ''; }
  if (Call.key && String(Call.key).startsWith('dm:')) leaveCall(true);
}

// ── Call messages inside DMs ───────────────────────────────

function isCallMarker(s) { return /^\[\[call:(voice|video)\]\]$/.test(s || ''); }

function dmPreviewText(s) {
  if (isCallMarker(s)) return '📞 ' + t('call.started');
  return s || '';
}

function dmPreview(s) { return s ? esc(dmPreviewText(s)) : '…'; }

function renderDMContent(content, senderId) {
  if (!isCallMarker(content)) return richText(content);
  const video = content.indexOf('video') > -1;
  const other = senderId === S.user.id ? S.activeConv : senderId;
  return '<div class="dm-call">' + (video ? '🎥 ' : '📞 ') + esc(t(video ? 'call.videoStarted' : 'call.started'))
    + '<button onclick="joinDMCall(' + other + ',' + video + ')">' + esc(t('call.join')) + '</button></div>';
}

// Banner shown on any page when someone starts a call with you
function showIncomingCall(user, marker) {
  if (inCall()) return;
  C.people[user.id] = user.name;
  const video = (marker || '').indexOf('video') > -1;
  let el = document.getElementById('incoming-call');
  if (!el) { el = document.createElement('div'); el.id = 'incoming-call'; el.className = 'incoming-call'; document.body.appendChild(el); }
  el.innerHTML = peerAvatar(user, 40) + '<div class="ic-text"><b>' + esc(user.name) + '</b><span>' + esc(t(video ? 'call.incomingVideo' : 'call.incoming')) + '</span></div>'
    + '<button class="ic-join" onclick="document.getElementById(\'incoming-call\').remove();S.activeConvName=\'\';joinDMCall(' + user.id + ',' + video + ')">' + esc(t('call.join')) + '</button>'
    + '<button class="ic-close" onclick="this.parentElement.remove()" aria-label="Dismiss">✕</button>';
  setTimeout(() => { if (el.isConnected) el.remove(); }, 45000);
}

window.addEventListener('beforeunload', () => { if (Call.room) Call.room.disconnect(); });

/* Aura Chat v5 */
'use strict';
(function () {

  const API = 'http://localhost:8080';
  const WS = API.replace(/^http/, 'ws') + '/ws/websocket';

  const $ = id => document.getElementById(id);
  const authScreen = $('authScreen'), appShell = $('appShell');
  const authForm = $('authForm');
  const authTabs = [...document.querySelectorAll('.auth-tab')];
  const usernameGroup = $('usernameGroup'), usernameInput = $('usernameInput');
  const emailInput = $('emailInput'), passwordInput = $('passwordInput');
  const authStatus = $('authStatus'), authSubmitBtn = $('authSubmitBtn');
  const authBtnLabel = $('authBtnLabel'), authSpinner = $('authSpinner');
  const profileAvatar = $('profileAvatar'), profileAvatarIni = $('profileAvatarInitial');
  const profileName = $('profileName'), profilePublicId = $('profilePublicId');
  const connectionDot = $('connectionDot'), leaveBtn = $('leaveBtn');
  const profileModal = $('profileModal'), openProfileBtn = $('openProfileModal');
  const closeProfileBtn = $('closeProfileModal'), cancelProfileBtn = $('cancelProfileBtn');
  const saveProfileBtn = $('saveProfileBtn'), saveBtnLabel = $('saveBtnLabel');
  const saveSpinner = $('saveSpinner'), profileSaveHint = $('profileSaveHint');
  const modalAvatar = $('modalAvatar'), modalAvatarIni = $('modalAvatarInitial');
  const profileUsernameInput = $('profileUsernameInput'), colorSwatches = $('colorSwatches');
  const userSearchForm = $('userSearchForm'), searchInput = $('publicIdSearchInput');
  const searchHint = $('userSearchStatus'), convList = $('conversationList');
  const chatAvatar = $('chatAvatar'), chatAvatarIni = $('chatAvatarInitial');
  const chatTitle = $('chatTitle'), chatSubtitle = $('chatSubtitle');
  const statusBadge = $('statusBadge'), statusText = $('statusText');
  const messagesPane = $('messages'), emptyState = $('emptyState');
  const composerForm = $('composerForm'), textarea = $('messageInput');
  const sendBtn = $('sendBtn'), toastContainer = $('toastContainer');

  let me = { username: '', publicId: '', avatarColor: null }, authMode = 'login';
  let conversations = [], active = null, activeSub = null, convSub = null;
  let socket = null, connected = false, connecting = false, disconnecting = false, manualClose = false;
  let heartbeat = null, stompBuffer = '', lastMsgDate = null, lastSenderId = null, pendingColor = null;

  const initial = n => (n || '?').charAt(0).toUpperCase();
  const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function isLightColor(h) { if (!h || h.length < 7) return false; const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16); return (r * 299 + g * 587 + b * 114) / 1000 > 128; }
  function applyAvatarColor(el, c) { if (c) { el.style.background = c; el.style.borderColor = 'transparent'; el.style.color = isLightColor(c) ? '#13151A' : '#F0F2F5'; } else { el.style.background = el.style.borderColor = el.style.color = ''; } }

  function toast(msg, type = 'ok', ms = 3000) {
    const normalized = String(msg || '').toLowerCase();
    const isConnectionToast = /(connection\s+(lost|error))/.test(normalized);
    const el = document.createElement('div');
    el.className = `toast toast--${type}${isConnectionToast ? ' toast--connection-lost' : ''}`;
    el.innerHTML = `<div class="toast-dot"></div><span>${escHtml(msg)}</span>`;
    toastContainer.appendChild(el);
    const d = () => { el.classList.add('is-out'); el.addEventListener('animationend', () => el.remove(), { once: true }); };
    setTimeout(d, ms);
    el.addEventListener('click', d);
  }

  function saveSession(t, u, p, c) { localStorage.setItem('aura.token', t || ''); localStorage.setItem('aura.username', u || ''); localStorage.setItem('aura.publicId', p || ''); localStorage.setItem('aura.avatarColor', c || ''); }
  function clearSession() { ['aura.token', 'aura.username', 'aura.publicId', 'aura.avatarColor'].forEach(k => localStorage.removeItem(k)); }
  function getToken() { return localStorage.getItem('aura.token') || ''; }
  function authFetch(url, opts = {}) { opts.headers = { 'Authorization': `Bearer ${getToken()}`, ...(opts.headers || {}) }; return fetch(url, opts); }

  function applyMe(u, p, c) { me = { username: u, publicId: p || '', avatarColor: c || null }; profileName.textContent = u; profilePublicId.textContent = p || '--------'; profileAvatarIni.textContent = initial(u); applyAvatarColor(profileAvatar, c); }

  function setStatus(l, s) { statusText.textContent = l; statusBadge.className = 'conn-badge' + (s === 'ok' ? ' is-ok' : s === 'err' ? ' is-err' : ''); connectionDot.classList.toggle('is-on', s === 'ok'); }

  function showApp() { authScreen.hidden = true; appShell.hidden = false; }
  function showAuth() { appShell.hidden = true; authScreen.hidden = false; emailInput.value = ''; passwordInput.value = ''; usernameInput.value = ''; setAuthMode('login'); setTimeout(() => emailInput.focus(), 60); }

  function setAuthHint(m, t = '') { authStatus.textContent = m; authStatus.className = 'auth-hint' + (t ? ' is-' + t : ''); }
  function setAuthMode(mode) {
    authMode = mode;
    authTabs.forEach(t => { const on = t.dataset.mode === mode; t.classList.toggle('is-active', on); t.setAttribute('aria-selected', String(on)); });
    usernameGroup.hidden = mode !== 'register';
    usernameInput.disabled = mode !== 'register';
    passwordInput.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    authBtnLabel.textContent = mode === 'register' ? 'Create account' : 'Sign in';
    setAuthHint('');
  }
  authTabs.forEach(t => t.addEventListener('click', () => setAuthMode(t.dataset.mode)));
  authForm.addEventListener('submit', e => { e.preventDefault(); doAuth(); });

  async function doAuth() {
    const email = emailInput.value.trim(), password = passwordInput.value, username = usernameInput.value.trim();
    if (authMode === 'register' && !username) { setAuthHint('Username is required.', 'error'); return; }
    if (!email || !password) { setAuthHint('Email and password are required.', 'error'); return; }
    authSubmitBtn.disabled = true; authSpinner.hidden = false; authBtnLabel.style.opacity = '0.6';
    setAuthHint(authMode === 'register' ? 'Creating account...' : 'Signing in...');
    try {
      const ep = authMode === 'register' ? 'register' : 'login';
      const body = authMode === 'register' ? { username, email, password } : { email, password };
      const res = await fetch(`${API}/api/auth/${ep}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        const m = data.fields ? Object.values(data.fields).join(' ') : (data.error || 'Something went wrong.');
        throw new Error(m);
      }
      if (!data.token || !data.username) throw new Error('Unexpected server response.');
      saveSession(data.token, data.username, data.publicId, data.avatarColor);
      applyMe(data.username, data.publicId, data.avatarColor);
      showApp();
      await loadConversations();
      connect();
    } catch (err) {
      setAuthHint(err.message, 'error');
    } finally {
      authSubmitBtn.disabled = false; authSpinner.hidden = true; authBtnLabel.style.opacity = '1';
    }
  }

  function setProfileHint(m, t = '') { profileSaveHint.textContent = m; profileSaveHint.className = 'auth-hint' + (t ? ' is-' + t : ''); }
  function updateSwatches(c) { colorSwatches.querySelectorAll('.swatch').forEach(s => s.classList.toggle('is-active', s.dataset.color === c)); }
  function openProfileModal() { profileUsernameInput.value = me.username; pendingColor = me.avatarColor; modalAvatarIni.textContent = initial(me.username); applyAvatarColor(modalAvatar, me.avatarColor); updateSwatches(me.avatarColor); setProfileHint(''); profileModal.hidden = false; setTimeout(() => profileUsernameInput.focus(), 60); }
  function closeProfileModal() { profileModal.hidden = true; }
  colorSwatches.addEventListener('click', e => { const sw = e.target.closest('.swatch'); if (!sw) return; pendingColor = sw.dataset.color; applyAvatarColor(modalAvatar, pendingColor); modalAvatarIni.textContent = initial(profileUsernameInput.value) || initial(me.username); updateSwatches(pendingColor); });
  profileUsernameInput.addEventListener('input', () => { modalAvatarIni.textContent = initial(profileUsernameInput.value) || initial(me.username); });
  openProfileBtn.addEventListener('click', openProfileModal);
  closeProfileBtn.addEventListener('click', closeProfileModal);
  cancelProfileBtn.addEventListener('click', closeProfileModal);
  profileModal.addEventListener('click', e => { if (e.target === profileModal) closeProfileModal(); });
  saveProfileBtn.addEventListener('click', async () => {
    const nu = profileUsernameInput.value.trim();
    if (!nu) { setProfileHint('Username cannot be empty.', 'error'); return; }
    saveProfileBtn.disabled = true; saveSpinner.hidden = false; saveBtnLabel.style.opacity = '0.5'; setProfileHint('Saving...');
    try {
      const res = await authFetch(`${API}/api/users/me`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: nu, avatarColor: pendingColor }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed.');
      saveSession(getToken(), data.username, data.publicId, data.avatarColor);
      applyMe(data.username, data.publicId, data.avatarColor);
      closeProfileModal(); toast('Profile updated', 'ok'); renderConvList();
    } catch (err) { setProfileHint(err.message, 'error'); }
    finally { saveProfileBtn.disabled = false; saveSpinner.hidden = true; saveBtnLabel.style.opacity = '1'; }
  });

  async function loadConversations() {
    try {
      const res = await authFetch(`${API}/api/conversations?currentUser=${encodeURIComponent(me.username)}`);
      if (!res.ok) throw new Error();
      conversations = await res.json();
    } catch { toast('Could not load conversations.', 'err'); conversations = []; }
    renderConvList();
  }
  function renderConvList() { convList.innerHTML = ''; if (!conversations.length) { convList.innerHTML = '<div class="conv-empty">No conversations yet.<br>Search a public ID to start.</div>'; return; } conversations.forEach((c, i) => { const b = buildConvItem(c); b.style.animationDelay = `${i * 20}ms`; convList.appendChild(b); }); }
  function buildConvItem(conv) {
    const o = otherParticipant(conv);
    const btn = document.createElement('button'); btn.type = 'button';
    btn.className = 'conv-item' + (active?.id === conv.id ? ' is-active' : '');
    const av = document.createElement('div'); av.className = 'avatar avatar--sm';
    av.innerHTML = `<span>${initial(o.username)}</span>`; applyAvatarColor(av, o.avatarColor);
    const body = document.createElement('div'); body.className = 'conv-item-body';
    const n = document.createElement('div'); n.className = 'conv-item-name'; n.textContent = o.username;
    const id = document.createElement('div'); id.className = 'conv-item-id'; id.textContent = o.publicId;
    body.appendChild(n); body.appendChild(id); btn.appendChild(av); btn.appendChild(body);
    btn.addEventListener('click', () => selectConversation(conv)); return btn;
  }
  function upsertConversation(c) { const i = conversations.findIndex(x => x.id === c.id); if (i >= 0) { conversations[i] = c; return false; } conversations.unshift(c); return true; }
  function otherParticipant(c) { const m1 = c.participant1PublicId === me.publicId || c.participant1Username === me.username; return { username: m1 ? c.participant2Username : c.participant1Username, publicId: m1 ? c.participant2PublicId : c.participant1PublicId, avatarColor: m1 ? c.participant2AvatarColor : c.participant1AvatarColor }; }
  async function selectConversation(conv) {
    active = conv; const o = otherParticipant(conv);
    chatTitle.textContent = o.username; chatSubtitle.textContent = o.publicId;
    chatAvatarIni.textContent = initial(o.username); applyAvatarColor(chatAvatar, o.avatarColor);
    emptyState.hidden = true; renderConvList(); unsubActive(); clearMessages(); setComposerEnabled(false);
    try { await loadMessages(conv.id); subActive(); setComposerEnabled(connected); }
    catch { appendSystem('Could not load messages.'); }
  }

  function setSearchHint(m, t = '') { searchHint.textContent = m; searchHint.className = 'search-hint' + (t ? ' is-' + t : ''); }
  userSearchForm.addEventListener('submit', async e => {
    e.preventDefault();
    const id = searchInput.value.trim().toUpperCase();
    if (!id) return;
    if (id === me.publicId) { setSearchHint('That is your own ID.', 'error'); return; }
    setSearchHint('Searching...');
    try {
      const uRes = await authFetch(`${API}/api/users/public/${encodeURIComponent(id)}`);
      if (!uRes.ok) { setSearchHint('No user found.', 'error'); return; }
      const cRes = await authFetch(`${API}/api/conversations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentUser: me.username, otherPublicId: id }) });
      if (!cRes.ok) { setSearchHint('Could not open conversation.', 'error'); return; }
      const conv = await cRes.json(); upsertConversation(conv); searchInput.value = ''; setSearchHint(''); renderConvList(); await selectConversation(conv);
    } catch { setSearchHint('Network error.', 'error'); }
  });

  async function loadMessages(id) {
    const res = await authFetch(`${API}/api/chat/conversations/${id}/messages`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const h = await res.json(); clearMessages();
    if (!Array.isArray(h) || !h.length) { appendSystem('No messages yet. Say hello!'); return; }
    h.forEach(m => appendMessage(m)); scrollBottom(false);
  }
  function isMine(m) { if (m.senderPublicId && me.publicId) return m.senderPublicId === me.publicId; return senderName(m) === me.username; }
  function senderName(m) { if (!m.sender) return ''; return typeof m.sender === 'string' ? m.sender : (m.sender.username || ''); }
  function appendMessage(msg) {
    const type = (msg.type || 'CHAT').toUpperCase();
    if (type !== 'CHAT') { appendSystem(msg.content || ''); return; }
    const mine = isMine(msg), ts = msg.timestamp ? new Date(msg.timestamp) : new Date(), ds = ts.toDateString();
    if (ds !== lastMsgDate) { lastMsgDate = ds; lastSenderId = null; const sep = document.createElement('div'); sep.className = 'date-sep'; sep.textContent = formatDate(ts); messagesPane.appendChild(sep); }
    const sid = mine ? '__me__' : (msg.senderPublicId || senderName(msg)), first = sid !== lastSenderId; lastSenderId = sid;
    const row = document.createElement('div'); row.className = `msg-row ${mine ? 'is-mine' : 'is-theirs'}${first ? ' gap-top' : ''}`;
    const bub = document.createElement('div'); bub.className = 'bubble';
    if (first && !mine) { const s = document.createElement('div'); s.className = 'bubble-sender'; s.textContent = senderName(msg) || 'Unknown'; bub.appendChild(s); }
    const t = document.createElement('div'); t.className = 'bubble-text'; t.textContent = msg.content || ''; bub.appendChild(t);
    const f = document.createElement('div'); f.className = 'bubble-footer';
    const tm = document.createElement('span'); tm.className = 'bubble-time'; tm.textContent = formatTime(ts);
    f.appendChild(tm); bub.appendChild(f); row.appendChild(bub); messagesPane.appendChild(row);
  }
  function appendSystem(txt) { const el = document.createElement('div'); el.className = 'msg-system'; const i = document.createElement('div'); i.className = 'msg-system-inner'; i.textContent = txt; el.appendChild(i); messagesPane.appendChild(el); lastSenderId = null; }
  function clearMessages() { Array.from(messagesPane.children).forEach(c => { if (c !== emptyState) c.remove(); }); lastMsgDate = null; lastSenderId = null; }
  function scrollBottom(s = true) { messagesPane.scrollTo({ top: messagesPane.scrollHeight, behavior: s ? 'smooth' : 'instant' }); }
  function formatTime(d) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  function formatDate(d) { const diff = Math.floor((new Date() - d) / 86400000); if (diff === 0) return 'Today'; if (diff === 1) return 'Yesterday'; return d.toLocaleDateString([], { month: 'short', day: 'numeric' }); }

  function setComposerEnabled(on) { sendBtn.disabled = !on; textarea.disabled = !on; if (on) textarea.focus(); }
  textarea.addEventListener('input', () => { textarea.style.height = 'auto'; textarea.style.height = Math.min(textarea.scrollHeight, 130) + 'px'; });
  textarea.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });
  composerForm.addEventListener('submit', e => { e.preventDefault(); doSend(); });
  function doSend() { const c = textarea.value.trim(); if (!c || !connected || !active) return; stompSend('/app/chat.sendMessage', JSON.stringify({ sender: me.username, content: c, type: 'CHAT', conversationId: active.id })); textarea.value = ''; textarea.style.height = 'auto'; textarea.focus(); scrollBottom(); }

  function connect() { if (!me.username || connecting || connected) return; connecting = true; setStatus('Connecting...', ''); try { socket = new WebSocket(WS); } catch { connecting = false; setStatus('Disconnected', 'err'); return; } socket.onopen = () => stompFrame('CONNECT', { 'accept-version': '1.2', host: new URL(API).host }); socket.onmessage = e => parseFrames(e.data).forEach(handleFrame); socket.onerror = () => onDisconnect(false, 'Connection error.'); socket.onclose = () => { if (!manualClose) onDisconnect(false, 'Connection lost.'); }; }
  function handleFrame(raw) {
    const nl = raw.indexOf('\n'), cmd = nl === -1 ? raw : raw.slice(0, nl), rest = raw.slice(nl + 1), si = rest.indexOf('\n\n'), hdrsRaw = si === -1 ? rest : rest.slice(0, si), body = si === -1 ? '' : rest.slice(si + 2).replace(/\u0000$/, '');
    const hdrs = {}; hdrsRaw.split('\n').forEach(l => { const i = l.indexOf(':'); if (i > -1) hdrs[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
    if (cmd === 'CONNECTED') { connecting = false; connected = true; leaveBtn.disabled = false; setStatus('Connected', 'ok'); startHB(); stompSend('/app/chat.addUser', JSON.stringify({ sender: me.username, type: 'JOIN' })); subConvUpdates(); if (active) subActive(); setComposerEnabled(!!active); toast('Connected', 'ok', 2000); return; }
    if (cmd === 'MESSAGE') { const dest = hdrs.destination || ''; if (dest === `/topic/users/${me.publicId}/conversations`) { try { handleConvUpdate(JSON.parse(body)); } catch { } return; } if (active && dest === `/topic/chat/${active.id}`) { try { const msg = JSON.parse(body); appendMessage(msg); scrollBottom(); } catch { appendSystem(body); } return; } }
    if (cmd === 'ERROR') { toast(hdrs.message || 'Server error', 'err'); onDisconnect(false, 'Server error.'); }
  }
  async function handleConvUpdate(conv) { const isNew = upsertConversation(conv); renderConvList(); if (isNew && (!active || active.id !== conv.id)) toast(`New message from ${otherParticipant(conv).username}`, 'ok'); }
  function subActive() { if (!connected || !active || activeSub) return; activeSub = `sub-chat-${active.id}`; stompFrame('SUBSCRIBE', { id: activeSub, destination: `/topic/chat/${active.id}` }); }
  function unsubActive() { if (activeSub) { if (connected) stompFrame('UNSUBSCRIBE', { id: activeSub }); activeSub = null; } }
  function subConvUpdates() { if (!connected || !me.publicId || convSub) return; convSub = `sub-convs-${me.publicId}`; stompFrame('SUBSCRIBE', { id: convSub, destination: `/topic/users/${me.publicId}/conversations` }); }
  function unsubConvUpdates() { if (convSub) { if (connected) stompFrame('UNSUBSCRIBE', { id: convSub }); convSub = null; } }
  function onDisconnect(manual, msg) {
    if (disconnecting) return; disconnecting = true; stopHB(); connecting = false; unsubActive(); unsubConvUpdates();
    if (socket) { if (manual) { manualClose = true; if (socket.readyState === WebSocket.OPEN) try { stompFrame('DISCONNECT', { receipt: 'bye' }); } catch { }; } try { socket.close(); } catch { } socket = null; }
    connected = false; leaveBtn.disabled = true; setComposerEnabled(false); setStatus('Disconnected', '');
    if (manual) { clearSession(); me = { username: '', publicId: '', avatarColor: null }; conversations = []; active = activeSub = convSub = null; clearMessages(); emptyState.hidden = false; chatTitle.textContent = 'Select a conversation'; chatSubtitle.textContent = 'Search a public ID or choose from the sidebar'; chatAvatarIni.textContent = '?'; chatAvatar.style.background = ''; showAuth(); }
    else { if (msg) { appendSystem(msg); toast(msg, 'warn'); } }
    manualClose = false; disconnecting = false;
  }
  leaveBtn.addEventListener('click', () => onDisconnect(true, ''));
  function stompFrame(cmd, hdrs = {}) { if (!socket || socket.readyState !== WebSocket.OPEN) return; const lines = [cmd]; Object.entries(hdrs).forEach(([k, v]) => lines.push(`${k}:${String(v)}`)); socket.send(lines.join('\n') + '\n\n\u0000'); }
  function stompSend(dest, body) { if (!socket || socket.readyState !== WebSocket.OPEN) return; socket.send(`SEND\ndestination:${dest}\ncontent-type:application/json\ncontent-length:${new TextEncoder().encode(body).length}\n\n${body}\u0000`); }
  function parseFrames(chunk) { stompBuffer += chunk; const out = []; let i; while ((i = stompBuffer.indexOf('\u0000')) !== -1) { out.push(stompBuffer.slice(0, i)); stompBuffer = stompBuffer.slice(i + 1); } return out; }
  function startHB() { stopHB(); heartbeat = setInterval(() => { if (socket?.readyState === WebSocket.OPEN) socket.send('\n'); }, 10000); }
  function stopHB() { clearInterval(heartbeat); heartbeat = null; }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!profileModal.hidden) { closeProfileModal(); return; } if (document.activeElement === searchInput) searchInput.blur(); } if (e.key === '/' && !appShell.hidden && document.activeElement !== textarea && document.activeElement !== searchInput) { e.preventDefault(); searchInput.focus(); } });

  (function init() {
    const token = localStorage.getItem('aura.token'), username = localStorage.getItem('aura.username'), publicId = localStorage.getItem('aura.publicId'), avatarColor = localStorage.getItem('aura.avatarColor') || null;
    if (token && username) { applyMe(username, publicId, avatarColor); showApp(); loadConversations().then(connect); }
    else { showAuth(); }
  })();

})();

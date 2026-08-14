/* Aura Chat v5 */
"use strict";
(function () {
  // Derive API base and WebSocket URL from the current page origin so the
  // same build works on localhost, Render, or any other host without changes.
  function defaultApiBase() {
    if (window.AURA_API_BASE) return window.AURA_API_BASE;
    const { protocol, hostname, port, origin } = window.location;
    const localHost = hostname === "localhost" || hostname === "127.0.0.1";
    if (protocol === "file:" || (localHost && port && port !== "8080")) {
      return "http://localhost:8080";
    }
    return origin;
  }
  const API = defaultApiBase().replace(/\/$/, "");
  const WS = API.replace(/^http/, "ws") + "/ws/websocket";

  const $ = (id) => document.getElementById(id);
  const authScreen = $("authScreen"),
    appShell = $("appShell");
  const authForm = $("authForm");
  const authTabs = [...document.querySelectorAll(".auth-tab")];
  const usernameGroup = $("usernameGroup"),
    usernameInput = $("usernameInput");
  const emailInput = $("emailInput"),
    passwordInput = $("passwordInput");
  const authStatus = $("authStatus"),
    authSubmitBtn = $("authSubmitBtn");
  const authBtnLabel = $("authBtnLabel"),
    authSpinner = $("authSpinner");
  const profileAvatar = $("profileAvatar"),
    profileAvatarIni = $("profileAvatarInitial");
  const profileName = $("profileName"),
    profilePublicId = $("profilePublicId");
  const connectionDot = $("connectionDot"),
    leaveBtn = $("leaveBtn");
  const profileModal = $("profileModal"),
    openProfileBtn = $("openProfileModal");
  const closeProfileBtn = $("closeProfileModal"),
    cancelProfileBtn = $("cancelProfileBtn");
  const saveProfileBtn = $("saveProfileBtn"),
    saveBtnLabel = $("saveBtnLabel");
  const saveSpinner = $("saveSpinner"),
    profileSaveHint = $("profileSaveHint");
  const modalAvatar = $("modalAvatar"),
    modalAvatarIni = $("modalAvatarInitial");
  const profileUsernameInput = $("profileUsernameInput"),
    profilePreviewName = $("profilePreviewName");
  const colorSwatches = $("colorSwatches");
  const initialColorPicker = $("initialColorPicker"),
    themeSwatches = $("themeSwatches");
  const userSearchForm = $("userSearchForm"),
    searchInput = $("publicIdSearchInput");
  const searchHint = $("userSearchStatus"),
    convList = $("conversationList");
  const chatPane = document.querySelector(".chat-pane");
  const chatAvatar = $("chatAvatar"),
    chatAvatarIni = $("chatAvatarInitial");
  const chatTitle = $("chatTitle"),
    chatSubtitle = $("chatSubtitle");
  const chatBackBtn = $("chatPaneBackBtn");
  const statusBadge = $("statusBadge"),
    statusText = $("statusText");
  const messagesPane = $("messages"),
    emptyState = $("emptyState");
  const composerForm = $("composerForm"),
    textarea = $("messageInput");
  const sendBtn = $("sendBtn"),
    toastContainer = $("toastContainer");

  let me = { username: "", publicId: "", avatarColor: null },
    authMode = "login";
  let authToken = "";
  let conversations = [],
    active = null,
    activeSub = null,
    convSub = null;
  let hasMessages = false;
  let socket = null,
    connected = false,
    connecting = false,
    disconnecting = false,
    manualClose = false;
  let heartbeat = null,
    stompBuffer = "",
    lastMsgDate = null,
    lastSenderId = null,
    pendingColor = null,
    pendingInitialColor = "#F8FAFC";

  const initial = (n) => (n || "?").charAt(0).toUpperCase();
  const escHtml = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  function isLightColor(h) {
    if (!h || h.length < 7) return false;
    const r = parseInt(h.slice(1, 3), 16),
      g = parseInt(h.slice(3, 5), 16),
      b = parseInt(h.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 128;
  }
  function applyAvatarColor(el, c, textColor) {
    if (c) {
      el.style.background = c;
      el.style.borderColor = "transparent";
      el.style.color = textColor || (isLightColor(c) ? "#13151A" : "#F0F2F5");
    } else {
      el.style.background = el.style.borderColor = "";
      el.style.color = textColor || "";
    }
  }
  const themes = {
    aura: {
      accent: "#E56F7D",
      accent2: "#F08B69",
      dim: "rgba(229,111,125,.10)",
      mid: "rgba(229,111,125,.18)",
      grad: "linear-gradient(135deg,#D861A7 0%,#E56F7D 45%,#F08B69 72%,#F6D88A 100%)",
    },
    ocean: {
      accent: "#0EA5E9",
      accent2: "#14B8A6",
      dim: "rgba(14,165,233,.10)",
      mid: "rgba(14,165,233,.18)",
      grad: "linear-gradient(135deg,#2563EB 0%,#0EA5E9 48%,#14B8A6 100%)",
    },
    violet: {
      accent: "#8B5CF6",
      accent2: "#EC4899",
      dim: "rgba(139,92,246,.10)",
      mid: "rgba(139,92,246,.18)",
      grad: "linear-gradient(135deg,#7C3AED 0%,#8B5CF6 48%,#EC4899 100%)",
    },
    forest: {
      accent: "#16A34A",
      accent2: "#84CC16",
      dim: "rgba(22,163,74,.10)",
      mid: "rgba(22,163,74,.18)",
      grad: "linear-gradient(135deg,#15803D 0%,#16A34A 50%,#84CC16 100%)",
    },
    sunset: {
      accent: "#F97316",
      accent2: "#FACC15",
      dim: "rgba(249,115,22,.10)",
      mid: "rgba(249,115,22,.18)",
      grad: "linear-gradient(135deg,#EF4444 0%,#F97316 52%,#FACC15 100%)",
    },
  };
  function applyTheme(name) {
    const t = themes[name] || themes.aura;
    const r = document.documentElement.style;
    r.setProperty("--accent", t.accent);
    r.setProperty("--accent2", t.accent2);
    r.setProperty("--accent-dim", t.dim);
    r.setProperty("--accent-mid", t.mid);
    r.setProperty("--grad", t.grad);
    localStorage.setItem("aura.theme", name);
    themeSwatches
      ?.querySelectorAll(".theme-swatch")
      .forEach((b) =>
        b.classList.toggle("is-active", b.dataset.theme === name),
      );
  }
  function applyInitialColor(c) {
    pendingInitialColor = c || "#F8FAFC";
    localStorage.setItem("aura.initialColor", pendingInitialColor);
    applyAvatarColor(profileAvatar, me.avatarColor, pendingInitialColor);
    applyAvatarColor(
      modalAvatar,
      pendingColor || me.avatarColor,
      pendingInitialColor,
    );
    initialColorPicker
      ?.querySelectorAll("button")
      .forEach((b) =>
        b.classList.toggle(
          "is-active",
          b.dataset.initialColor === pendingInitialColor,
        ),
      );
  }

  function toast(msg, type = "ok", ms = 3000) {
    const normalized = String(msg || "").toLowerCase();
    const isConnectionToast = /(connection\s+(lost|error))/.test(normalized);
    const el = document.createElement("div");
    el.className = `toast toast--${type}${isConnectionToast ? " toast--connection-lost" : ""}`;
    el.innerHTML = `<div class="toast-dot"></div><span>${escHtml(msg)}</span>`;
    toastContainer.appendChild(el);
    const d = () => {
      el.classList.add("is-out");
      el.addEventListener("animationend", () => el.remove(), { once: true });
    };
    setTimeout(d, ms);
    el.addEventListener("click", d);
  }

  const sessionKeys = [
    "aura.token",
    "aura.username",
    "aura.publicId",
    "aura.avatarColor",
  ];
  function saveSession(t, u, p, c) {
    authToken = t || "";
    sessionStorage.setItem("aura.token", authToken);
    sessionStorage.setItem("aura.username", u || "");
    sessionStorage.setItem("aura.publicId", p || "");
    sessionStorage.setItem("aura.avatarColor", c || "");
    sessionKeys.forEach((k) => localStorage.removeItem(k));
  }
  function clearSession() {
    authToken = "";
    sessionKeys.forEach((k) => {
      sessionStorage.removeItem(k);
      localStorage.removeItem(k);
    });
  }
  function getToken() {
    return authToken || sessionStorage.getItem("aura.token") || "";
  }
  function authFetch(url, opts = {}) {
    opts.headers = {
      Authorization: `Bearer ${getToken()}`,
      ...(opts.headers || {}),
    };
    return fetch(url, opts);
  }
  async function readJson(res) {
    const text = await res.text();
    const type = res.headers.get("content-type") || "";
    if (!text) return {};
    if (type.includes("application/json")) return JSON.parse(text);
    if (text.trim().startsWith("{") || text.trim().startsWith("["))
      return JSON.parse(text);
    throw new Error(
      res.ok
        ? "Unexpected server response."
        : "Server returned an HTML error page. Check the backend URL and server logs.",
    );
  }

  function applyMe(u, p, c) {
    me = { username: u, publicId: p || "", avatarColor: c || null };
    profileName.textContent = u;
    profilePublicId.textContent = p || "--------";
    profileAvatarIni.textContent = initial(u);
    applyAvatarColor(profileAvatar, c, pendingInitialColor);
  }

  function setStatus(l, s) {
    statusText.textContent = l;
    statusBadge.className =
      "conn-badge" + (s === "ok" ? " is-ok" : s === "err" ? " is-err" : "");
    connectionDot.classList.toggle("is-on", s === "ok");
  }

  function showApp() {
    authScreen.hidden = true;
    appShell.hidden = false;
  }
  function showAuth() {
    appShell.hidden = true;
    authScreen.hidden = false;
    emailInput.value = "";
    passwordInput.value = "";
    usernameInput.value = "";
    setAuthMode("login");
    setTimeout(() => emailInput.focus(), 60);
  }
  function syncChatPaneVisibility() {
    const mobile = window.innerWidth <= 725;
    const shouldShow = !mobile || Boolean(active);
    chatPane?.classList.toggle("is-visible", shouldShow);
    appShell.classList.toggle("is-mobile-chat-open", mobile && shouldShow);
    chatPane?.setAttribute("aria-hidden", String(!shouldShow));
  }

  function setAuthHint(m, t = "") {
    authStatus.textContent = m;
    authStatus.className = "auth-hint" + (t ? " is-" + t : "");
  }
  function setAuthMode(mode) {
    authMode = mode;
    authTabs.forEach((t) => {
      const on = t.dataset.mode === mode;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", String(on));
    });
    usernameGroup.hidden = mode !== "register";
    usernameInput.disabled = mode !== "register";
    passwordInput.autocomplete =
      mode === "register" ? "new-password" : "current-password";
    authBtnLabel.textContent =
      mode === "register" ? "Create account" : "Sign in";
    setAuthHint("");
  }
  authTabs.forEach((t) =>
    t.addEventListener("click", () => setAuthMode(t.dataset.mode)),
  );
  authForm.addEventListener("submit", (e) => {
    e.preventDefault();
    doAuth();
  });

  async function doAuth() {
    const email = emailInput.value.trim(),
      password = passwordInput.value,
      username = usernameInput.value.trim();
    if (authMode === "register" && !username) {
      setAuthHint("Username is required.", "error");
      return;
    }
    if (!email || !password) {
      setAuthHint("Email and password are required.", "error");
      return;
    }
    authSubmitBtn.disabled = true;
    authSpinner.hidden = false;
    authBtnLabel.style.opacity = "0.6";
    setAuthHint(
      authMode === "register" ? "Creating account..." : "Signing in...",
    );
    try {
      const ep = authMode === "register" ? "register" : "login";
      const body =
        authMode === "register"
          ? { username, email, password }
          : { email, password };
      const res = await fetch(`${API}/api/auth/${ep}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await readJson(res);
      if (!res.ok) {
        const m = data.fields
          ? Object.values(data.fields).join(" ")
          : data.error || "Something went wrong.";
        throw new Error(m);
      }
      if (!data.token || !data.username)
        throw new Error("Unexpected server response.");
      saveSession(data.token, data.username, data.publicId, data.avatarColor);
      applyMe(data.username, data.publicId, data.avatarColor);
      showApp();
      await loadConversations();
      connect();
    } catch (err) {
      setAuthHint(err.message, "error");
    } finally {
      authSubmitBtn.disabled = false;
      authSpinner.hidden = true;
      authBtnLabel.style.opacity = "1";
    }
  }

  function setProfileHint(m, t = "") {
    profileSaveHint.textContent = m;
    profileSaveHint.className = "auth-hint" + (t ? " is-" + t : "");
  }
  function updateProfilePreview() {
    const nextName =
      (profileUsernameInput.value || me.username || "Your name").trim() ||
      "Your name";
    profilePreviewName.textContent = nextName;
    modalAvatarIni.textContent = initial(nextName);
    applyAvatarColor(
      modalAvatar,
      pendingColor || me.avatarColor,
      pendingInitialColor,
    );
  }
  function updateSwatches(c) {
    colorSwatches
      .querySelectorAll(".swatch")
      .forEach((s) => s.classList.toggle("is-active", s.dataset.color === c));
  }
  function openProfileModal() {
    profileUsernameInput.value = me.username;
    pendingColor = me.avatarColor;
    updateProfilePreview();
    updateSwatches(me.avatarColor);
    applyInitialColor(pendingInitialColor);
    setProfileHint("");
    profileModal.hidden = false;
    setTimeout(() => profileUsernameInput.focus(), 60);
  }
  function closeProfileModal() {
    profileModal.hidden = true;
  }
  function syncEmptyState() {
    emptyState.hidden = Boolean(active && hasMessages);
  }

  // Copy the text from an element when it is clicked.
  async function copyText(elementOrId, msg = "Successfully copied text to clipboard!") {
    const element =
      typeof elementOrId === "string"
        ? document.getElementById(elementOrId)
        : elementOrId;
    const text = element?.innerText?.trim() || element?.textContent?.trim() || "";

    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      await toast(msg, "ok");
      console.log("Text copied to clipboard");
    } catch (err) {
      console.error("Failed to copy: ", err);
      toast("Could not copy to clipboard.", "err");
    }
  }

  // ID Copy Mechanism Just By Clicking the ID :
  profilePublicId.addEventListener("click", (event) => {
    copyText(profilePublicId, "Successfully Copied ID to Clipboard!");
    event.stopImmediatePropagation();
  });

  colorSwatches.addEventListener("click", (e) => {
    const sw = e.target.closest(".swatch");
    if (!sw) return;
    pendingColor = sw.dataset.color;
    updateProfilePreview();
    updateSwatches(pendingColor);
  });
  initialColorPicker?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-initial-color]");
    if (btn) {
      applyInitialColor(btn.dataset.initialColor);
      updateProfilePreview();
    }
  });
  themeSwatches?.addEventListener("click", (e) => {
    const btn = e.target.closest(".theme-swatch");
    if (btn) applyTheme(btn.dataset.theme);
  });
  profileUsernameInput.addEventListener("input", updateProfilePreview);
  openProfileBtn.addEventListener("click", openProfileModal);
  closeProfileBtn.addEventListener("click", closeProfileModal);
  cancelProfileBtn.addEventListener("click", closeProfileModal);
  profileModal.addEventListener("click", (e) => {
    if (e.target === profileModal) closeProfileModal();
  });
  saveProfileBtn.addEventListener("click", async () => {
    const nu = profileUsernameInput.value.trim();
    if (!nu) {
      setProfileHint("Username cannot be empty.", "error");
      return;
    }
    const patch = {};
    if (nu !== me.username) patch.username = nu;
    if (pendingColor !== me.avatarColor) patch.avatarColor = pendingColor;
    if (!Object.keys(patch).length) {
      closeProfileModal();
      return;
    }
    saveProfileBtn.disabled = true;
    saveSpinner.hidden = false;
    saveBtnLabel.style.opacity = "0.5";
    setProfileHint("Saving...");
    try {
      const res = await authFetch(`${API}/api/users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Save failed.");
      saveSession(getToken(), data.username, data.publicId, data.avatarColor);
      applyMe(data.username, data.publicId, data.avatarColor);
      applyInitialColor(pendingInitialColor);
      updateProfilePreview();
      closeProfileModal();
      toast("Profile updated", "ok");
      renderConvList();
    } catch (err) {
      setProfileHint(err.message, "error");
    } finally {
      saveProfileBtn.disabled = false;
      saveSpinner.hidden = true;
      saveBtnLabel.style.opacity = "1";
    }
  });

  async function loadConversations() {
    try {
      // currentUser is now derived server-side from the JWT — no need to send it
      const res = await authFetch(`${API}/api/conversations`);
      if (!res.ok) throw new Error();
      conversations = await readJson(res);
    } catch {
      toast("Could not load conversations.", "err");
      conversations = [];
    }
    renderConvList();
  }
  function renderConvList() {
    convList.innerHTML = "";
    if (!conversations.length) {
      convList.innerHTML =
        '<div class="conv-empty">No conversations yet.<br>Search a public ID to start.</div>';
      return;
    }
    conversations.forEach((c, i) => {
      const b = buildConvItem(c);
      b.style.animationDelay = `${i * 20}ms`;
      convList.appendChild(b);
    });
  }
  function buildConvItem(conv) {
    const o = otherParticipant(conv);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "conv-item" + (active?.id === conv.id ? " is-active" : "");
    const av = document.createElement("div");
    av.className = "avatar avatar--sm";
    av.innerHTML = `<span>${initial(o.username)}</span>`;
    applyAvatarColor(av, o.avatarColor);
    const body = document.createElement("div");
    body.className = "conv-item-body";
    const n = document.createElement("div");
    n.className = "conv-item-name";
    n.textContent = o.username;
    const id = document.createElement("div");
    id.className = "conv-item-id";
    id.textContent = o.publicId;
    body.appendChild(n);
    body.appendChild(id);
    btn.appendChild(av);
    btn.appendChild(body);
    btn.addEventListener("click", () => selectConversation(conv));
    return btn;
  }
  function upsertConversation(c) {
    const i = conversations.findIndex((x) => x.id === c.id);
    if (i >= 0) {
      conversations[i] = c;
      return false;
    }
    conversations.unshift(c);
    return true;
  }
  function otherParticipant(c) {
    const m1 =
      c.participant1PublicId === me.publicId ||
      c.participant1Username === me.username;
    return {
      username: m1 ? c.participant2Username : c.participant1Username,
      publicId: m1 ? c.participant2PublicId : c.participant1PublicId,
      avatarColor: m1 ? c.participant2AvatarColor : c.participant1AvatarColor,
    };
  }
  async function selectConversation(conv) {
    active = conv;
    const o = otherParticipant(conv);
    chatTitle.textContent = o.username;
    chatSubtitle.textContent = o.publicId;
    chatAvatarIni.textContent = initial(o.username);
    applyAvatarColor(chatAvatar, o.avatarColor);
    hasMessages = false;
    syncEmptyState();
    renderConvList();
    unsubActive();
    clearMessages();
    setComposerEnabled(false);
    syncChatPaneVisibility();
    try {
      await loadMessages(conv.id);
      subActive();
      setComposerEnabled(connected);
    } catch {
      appendSystem("Could not load messages.");
    }
  }

  function setSearchHint(m, t = "") {
    searchHint.textContent = m;
    searchHint.className = "search-hint" + (t ? " is-" + t : "");
  }
  userSearchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = searchInput.value.trim().toUpperCase();
    if (!id) return;
    if (id === me.publicId) {
      setSearchHint("That is your own ID.", "error");
      return;
    }
    setSearchHint("Searching...");
    try {
      const uRes = await authFetch(
        `${API}/api/users/public/${encodeURIComponent(id)}`,
      );
      if (!uRes.ok) {
        setSearchHint("No user found.", "error");
        return;
      }
      const cRes = await authFetch(`${API}/api/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otherPublicId: id }),
      });
      if (!cRes.ok) {
        setSearchHint("Could not open conversation.", "error");
        return;
      }
      const conv = await readJson(cRes);
      upsertConversation(conv);
      searchInput.value = "";
      setSearchHint("");
      renderConvList();
      await selectConversation(conv);
    } catch {
      setSearchHint("Network error.", "error");
    }
  });

  async function loadMessages(id) {
    const res = await authFetch(`${API}/api/chat/conversations/${id}/messages`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const h = await readJson(res);
    clearMessages();
    if (!Array.isArray(h) || !h.length) {
      appendSystem("No messages yet. Say hello!");
      hasMessages = false;
      syncEmptyState();
      return;
    }
    hasMessages = false;
    h.forEach((m) => appendMessage(m));
    scrollBottom(false);
    syncEmptyState();
  }
  function isMine(m) {
    if (m.senderPublicId && me.publicId)
      return m.senderPublicId === me.publicId;
    return senderName(m) === me.username;
  }
  function senderName(m) {
    if (!m.sender) return "";
    return typeof m.sender === "string" ? m.sender : m.sender.username || "";
  }
  function appendMessage(msg) {
    const type = (msg.type || "CHAT").toUpperCase();
    if (type !== "CHAT") {
      appendSystem(msg.content || "");
      return;
    }
    hasMessages = true;
    const mine = isMine(msg),
      ts = msg.timestamp ? new Date(msg.timestamp) : new Date(),
      ds = ts.toDateString();
    if (ds !== lastMsgDate) {
      lastMsgDate = ds;
      lastSenderId = null;
      const sep = document.createElement("div");
      sep.className = "date-sep";
      sep.textContent = formatDate(ts);
      messagesPane.appendChild(sep);
    }
    const sid = mine ? "__me__" : msg.senderPublicId || senderName(msg),
      first = sid !== lastSenderId;
    lastSenderId = sid;
    const row = document.createElement("div");
    row.className = `msg-row ${mine ? "is-mine" : "is-theirs"}${first ? " gap-top" : ""}`;
    const bub = document.createElement("div");
    bub.className = "bubble";
    if (first && !mine) {
      const s = document.createElement("div");
      s.className = "bubble-sender";
      s.textContent = senderName(msg) || "Unknown";
      bub.appendChild(s);
    }
    const t = document.createElement("div");
    t.className = "bubble-text";
    t.textContent = msg.content || "";
    bub.appendChild(t);
    const f = document.createElement("div");
    f.className = "bubble-footer";
    const tm = document.createElement("span");
    tm.className = "bubble-time";
    tm.textContent = formatTime(ts);
    f.appendChild(tm);
    bub.appendChild(f);
    row.appendChild(bub);
    messagesPane.appendChild(row);
  }
  function appendSystem(txt) {
    const el = document.createElement("div");
    el.className = "msg-system";
    const i = document.createElement("div");
    i.className = "msg-system-inner";
    i.textContent = txt;
    el.appendChild(i);
    messagesPane.appendChild(el);
    lastSenderId = null;
  }
  function clearMessages() {
    Array.from(messagesPane.children).forEach((c) => {
      if (c !== emptyState) c.remove();
    });
    lastMsgDate = null;
    lastSenderId = null;
    hasMessages = false;
    syncEmptyState();
  }
  function scrollBottom(s = true) {
    messagesPane.scrollTo({
      top: messagesPane.scrollHeight,
      behavior: s ? "smooth" : "instant",
    });
  }
  function formatTime(d) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  function formatDate(d) {
    const diff = Math.floor((new Date() - d) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function setComposerEnabled(on) {
    sendBtn.disabled = !on;
    textarea.disabled = !on;
    if (on) textarea.focus();
  }
  chatBackBtn?.addEventListener("click", () => {
    active = null;
    clearMessages();
    syncEmptyState();
    chatTitle.textContent = "Select a conversation";
    chatSubtitle.textContent = "Search a public ID or choose from the sidebar";
    chatAvatarIni.textContent = "?";
    applyAvatarColor(chatAvatar, null);
    setComposerEnabled(false);
    renderConvList();
    unsubActive();
    syncChatPaneVisibility();
  });
  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 130) + "px";
  });
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  });
  composerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    doSend();
  });
  function doSend() {
    const c = textarea.value.trim();
    if (!c || !connected || !active) return;
    stompSend(
      "/app/chat.sendMessage",
      JSON.stringify({
        sender: me.username,
        content: c,
        type: "CHAT",
        conversationId: active.id,
      }),
    );
    textarea.value = "";
    textarea.style.height = "auto";
    textarea.focus();
    scrollBottom();
  }

  function connect() {
    if (!me.username || connecting || connected) return;
    connecting = true;
    setStatus("Connecting...", "");
    try {
      socket = new WebSocket(WS);
    } catch {
      connecting = false;
      setStatus("Disconnected", "err");
      return;
    }
    socket.onopen = () =>
      stompFrame("CONNECT", {
        "accept-version": "1.2",
        host: new URL(API).host,
        Authorization: `Bearer ${getToken()}`,
      });
    socket.onmessage = (e) => parseFrames(e.data).forEach(handleFrame);
    socket.onerror = () => onDisconnect(false, "Connection error.");
    socket.onclose = () => {
      if (!manualClose) onDisconnect(false, "Connection lost.");
    };
  }
  function handleFrame(raw) {
    const nl = raw.indexOf("\n"),
      cmd = nl === -1 ? raw : raw.slice(0, nl),
      rest = raw.slice(nl + 1),
      si = rest.indexOf("\n\n"),
      hdrsRaw = si === -1 ? rest : rest.slice(0, si),
      body = si === -1 ? "" : rest.slice(si + 2).replace(/\u0000$/, "");
    const hdrs = {};
    hdrsRaw.split("\n").forEach((l) => {
      const i = l.indexOf(":");
      if (i > -1) hdrs[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    });
    if (cmd === "CONNECTED") {
      connecting = false;
      connected = true;
      leaveBtn.disabled = false;
      setStatus("Connected", "ok");
      startHB();
      stompSend(
        "/app/chat.addUser",
        JSON.stringify({ sender: me.username, type: "JOIN" }),
      );
      subConvUpdates();
      if (active) subActive();
      setComposerEnabled(!!active);
      toast("Connected", "ok", 2000);
      return;
    }
    if (cmd === "MESSAGE") {
      const dest = hdrs.destination || "";
      if (dest === `/topic/users/${me.publicId}/conversations`) {
        try {
          handleConvUpdate(JSON.parse(body));
        } catch {}
        return;
      }
      if (active && dest === `/topic/chat/${active.id}`) {
        try {
          const msg = JSON.parse(body);
          appendMessage(msg);
          scrollBottom();
        } catch {
          appendSystem(body);
        }
        return;
      }
    }
    if (cmd === "ERROR") {
      toast(hdrs.message || "Server error", "err");
      onDisconnect(false, "Server error.");
    }
  }
  async function handleConvUpdate(conv) {
    const isNew = upsertConversation(conv);
    renderConvList();
    if (isNew && (!active || active.id !== conv.id))
      toast(`New message from ${otherParticipant(conv).username}`, "ok");
  }
  function subActive() {
    if (!connected || !active || activeSub) return;
    activeSub = `sub-chat-${active.id}`;
    stompFrame("SUBSCRIBE", {
      id: activeSub,
      destination: `/topic/chat/${active.id}`,
    });
  }
  function unsubActive() {
    if (activeSub) {
      if (connected) stompFrame("UNSUBSCRIBE", { id: activeSub });
      activeSub = null;
    }
  }
  function subConvUpdates() {
    if (!connected || !me.publicId || convSub) return;
    convSub = `sub-convs-${me.publicId}`;
    stompFrame("SUBSCRIBE", {
      id: convSub,
      destination: `/topic/users/${me.publicId}/conversations`,
    });
  }
  function unsubConvUpdates() {
    if (convSub) {
      if (connected) stompFrame("UNSUBSCRIBE", { id: convSub });
      convSub = null;
    }
  }
  function onDisconnect(manual, msg) {
    if (disconnecting) return;
    disconnecting = true;
    stopHB();
    connecting = false;
    unsubActive();
    unsubConvUpdates();
    if (socket) {
      if (manual) {
        manualClose = true;
        if (socket.readyState === WebSocket.OPEN)
          try {
            stompFrame("DISCONNECT", { receipt: "bye" });
          } catch {}
      }
      try {
        socket.close();
      } catch {}
      socket = null;
    }
    connected = false;
    leaveBtn.disabled = true;
    setComposerEnabled(false);
    setStatus("Disconnected", "");
    if (manual) {
      clearSession();
      me = { username: "", publicId: "", avatarColor: null };
      conversations = [];
      active = activeSub = convSub = null;
      clearMessages();
      syncEmptyState();
      chatTitle.textContent = "Select a conversation";
      chatSubtitle.textContent =
        "Search a public ID or choose from the sidebar";
      chatAvatarIni.textContent = "?";
      chatAvatar.style.background = "";
      showAuth();
    } else {
      if (msg) {
        appendSystem(msg);
        toast(msg, "warn");
      }
    }
    syncChatPaneVisibility();
    manualClose = false;
    disconnecting = false;
  }
  leaveBtn.addEventListener("click", async () => {
    // Revoke the token server-side before tearing down the local session.
    // This prevents a stolen token from being reused after logout.
    try {
      await authFetch(`${API}/api/auth/logout`, { method: "POST" });
    } catch {
      /* ignore */
    }
    onDisconnect(true, "");
  });
  function stompFrame(cmd, hdrs = {}) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const lines = [cmd];
    Object.entries(hdrs).forEach(([k, v]) => lines.push(`${k}:${String(v)}`));
    socket.send(lines.join("\n") + "\n\n\u0000");
  }
  function stompSend(dest, body) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(
      `SEND\ndestination:${dest}\ncontent-type:application/json\ncontent-length:${new TextEncoder().encode(body).length}\n\n${body}\u0000`,
    );
  }
  function parseFrames(chunk) {
    stompBuffer += chunk;
    const out = [];
    let i;
    while ((i = stompBuffer.indexOf("\u0000")) !== -1) {
      out.push(stompBuffer.slice(0, i));
      stompBuffer = stompBuffer.slice(i + 1);
    }
    return out;
  }
  function startHB() {
    stopHB();
    heartbeat = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) socket.send("\n");
    }, 10000);
  }
  function stopHB() {
    clearInterval(heartbeat);
    heartbeat = null;
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!profileModal.hidden) {
        closeProfileModal();
        return;
      }
      if (document.activeElement === searchInput) searchInput.blur();
    }
    if (
      e.key === "/" &&
      !appShell.hidden &&
      document.activeElement !== textarea &&
      document.activeElement !== searchInput
    ) {
      e.preventDefault();
      searchInput.focus();
    }
  });
  window.addEventListener("resize", syncChatPaneVisibility);

  (function init() {
    const source = sessionStorage.getItem("aura.token")
      ? sessionStorage
      : localStorage;
    applyTheme(localStorage.getItem("aura.theme") || "aura");
    pendingInitialColor =
      localStorage.getItem("aura.initialColor") || "#F8FAFC";
    const token = source.getItem("aura.token"),
      username = source.getItem("aura.username"),
      publicId = source.getItem("aura.publicId"),
      avatarColor = source.getItem("aura.avatarColor") || null;
    if (token) saveSession(token, username, publicId, avatarColor);
    if (token && username) {
      applyMe(username, publicId, avatarColor);
      showApp();
      loadConversations().then(connect);
    } else {
      showAuth();
    }
    syncChatPaneVisibility();
    syncEmptyState();
  })();
})();

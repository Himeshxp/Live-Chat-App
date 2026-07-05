(function () {
  const backendOrigin = "http://localhost:8080";
  const API_BASE = backendOrigin;
  const WS_URL = `${backendOrigin.replace(/^http/, "ws")}/ws/websocket`;

  const authOverlay = document.getElementById("authOverlay");
  const authForm = document.getElementById("authForm");
  const authTabs = Array.from(document.querySelectorAll(".auth-tab"));
  const usernameInput = document.getElementById("usernameInput");
  const emailInput = document.getElementById("emailInput");
  const passwordInput = document.getElementById("passwordInput");
  const authStatus = document.getElementById("authStatus");
  const authSubmitBtn = document.getElementById("authSubmitBtn");

  const profileName = document.getElementById("profileName");
  const profilePublicId = document.getElementById("profilePublicId");
  const userSearchForm = document.getElementById("userSearchForm");
  const publicIdSearchInput = document.getElementById("publicIdSearchInput");
  const userSearchStatus = document.getElementById("userSearchStatus");
  const conversationList = document.getElementById("conversationList");
  const chatTitle = document.getElementById("chatTitle");
  const chatSubtitle = document.getElementById("chatSubtitle");

  const messageInput = document.getElementById("messageInput");
  const sendBtn = document.getElementById("sendBtn");
  const leaveBtn = document.getElementById("leaveBtn");
  const composerForm = document.getElementById("composerForm");
  const messages = document.getElementById("messages");
  const statusBadge = document.getElementById("statusBadge");

  let socket = null;
  let connected = false;
  let currentUser = "";
  let currentUserPublicId = "";
  let conversations = [];
  let activeConversation = null;
  let activeSubscriptionId = null;
  let userConversationSubscriptionId = null;
  let buffer = "";
  let heartbeatTimer = null;
  let manualClose = false;
  let connecting = false;
  let disconnecting = false;
  let authMode = "login";

  function setStatus(text, tone) {
    statusBadge.textContent = text;
    statusBadge.style.background =
      tone === "ok" ? "rgba(34, 197, 94, 0.14)" :
      tone === "warn" ? "rgba(245, 158, 11, 0.14)" :
      tone === "error" ? "rgba(239, 68, 68, 0.14)" : "rgba(20, 184, 166, 0.14)";
    statusBadge.style.borderColor =
      tone === "ok" ? "rgba(34, 197, 94, 0.4)" :
      tone === "warn" ? "rgba(245, 158, 11, 0.4)" :
      tone === "error" ? "rgba(239, 68, 68, 0.4)" : "rgba(20, 184, 166, 0.4)";
    statusBadge.style.color =
      tone === "ok" ? "#dcfce7" :
      tone === "warn" ? "#fde68a" :
      tone === "error" ? "#fecaca" : "#ccfbf1";
  }

  function setAuthStatus(text, tone = "muted") {
    authStatus.textContent = text;
    authStatus.style.color = tone === "error" ? "#fecaca" : tone === "ok" ? "#dcfce7" : "#91a0b1";
  }

  function setSearchStatus(text, tone = "muted") {
    userSearchStatus.textContent = text;
    userSearchStatus.style.color = tone === "error" ? "#fecaca" : tone === "ok" ? "#dcfce7" : "#91a0b1";
  }

  function setAuthMode(mode) {
    authMode = mode;
    authTabs.forEach((button) => button.classList.toggle("is-active", button.dataset.mode === mode));
    const registerMode = mode === "register";
    usernameInput.hidden = !registerMode;
    usernameInput.required = registerMode;
    usernameInput.disabled = !registerMode;
    usernameInput.setAttribute("aria-hidden", String(!registerMode));
    passwordInput.autocomplete = registerMode ? "new-password" : "current-password";
    authSubmitBtn.textContent = registerMode ? "Register" : "Login";
    setAuthStatus(registerMode ? "Create an account to message people." : "Use your account to continue.");
  }

  function showAuthOverlay() {
    authOverlay.hidden = false;
    document.body.classList.add("is-locked");
    connecting = false;
    (authMode === "register" ? usernameInput : emailInput).focus();
  }

  function hideAuthOverlay() {
    authOverlay.hidden = true;
    document.body.classList.remove("is-locked");
  }

  function setCurrentUser(username, publicId) {
    currentUser = username;
    currentUserPublicId = publicId || "";
    localStorage.setItem("livechat.username", username);
    localStorage.setItem("livechat.publicId", currentUserPublicId);
    profileName.textContent = username;
    profilePublicId.textContent = currentUserPublicId || "--------";
  }

  function formatTimestamp(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function getSenderName(sender) {
    if (!sender) return "System";
    if (typeof sender === "string") return sender;
    return sender.username || sender.name || "System";
  }

  function getOtherParticipant(conversation) {
    const firstIsMe = conversation.participant1PublicId === currentUserPublicId;
    return {
      username: firstIsMe ? conversation.participant2Username : conversation.participant1Username,
      publicId: firstIsMe ? conversation.participant2PublicId : conversation.participant1PublicId
    };
  }

  function appendMessage(message, mine = false) {
    const senderName = getSenderName(message.sender);
    const type = message.type || "SYSTEM";
    const node = document.createElement("article");
    node.className = `msg ${mine ? "me" : ""} ${type === "SYSTEM" ? "system" : ""}`;

    const senderEl = document.createElement("div");
    senderEl.className = "sender";
    senderEl.textContent = senderName;

    const textEl = document.createElement("div");
    textEl.className = "text";
    textEl.textContent = message.content || "";

    node.appendChild(senderEl);
    node.appendChild(textEl);

    const timeEl = document.createElement("div");
    timeEl.className = "timestamp";
    timeEl.textContent = formatTimestamp(message.timestamp);
    if (timeEl.textContent) node.appendChild(timeEl);

    messages.appendChild(node);
    messages.scrollTop = messages.scrollHeight;
  }

  function renderConversations() {
    conversationList.innerHTML = "";
    if (conversations.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No conversations yet.";
      conversationList.appendChild(empty);
      return;
    }

    conversations.forEach((conversation) => {
      const other = getOtherParticipant(conversation);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "conversation-item";
      button.classList.toggle("is-active", activeConversation && activeConversation.id === conversation.id);
      button.innerHTML = `<strong></strong><span></span>`;
      button.querySelector("strong").textContent = other.username;
      button.querySelector("span").textContent = other.publicId;
      button.addEventListener("click", () => selectConversation(conversation));
      conversationList.appendChild(button);
    });
  }

  function upsertConversation(conversation) {
    const existingIndex = conversations.findIndex((item) => item.id === conversation.id);
    if (existingIndex >= 0) {
      conversations[existingIndex] = conversation;
      return false;
    }
    conversations.unshift(conversation);
    return true;
  }

  function escapeHeader(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/:/g, "\\c");
  }

  function buildFrame(command, headers = {}, body = "") {
    const headerLines = Object.entries(headers).map(([key, value]) => `${key}:${escapeHeader(value)}`);
    return `${command}\n${headerLines.join("\n")}\n\n${body}\u0000`;
  }

  function sendFrame(command, headers = {}, body = "") {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(buildFrame(command, headers, body));
  }

  function parseFrames(chunk) {
    buffer += chunk;
    const frames = [];
    while (true) {
      const index = buffer.indexOf("\u0000");
      if (index === -1) break;
      frames.push(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
    }
    return frames;
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) socket.send("\n");
    }, 10000);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  async function authenticate(mode) {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const username = usernameInput.value.trim();

    if (mode === "register" && !username) {
      setAuthStatus("Username is required for registration.", "error");
      return;
    }
    if (!email || !password) {
      setAuthStatus("Email and password are required.", "error");
      return;
    }

    setAuthStatus(mode === "register" ? "Creating account..." : "Logging in...", "ok");

    try {
      if (mode === "login") {
        const params = new URLSearchParams({ email, password });
        const response = await fetch(`${API_BASE}/api/auth/login?${params.toString()}`, { method: "POST" });
        const result = await response.json();
        if (!response.ok || result.message !== "Login Successful") {
          throw new Error(result.message || "Login failed.");
        }
        setCurrentUser(result.username || email, result.publicId);
      } else {
        const response = await fetch(`${API_BASE}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password })
        });
        if (!response.ok) throw new Error("Register failed.");
        const user = await response.json();
        if (!user || !user.username) throw new Error("Register failed.");
        setCurrentUser(user.username, user.publicId);
      }

      hideAuthOverlay();
      messages.innerHTML = "";
      appendMessage({ sender: "System", content: "Choose a conversation to start messaging.", type: "SYSTEM" });
      await loadConversations();
      connect();
    } catch (error) {
      setAuthStatus(error.message || "Could not reach backend.", "error");
    }
  }

  async function loadConversations() {
    const params = new URLSearchParams({ currentUser });
    const response = await fetch(`${API_BASE}/api/conversations?${params.toString()}`);
    if (!response.ok) throw new Error("Could not load conversations.");
    conversations = await response.json();
    renderConversations();
  }

  async function searchAndOpenConversation(publicId) {
    const normalized = publicId.trim().toUpperCase();
    if (!normalized) return;
    if (normalized === currentUserPublicId) {
      setSearchStatus("That is your own public ID.", "error");
      return;
    }

    setSearchStatus("Searching...", "ok");
    const userResponse = await fetch(`${API_BASE}/api/users/public/${encodeURIComponent(normalized)}`);
    if (!userResponse.ok) {
      setSearchStatus("No user found with that public ID.", "error");
      return;
    }

    const createResponse = await fetch(`${API_BASE}/api/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentUser, otherPublicId: normalized })
    });
    if (!createResponse.ok) {
      setSearchStatus("Could not open conversation.", "error");
      return;
    }

    const conversation = await createResponse.json();
    upsertConversation(conversation);
    publicIdSearchInput.value = "";
    setSearchStatus("Conversation opened.", "ok");
    renderConversations();
    await selectConversation(conversation);
  }

  async function loadMessages(conversationId) {
    const response = await fetch(`${API_BASE}/api/chat/conversations/${conversationId}/messages`);
    if (!response.ok) throw new Error(`Could not load messages (${response.status})`);
    const history = await response.json();
    messages.innerHTML = "";
    if (!Array.isArray(history) || history.length === 0) return;
    history.forEach((message) => {
      appendMessage(message, message.senderPublicId === currentUserPublicId || getSenderName(message.sender) === currentUser);
    });
  }

  async function selectConversation(conversation) {
    activeConversation = conversation;
    const other = getOtherParticipant(conversation);
    chatTitle.textContent = other.username;
    chatSubtitle.textContent = other.publicId;
    renderConversations();
    setComposerEnabled(false);

    unsubscribeFromActiveConversation();
    try {
      await loadMessages(conversation.id);
      subscribeToActiveConversation();
      setComposerEnabled(connected);
    } catch (error) {
      console.error(error);
      messages.innerHTML = "";
      appendMessage({ sender: "System", content: "Could not load this conversation.", type: "SYSTEM" });
    }
  }

  function connect() {
    if (!currentUser || connecting || connected) return;
    connecting = true;
    setStatus("Connecting...", "warn");

    try {
      socket = new WebSocket(WS_URL);
    } catch (error) {
      connecting = false;
      setStatus("Disconnected", "warn");
      return;
    }

    socket.onopen = () => {
      sendFrame("CONNECT", { "accept-version": "1.2", host: new URL(API_BASE).host });
    };
    socket.onmessage = (event) => parseFrames(event.data).forEach(handleFrame);
    socket.onerror = () => disconnect(false, "Connection failed.");
    socket.onclose = () => disconnect(false, "Connection lost.");
  }

  function handleFrame(rawFrame) {
    const lines = rawFrame.split("\n");
    const command = lines[0];
    const blankIndex = lines.indexOf("");
    const headers = {};
    const headerLines = blankIndex === -1 ? lines.slice(1) : lines.slice(1, blankIndex);
    headerLines.forEach((line) => {
      const separator = line.indexOf(":");
      if (separator > -1) headers[line.slice(0, separator)] = line.slice(separator + 1);
    });
    const body = blankIndex === -1 ? "" : lines.slice(blankIndex + 1).join("\n");

    if (command === "CONNECTED") {
      connecting = false;
      setConnected(true);
      setStatus(`Connected as ${currentUser}`, "ok");
      startHeartbeat();
      sendFrame("SEND", {
        destination: "/app/chat.addUser",
        "content-type": "application/json"
      }, JSON.stringify({ sender: currentUser, type: "JOIN" }));
      subscribeToUserConversationUpdates();
      subscribeToActiveConversation();
      return;
    }

    if (command === "MESSAGE" && headers.destination === `/topic/users/${currentUserPublicId}/conversations`) {
      try {
        handleConversationNotification(JSON.parse(body));
      } catch (error) {
        console.error("Invalid conversation notification:", error);
      }
      return;
    }

    if (command === "MESSAGE" && activeConversation && headers.destination === `/topic/chat/${activeConversation.id}`) {
      try {
        const message = JSON.parse(body);
        appendMessage(message, message.senderPublicId === currentUserPublicId || getSenderName(message.sender) === currentUser);
      } catch (error) {
        appendMessage({ sender: "System", content: body, type: "SYSTEM" });
      }
      return;
    }

    if (command === "ERROR") disconnect(false, "Internet disconnected.");
  }

  function subscribeToActiveConversation() {
    if (!connected || !activeConversation || activeSubscriptionId) return;
    activeSubscriptionId = `chat-${activeConversation.id}`;
    sendFrame("SUBSCRIBE", {
      id: activeSubscriptionId,
      destination: `/topic/chat/${activeConversation.id}`
    });
  }

  function subscribeToUserConversationUpdates() {
    if (!connected || !currentUserPublicId || userConversationSubscriptionId) return;
    userConversationSubscriptionId = `user-conversations-${currentUserPublicId}`;
    sendFrame("SUBSCRIBE", {
      id: userConversationSubscriptionId,
      destination: `/topic/users/${currentUserPublicId}/conversations`
    });
  }

  function unsubscribeFromUserConversationUpdates() {
    if (!connected || !userConversationSubscriptionId) {
      userConversationSubscriptionId = null;
      return;
    }
    sendFrame("UNSUBSCRIBE", { id: userConversationSubscriptionId });
    userConversationSubscriptionId = null;
  }

  async function handleConversationNotification(conversation) {
    const isNewConversation = upsertConversation(conversation);
    renderConversations();

    if (activeConversation && activeConversation.id === conversation.id) {
      return;
    }

    if (isNewConversation || !activeConversation) {
      await selectConversation(conversation);
    }
  }

  function unsubscribeFromActiveConversation() {
    if (!connected || !activeSubscriptionId) {
      activeSubscriptionId = null;
      return;
    }
    sendFrame("UNSUBSCRIBE", { id: activeSubscriptionId });
    activeSubscriptionId = null;
  }

  function setConnected(state) {
    connected = state;
    leaveBtn.disabled = !state;
    setComposerEnabled(state && !!activeConversation);
  }

  function setComposerEnabled(state) {
    sendBtn.disabled = !state;
    messageInput.disabled = !state;
  }

  function sendMessage() {
    const content = messageInput.value.trim();
    if (!connected || !content || !activeConversation) return;

    sendFrame("SEND", {
      destination: "/app/chat.sendMessage",
      "content-type": "application/json"
    }, JSON.stringify({
      sender: currentUser,
      content,
      type: "CHAT",
      conversationId: activeConversation.id
    }));

    messageInput.value = "";
    messageInput.focus();
  }

  function disconnect(sendFrameOnClose = true, statusMessage = "") {
    if (disconnecting) return;
    disconnecting = true;
    stopHeartbeat();
    connecting = false;
    unsubscribeFromActiveConversation();
    unsubscribeFromUserConversationUpdates();

    if (socket) {
      if (sendFrameOnClose) manualClose = true;
      if (sendFrameOnClose && socket.readyState === WebSocket.OPEN) {
        try {
          sendFrame("DISCONNECT", { receipt: "disconnect" });
        } catch (error) {
          // ignore
        }
      }
      try {
        socket.close();
      } catch (error) {
        // ignore
      }
      socket = null;
    }

    if (!manualClose && statusMessage) {
      appendMessage({ sender: "System", content: statusMessage, type: "SYSTEM" });
    }

    manualClose = false;
    setConnected(false);
    setStatus("Disconnected", "warn");
    disconnecting = false;
  }

  authTabs.forEach((button) => button.addEventListener("click", () => setAuthMode(button.dataset.mode)));
  authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (connecting || connected) return;
    authenticate(authMode);
  });
  userSearchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    searchAndOpenConversation(publicIdSearchInput.value).catch((error) => {
      console.error(error);
      setSearchStatus("Could not open conversation.", "error");
    });
  });
  composerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage();
  });
  leaveBtn.addEventListener("click", () => disconnect(true));

  setAuthMode("login");
  setStatus("Disconnected", "warn");
  setComposerEnabled(false);
  showAuthOverlay();
})();

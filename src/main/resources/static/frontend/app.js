(function () {
  const backendOrigin =
    location.port === "8080" || location.protocol === "file:"
      ? "http://localhost:8080"
      : "http://localhost:8080";
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

  const messageInput = document.getElementById("messageInput");
  const sendBtn = document.getElementById("sendBtn");
  const leaveBtn = document.getElementById("leaveBtn");
  const composerForm = document.getElementById("composerForm");
  const messages = document.getElementById("messages");
  const statusBadge = document.getElementById("statusBadge");

  let socket = null;
  let connected = false;
  let currentUser = "";
  let buffer = "";
  let heartbeatTimer = null;
  let manualClose = false;
  let connecting = false;
  let disconnecting = false;
  let authMode = "login";

  function getKnownUserName(email) {
    try {
      const raw = localStorage.getItem("livechat.usersByEmail");
      const map = raw ? JSON.parse(raw) : {};
      return map[email] || "";
    } catch (error) {
      return "";
    }
  }

  function rememberUserName(email, username) {
    try {
      const raw = localStorage.getItem("livechat.usersByEmail");
      const map = raw ? JSON.parse(raw) : {};
      map[email] = username;
      localStorage.setItem("livechat.usersByEmail", JSON.stringify(map));
    } catch (error) {
      // ignore
    }
  }

  function setStatus(text, tone) {
    statusBadge.textContent = text;
    statusBadge.style.background =
      tone === "ok"
        ? "rgba(34, 197, 94, 0.14)"
        : tone === "warn"
          ? "rgba(245, 158, 11, 0.14)"
          : tone === "error"
            ? "rgba(239, 68, 68, 0.14)"
            : "rgba(20, 184, 166, 0.14)";
    statusBadge.style.borderColor =
      tone === "ok"
        ? "rgba(34, 197, 94, 0.4)"
        : tone === "warn"
          ? "rgba(245, 158, 11, 0.4)"
          : tone === "error"
            ? "rgba(239, 68, 68, 0.4)"
            : "rgba(20, 184, 166, 0.4)";
    statusBadge.style.color =
      tone === "ok"
        ? "#dcfce7"
        : tone === "warn"
          ? "#fde68a"
          : tone === "error"
            ? "#fecaca"
            : "#ccfbf1";
  }

  function setAuthStatus(text, tone = "muted") {
    authStatus.textContent = text;
    authStatus.style.color =
      tone === "error"
        ? "#fecaca"
        : tone === "ok"
          ? "#dcfce7"
          : "#91a0b1";
  }

  function setAuthMode(mode) {
    authMode = mode;
    authTabs.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mode === mode);
    });

    const registerMode = mode === "register";
    usernameInput.hidden = !registerMode;
    usernameInput.required = registerMode;
    usernameInput.disabled = !registerMode;
    usernameInput.setAttribute("aria-hidden", String(!registerMode));
    passwordInput.autocomplete = registerMode ? "new-password" : "current-password";
    authSubmitBtn.textContent = registerMode ? "Register" : "Login";
    setAuthStatus(registerMode ? "Create an account to join the chat." : "Use your account to continue.");
  }

  function showAuthOverlay() {
    authOverlay.hidden = false;
    document.body.classList.add("is-locked");
    connecting = false;
    if (authMode === "register") {
      usernameInput.focus();
    } else {
      emailInput.focus();
    }
  }

  function hideAuthOverlay() {
    authOverlay.hidden = true;
    document.body.classList.remove("is-locked");
  }

  function setCurrentUser(username) {
    currentUser = username;
    localStorage.setItem("livechat.username", username);
  }

  function formatTimestamp(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function getSenderName(sender) {
    if (!sender) return "System";
    if (typeof sender === "string") return sender;
    return sender.username || sender.name || "System";
  }

  function appendMessage(message, mine = false) {
    const senderName = getSenderName(message.sender);
    const type = message.type || "SYSTEM";
    const node = document.createElement("article");
    node.className = `msg ${mine ? "me" : ""} ${type === "JOIN" || type === "LEAVE" ? "system" : ""}`;

    const senderEl = document.createElement("div");
    senderEl.className = "sender";
    senderEl.textContent = senderName;

    const textEl = document.createElement("div");
    textEl.className = "text";
    textEl.textContent =
      message.content ||
      (type === "JOIN"
        ? `${senderName} joined the chat`
        : type === "LEAVE"
          ? `${senderName} left the chat`
          : "");

    node.appendChild(senderEl);
    node.appendChild(textEl);

    const timeEl = document.createElement("div");
    timeEl.className = "timestamp";
    timeEl.textContent = formatTimestamp(message.timestamp);
    if (timeEl.textContent) {
      node.appendChild(timeEl);
    }

    messages.appendChild(node);
    messages.scrollTop = messages.scrollHeight;
  }

  function escapeHeader(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/:/g, "\\c");
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
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send("\n");
      }
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
        const response = await fetch(`${API_BASE}/api/auth/login?${params.toString()}`, {
          method: "POST"
        });
        const result = (await response.text()).trim();

        if (result !== "Login Successful") {
          throw new Error(result || "Login failed.");
        }

        setCurrentUser(getKnownUserName(email) || email);
        setAuthStatus("Login Successful", "ok");
      } else {
        const response = await fetch(`${API_BASE}/api/auth/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            username,
            email,
            password
          })
        });

        if (!response.ok) {
          throw new Error("Register failed.");
        }

        const user = await response.json();
        if (!user || !user.username) {
          throw new Error("Register failed.");
        }

        setCurrentUser(user.username);
        rememberUserName(email, user.username);
        setAuthStatus("Registered successfully", "ok");
      }

      hideAuthOverlay();
      connect();
    } catch (error) {
      setAuthStatus(error.message || "Could not reach backend.", "error");
    }
  }

  function connect() {
    if (!currentUser) {
      setAuthStatus("Please log in first.", "error");
      showAuthOverlay();
      return;
    }

    connecting = true;
    setStatus("Connecting...", "warn");

    try {
      socket = new WebSocket(WS_URL);
    } catch (error) {
      appendMessage({
        sender: "System",
        content: "Connection failed.",
        type: "SYSTEM"
      });
      connecting = false;
      setStatus("Disconnected", "warn");
      showAuthOverlay();
      return;
    }

    socket.onopen = () => {
      sendFrame("CONNECT", {
        "accept-version": "1.2",
        "host": new URL(API_BASE).host
      });
    };

    socket.onmessage = (event) => {
      parseFrames(event.data).forEach(handleFrame);
    };

    socket.onerror = () => {
      disconnect(false, "Connection failed.");
    };

    socket.onclose = () => {
      disconnect(false, "Connection lost.");
    };
  }

  function handleFrame(rawFrame) {
    const lines = rawFrame.split("\n");
    const command = lines[0];
    const blankIndex = lines.indexOf("");
    const headers = {};

    const headerLines = blankIndex === -1 ? lines.slice(1) : lines.slice(1, blankIndex);
    headerLines.forEach((line) => {
      const separator = line.indexOf(":");
      if (separator > -1) {
        headers[line.slice(0, separator)] = line.slice(separator + 1);
      }
    });

    const body = blankIndex === -1 ? "" : lines.slice(blankIndex + 1).join("\n");

    if (command === "CONNECTED") {
      setConnected(true);
      setStatus(`Connected as ${currentUser}`, "ok");
      startHeartbeat();

      sendFrame("SUBSCRIBE", {
        id: "sub-0",
        destination: "/topic/public"
      });

      sendFrame(
        "SEND",
        {
          destination: "/app/chat.addUser",
          "content-type": "application/json"
        },
        JSON.stringify({
          sender: currentUser,
          type: "JOIN"
        })
      );
      return;
    }

    if (command === "MESSAGE" && headers.destination === "/topic/public") {
      let message = null;
      try {
        message = JSON.parse(body);
      } catch (error) {
        appendMessage({
          sender: "System",
          content: body,
          type: "SYSTEM"
        });
        return;
      }

      const mine = getSenderName(message.sender) === currentUser;
      appendMessage(message, mine);
      return;
    }

    if (command === "ERROR") {
      disconnect(false, "Internet disconnected.");
    }
  }

  function setConnected(state) {
    connected = state;
    sendBtn.disabled = !state;
    leaveBtn.disabled = !state;
    messageInput.disabled = !state;
  }

  function sendMessage() {
    const content = messageInput.value.trim();
    if (!connected || !content) return;

    sendFrame(
      "SEND",
      {
        destination: "/app/chat.sendMessage",
        "content-type": "application/json"
      },
      JSON.stringify({
        sender: currentUser,
        content,
        type: "CHAT"
      })
    );

    messageInput.value = "";
    messageInput.focus();
  }

  function disconnect(sendFrameOnClose = true, statusMessage = "") {
    if (disconnecting) return;
    disconnecting = true;
    stopHeartbeat();
    connecting = false;

    if (socket) {
      if (sendFrameOnClose) {
        manualClose = true;
      }

      if (sendFrameOnClose && socket.readyState === WebSocket.OPEN) {
        try {
          sendFrame("DISCONNECT", {
            receipt: "disconnect"
          });
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
      appendMessage({
        sender: "System",
        content: statusMessage,
        type: "SYSTEM"
      });
    }

    manualClose = false;
    setConnected(false);
    setStatus("Disconnected", "warn");
    disconnecting = false;
  }

  authTabs.forEach((button) => {
    button.addEventListener("click", () => setAuthMode(button.dataset.mode));
  });

  authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (connecting || connected) return;
    authenticate(authMode);
  });

  composerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage();
  });

  leaveBtn.addEventListener("click", () => disconnect(true));

  setAuthMode("login");
  setStatus("Disconnected", "warn");
  showAuthOverlay();
  appendMessage({
    sender: "System",
    content: "Log in or register to join the chat.",
    type: "SYSTEM"
  });
})();

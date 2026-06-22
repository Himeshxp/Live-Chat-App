(function () {
  const BACKEND_WS_URL = "ws://localhost:8080/ws/websocket";
  const joinOverlay = document.getElementById("joinOverlay");
  const joinForm = document.getElementById("joinForm");
  const joinNameInput = document.getElementById("joinNameInput");
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

  function setStatus(text, tone) {
    statusBadge.textContent = text;
    statusBadge.style.background =
      tone === "ok"
        ? "rgba(34, 197, 94, 0.14)"
        : tone === "warn"
          ? "rgba(245, 158, 11, 0.14)"
          : "rgba(20, 184, 166, 0.14)";
    statusBadge.style.borderColor =
      tone === "ok"
        ? "rgba(34, 197, 94, 0.4)"
        : tone === "warn"
          ? "rgba(245, 158, 11, 0.4)"
          : "rgba(20, 184, 166, 0.4)";
    statusBadge.style.color =
      tone === "ok"
        ? "#dcfce7"
        : tone === "warn"
          ? "#fde68a"
          : "#ccfbf1";
  }

  function setConnected(state) {
    connected = state;
    sendBtn.disabled = !state;
    leaveBtn.disabled = !state;
    messageInput.disabled = !state;
    setStatus(state ? `Connected as ${currentUser}` : "Disconnected", state ? "ok" : "warn");
  }

  function showJoinOverlay(prefill = "") {
    joinOverlay.hidden = false;
    document.body.classList.add("is-locked");
    joinNameInput.value = prefill;
    joinNameInput.focus();
    joinNameInput.select();
    connecting = false;
  }

  function hideJoinOverlay() {
    joinOverlay.hidden = true;
    document.body.classList.remove("is-locked");
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

  function appendMessage({ sender = "System", content = "", type = "SYSTEM", timestamp = "" }, mine = false) {
    const node = document.createElement("article");
    node.className = `msg ${mine ? "me" : ""} ${type === "JOIN" || type === "LEAVE" ? "system" : ""}`;

    const senderEl = document.createElement("div");
    senderEl.className = "sender";
    senderEl.textContent = sender;

    const textEl = document.createElement("div");
    textEl.className = "text";
    textEl.textContent = content || (type === "JOIN" ? `${sender} joined the chat` : type === "LEAVE" ? `${sender} left the chat` : "");

    node.appendChild(senderEl);
    node.appendChild(textEl);

    const timeEl = document.createElement("div");
    timeEl.className = "timestamp";
    timeEl.textContent = formatTimestamp(timestamp);
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
      hideJoinOverlay();
      setStatus(`Connected as ${currentUser}`, "ok");
      startHeartbeat();

      sendFrame("SUBSCRIBE", {
        id: "sub-0",
        destination: "/topic/public"
      });

      sendFrame("SEND", {
        destination: "/app/chat.addUser",
        "content-type": "application/json"
      }, JSON.stringify({
        sender: currentUser,
        type: "JOIN"
      }));
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
        }, false);
        return;
      }

      const mine = message.sender === currentUser;
      appendMessage(message, mine);
      return;
    }

    if (command === "ERROR") {
      disconnect(false, "Internet disconnected.");
    }
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

  function connect() {
    const username = joinNameInput.value.trim();
    if (!username) {
      alert("Please enter a username.");
      return;
    }

    currentUser = username;
    connecting = true;
    setStatus("Connecting...", "warn");
    hideJoinOverlay();

    try {
      socket = new WebSocket(BACKEND_WS_URL);
    } catch (error) {
      appendMessage({
        sender: "System",
        content: "Internet disconnected.",
        type: "SYSTEM"
      });
      connecting = false;
      setStatus("Disconnected", "warn");
      return;
    }

    socket.onopen = () => {
      sendFrame("CONNECT", {
        "accept-version": "1.2",
        "host": "localhost:8080"
      });
    };

    socket.onmessage = (event) => {
      parseFrames(event.data).forEach(handleFrame);
    };

    socket.onerror = () => {
      disconnect(false, "Internet disconnected.");
    };

    socket.onclose = () => {
      disconnect(false, "Internet disconnected.");
    };
  }

  function sendMessage() {
    const content = messageInput.value.trim();
    if (!connected || !content) return;

    sendFrame("SEND", {
      destination: "/app/chat.sendMessage",
      "content-type": "application/json"
    }, JSON.stringify({
      sender: currentUser,
      content,
      type: "CHAT"
    }));

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
    disconnecting = false;
  }

  joinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (connecting || connected) return;
    connect();
  });

  composerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage();
  });

  leaveBtn.addEventListener("click", () => disconnect(true));

  setStatus("Disconnected", "warn");
  showJoinOverlay();
  appendMessage({
    sender: "System",
    content: "Enter a username to join the chat.",
    type: "SYSTEM"
  });
})();

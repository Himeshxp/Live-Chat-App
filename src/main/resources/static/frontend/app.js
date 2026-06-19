(function () {
  const BACKEND_WS_URL = "ws://localhost:8080/ws/websocket";
  const usernameInput = document.getElementById("usernameInput");
  const messageInput = document.getElementById("messageInput");
  const connectBtn = document.getElementById("connectBtn");
  const sendBtn = document.getElementById("sendBtn");
  const leaveBtn = document.getElementById("leaveBtn");
  const messages = document.getElementById("messages");
  const statusBadge = document.getElementById("statusBadge");

  let socket = null;
  let connected = false;
  let currentUser = "";
  let buffer = "";
  let heartbeatTimer = null;
  let manualClose = false;

  function setStatus(text, tone) {
    statusBadge.textContent = text;
    statusBadge.style.background =
      tone === "ok"
        ? "rgba(22, 163, 74, 0.15)"
        : tone === "warn"
          ? "rgba(245, 158, 11, 0.15)"
          : "rgba(37, 99, 235, 0.15)";
    statusBadge.style.borderColor =
      tone === "ok"
        ? "rgba(22, 163, 74, 0.45)"
        : tone === "warn"
          ? "rgba(245, 158, 11, 0.45)"
          : "rgba(37, 99, 235, 0.45)";
    statusBadge.style.color =
      tone === "ok"
        ? "#bbf7d0"
        : tone === "warn"
          ? "#fde68a"
          : "#bfdbfe";
  }

  function setConnected(state) {
    connected = state;
    connectBtn.disabled = state;
    sendBtn.disabled = !state;
    leaveBtn.disabled = !state;
    messageInput.disabled = !state;
    usernameInput.disabled = state;
    setStatus(state ? `Connected as ${currentUser}` : "Disconnected", state ? "ok" : "warn");
  }

  function appendMessage({ sender = "System", content = "", type = "SYSTEM" }, mine = false) {
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
      appendMessage({
        sender: "System",
        content: "Connection error from backend.",
        type: "SYSTEM"
      });
      disconnect(false);
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
    const username = usernameInput.value.trim();
    if (!username) {
      alert("Please enter a username.");
      return;
    }

    currentUser = username;
    setStatus("Connecting...", "warn");

    try {
      socket = new WebSocket(BACKEND_WS_URL);
    } catch (error) {
      appendMessage({
        sender: "System",
        content: "WebSocket could not be created.",
        type: "SYSTEM"
      });
      setConnected(false);
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
      appendMessage({
        sender: "System",
        content: "Unable to reach backend websocket.",
        type: "SYSTEM"
      });
      disconnect(false);
    };

    socket.onclose = () => {
      disconnect(false);
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

  function disconnect(sendFrameOnClose = true) {
    stopHeartbeat();

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

    if (connected && !manualClose) {
      appendMessage({
        sender: "System",
        content: "Disconnected from chat.",
        type: "SYSTEM"
      });
    }

    manualClose = false;
    setConnected(false);
  }

  connectBtn.addEventListener("click", connect);
  sendBtn.addEventListener("click", sendMessage);
  leaveBtn.addEventListener("click", () => disconnect(true));

  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      sendMessage();
    }
  });

  usernameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      connect();
    }
  });

  setStatus("Disconnected", "warn");
  appendMessage({
    sender: "System",
    content: "Enter a username and click Connect.",
    type: "SYSTEM"
  });
})();

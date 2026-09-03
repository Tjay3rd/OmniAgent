(function () {
	"use strict";

	const currentScript = document.currentScript;
	const tenantId = currentScript ? currentScript.getAttribute("data-tenant-id") : null;

	if (!tenantId) {
		console.error("[Widget] Missing data-tenant-id attribute on script tag.");
		return;
	}

	// ---- Configuration -------------------------------------------------
	// Default to the origin that served this script; allow an explicit override.
	const scriptOrigin = new URL(currentScript.src, window.location.href).origin;
	const API_BASE = currentScript.getAttribute("data-api-base") || scriptOrigin;
	const WS_URL = currentScript.getAttribute("data-ws-base") || API_BASE.replace(/^http/, "ws");

	// ---- Local state -----------------------------------------------------
	const state = {
		token: localStorage.getItem("widgetToken") || null,
		customerId: null,
		conversationId: localStorage.getItem("widgetConversationId") || null,
		socket: null,
		isOpen: false,
		hasLoadedHistory: false,
	};

	// ---- Tiny DOM helpers --------------------------------------------------
	function el(tag, attrs = {}, children = []) {
		const node = document.createElement(tag);
		for (const key in attrs) {
			if (key === "class") node.className = attrs[key];
			else if (key === "text") node.textContent = attrs[key];
			else node.setAttribute(key, attrs[key]);
		}
		children.forEach((child) => node.appendChild(child));
		return node;
	}

	// ---- Styles ------------------------------------------------------------
	const style = document.createElement("style");
	style.textContent = `
    #wgt-bubble{position:fixed;bottom:20px;right:20px;width:56px;height:56px;
      border-radius:50%;background:#111827;color:#fff;display:flex;
      align-items:center;justify-content:center;cursor:pointer;
      box-shadow:0 4px 14px rgba(0,0,0,0.25);z-index:999999;font-size:24px;}
    #wgt-panel{position:fixed;bottom:88px;right:20px;width:340px;height:460px;
      background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.2);
      display:none;flex-direction:column;overflow:hidden;font-family:sans-serif;
      z-index:999999;}
    #wgt-panel.open{display:flex;}
    #wgt-header{background:#111827;color:#fff;padding:12px 16px;font-size:14px;
      font-weight:600;}
    #wgt-messages{flex:1;overflow-y:auto;padding:12px;font-size:13px;
      background:#f9fafb;}
    .wgt-msg{margin-bottom:8px;max-width:80%;padding:8px 10px;border-radius:8px;
      line-height:1.4;word-wrap:break-word;}
    .wgt-msg.customer{background:#111827;color:#fff;margin-left:auto;}
    .wgt-msg.agent,.wgt-msg.ai,.wgt-msg.admin,.wgt-msg.owner{background:#e5e7eb;color:#111827;margin-right:auto;}
    #wgt-identify{padding:8px 12px;border-top:1px solid #eee;font-size:12px;
      display:flex;gap:6px;}
    #wgt-identify input{flex:1;font-size:12px;padding:6px;border:1px solid #ddd;
      border-radius:6px;}
    #wgt-inputRow{display:flex;border-top:1px solid #eee;padding:8px;gap:6px;}
    #wgt-input{flex:1;border:1px solid #ddd;border-radius:8px;padding:8px;
      font-size:13px;resize:none;}
    #wgt-send{background:#111827;color:#fff;border:none;border-radius:8px;
      padding:0 14px;cursor:pointer;font-size:13px;}
  `;
	document.head.appendChild(style);

	// ---- Build the DOM -----------------------------------------------------
	const bubble = el("div", { id: "wgt-bubble", text: "💬" });
	const header = el("div", { id: "wgt-header", text: "Chat with us" });
	const messagesEl = el("div", { id: "wgt-messages" });

	const identifyEmail = el("input", { type: "email", placeholder: "Your email" });
	const identifyName = el("input", { type: "text", placeholder: "Your name" });
	const identifySave = el("button", { id: "wgt-send", text: "Save" });
	const identifyRow = el("div", { id: "wgt-identify" }, [identifyName, identifyEmail, identifySave]);

	const input = el("textarea", { id: "wgt-input", rows: "1", placeholder: "Type a message..." });
	const sendBtn = el("button", { id: "wgt-send", text: "Send" });
	const inputRow = el("div", { id: "wgt-inputRow" }, [input, sendBtn]);

	const panel = el("div", { id: "wgt-panel" }, [header, messagesEl, identifyRow, inputRow]);

	document.body.appendChild(bubble);
	document.body.appendChild(panel);

	// ---- Rendering -----------------------------------------------------
	function renderMessage(msg) {
		const bubbleEl = el("div", {
			class: `wgt-msg ${msg.senderType}`,
			text: msg.text,
		});
		bubbleEl.dataset.messageId = msg._id;
		messagesEl.appendChild(bubbleEl);
		messagesEl.scrollTop = messagesEl.scrollHeight;
	}

	function renderMessages(list) {
		messagesEl.innerHTML = "";
		list.forEach(renderMessage);
	}

	// ---- API calls -----------------------------------------------------
	async function initCustomer() {
		const res = await fetch(`${API_BASE}/api/widget/customer/init`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ tenantId, visitorToken: state.token }),
		});
		const data = await res.json();
		state.token = data.token;
		state.customerId = data.customer._id;
		localStorage.setItem("widgetToken", state.token);
	}

	async function getOrCreateConversation() {
		const res = await fetch(`${API_BASE}/api/widget/conversation`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ visitorToken: state.token }),
		});
		const data = await res.json();
		state.conversationId = data.conversation._id;
		localStorage.setItem("widgetConversationId", state.conversationId);
	}

	let messagesHistory;
	async function loadHistory() {
		const url = `${API_BASE}/api/widget/chat/${state.conversationId}/messages`;
		const res = await fetch(url, { headers: { Authorization: `Bearer ${state.token}` } });
		const data = await res.json();
		messagesHistory = data.messages || [];
		renderMessages(messagesHistory);
		state.hasLoadedHistory = true;
	}

	async function submitIdentify() {
		const email = identifyEmail.value.trim();
		const name = identifyName.value.trim();
		if (!email && !name) return;

		await fetch(`${API_BASE}/api/widget/identify`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ visitorToken: state.token, email, name }),
		});

		identifyRow.style.display = "none";
	}

	// ---- Socket -----------------------------------------------------
	function connectSocket() {
		if (state.socket && state.socket.readyState === WebSocket.OPEN) return;

		const ws = new WebSocket(WS_URL);
		state.socket = ws;

		ws.onopen = () => {
			ws.send(
				JSON.stringify({
					event: "join_conversation",
					data: {
						conversationId: state.conversationId,
						visitorToken: state.token,
					},
				}),
			);
		};

		ws.onmessage = (event) => {
			let payload;
			try {
				payload = JSON.parse(event.data);
			} catch {
				return;
			}

			if (payload.error) {
				console.warn("[Widget]", payload.error);
				return;
			}

			if (payload.event === "new_message") {
				//prevent displaying same message bubble twice on message sent confirmation(tempId echo)
				const idx = messagesHistory.findIndex((m) => m._d === payload.data.tempId);
				if (idx !== -1) {
					messagesHistory[idx] = payload.data;
					const node = messagesEl.querySelector(`[data-message-id="${payload.data.tempId}"]`);
					if (node) {
						node.textContent = payload.data.text;
						node.dataset.messageId = payload.data._id;
					} else {
						renderMessage(payload.data);
					}
				} else {
					//Message is from AI or human agent
					messagesHistory.push(payload.data);
					renderMessage(payload.data);
				}
			}
		};

		ws.onclose = () => {
			// simple fixed-delay reconnect — good enough for a widget; doesn't need the dashboard's full backoff logic
			setTimeout(() => {
				if (state.isOpen) connectSocket();
			}, 3000);
		};
	}

	function sendMessage(text) {
		if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;

		const tempId = `temp-${Date.now()}`;
		const newMessage = {
			event: "send_message",
			data: {
				_id: tempId,
				tenantId,
				conversationId: state.conversationId,
				senderType: "customer",
				text,
			},
		};
		messagesHistory.push(newMessage.data);

		renderMessage(newMessage.data);

		state.socket.send(JSON.stringify(newMessage));
	}

	// ---- Event wiring -----------------------------------------------------
	bubble.addEventListener("click", () => {
		state.isOpen = !state.isOpen;
		panel.classList.toggle("open", state.isOpen);

		if (state.isOpen) {
			openChat();
		}
	});

	sendBtn.addEventListener("click", () => {
		const text = input.value.trim();
		if (!text) return;
		sendMessage(text);
		input.value = "";
	});

	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			sendBtn.click();
		}
	});

	identifySave.addEventListener("click", submitIdentify);

	// ---- Boot sequence on first open -----------------------------------------
	async function openChat() {
		try {
			if (!state.token) {
				await initCustomer();
			}
			if (!state.conversationId) {
				await getOrCreateConversation();
			}
			if (!state.hasLoadedHistory) {
				await loadHistory();
			}
			connectSocket();
		} catch (err) {
			console.error("[Widget] Failed to start chat:", err);
		}
	}

	// Silent ghost sign-up on page load, per the original plan —
	// establishes identity before the visitor ever clicks the icon.
	if (!state.token) {
		initCustomer();
	}
})();

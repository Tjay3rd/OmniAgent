"use client";

import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, X, Send, Bot, AlertCircle } from "lucide-react";

interface WidgetMessage {
	_id?: string;
	senderType: "customer" | "ai" | "agent" | "admin" | "owner";
	text: string;
}

type ConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 1000;

export default function ChatWidget({ tenantId }: { tenantId: string }) {
	const [isOpen, setIsOpen] = useState(false);
	const [messages, setMessages] = useState<WidgetMessage[]>([]);
	const [input, setInput] = useState("");
	const [conversationId, setConversationId] = useState<string | null>(null);
	const [streamingText, setStreamingText] = useState(""); // Holds incoming backend Vercel AI SDK text deltas
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");

	const wsRef = useRef<WebSocket | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const reconnectAttemptsRef = useRef(0);
	const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Tracks whether the effect has been torn down, so a pending reconnect timer doesn't fire after unmount
	const isActiveRef = useRef(true);

	useEffect(() => {
		if (!isOpen) return;

		isActiveRef.current = true;

		function connect() {
			setConnectionStatus(reconnectAttemptsRef.current === 0 ? "connecting" : "reconnecting");

			const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:5000"}?tenantId=${tenantId}`;
			const ws = new WebSocket(wsUrl);
			wsRef.current = ws;

			ws.onopen = () => {
				//prevent persisting a socket connection if the user navigates away(unmounts component) before the connection is open.
				if (!isActiveRef.current) return ws.close(1000, "Component unmounted before the socket opened");

				reconnectAttemptsRef.current = 0;
				setConnectionStatus("open");
				console.log("Raw native WebSocket connection successfully established");

				if (ws.readyState === WebSocket.OPEN) {
					ws.send(
						JSON.stringify({
							event: "join_conversation",
							data: {},
						}),
					);
				}
			};

			// 2. Centralized router to intercept custom payload frames
			ws.onmessage = (event) => {
				try {
					const payload = JSON.parse(event.data);

					switch (payload.event) {
						case "widget_session_ready":
							setConversationId(payload.data.conversationId);
							setMessages(payload.data.history);
							break;

						//human intervention messages from the dashboard.
						case "message_received":
							setMessages((prev) => [...prev, payload.data]);
							break;

						case "ai_token_stream":
							setStreamingText((prev) => prev + payload.data.token);
							break;

						case "ai_stream_finished":
							setMessages((prev) => [
								...prev,
								{
									senderType: "ai",
									text: payload.data.text,
								},
							]);
							setStreamingText("");
							break;

						default:
							console.log("Unhandled backend native event frame:", payload.event);
					}
				} catch (err) {
					console.error("Error decoding inbound raw WebSocket frame:", err);
				}
			};

			ws.onclose = (event) => {
				console.log("Native WebSocket pipeline closed down");

				//deleting the old socket
				wsRef.current = null;

				// Don't reconnect if the widget was closed by the user or the component unmounted
				if (!isActiveRef.current || event.code === 1000) return;

				if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
					const attempt = reconnectAttemptsRef.current + 1;
					reconnectAttemptsRef.current = attempt;

					// Exponential backoff: 1s, 2s, 4s, 8s, 16s
					const delay = BASE_RECONNECT_DELAY_MS * 2 ** (attempt - 1);

					setConnectionStatus("reconnecting");
					reconnectTimeoutRef.current = setTimeout(connect, delay);
				} else {
					setConnectionStatus("closed");
				}
			};

			ws.onerror = (err) => {
				console.error("WebSocket error:", err);
				// onclose fires right after onerror for native WebSocket, so reconnection is handled there
			};
		}

		connect();

		return () => {
			isActiveRef.current = false;

			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
				reconnectTimeoutRef.current = null;
			}

			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
			}

			reconnectAttemptsRef.current = 0;
		};
	}, [isOpen, tenantId]);

	useEffect(() => {
		scrollRef.current?.scrollIntoView({
			behavior: "smooth",
		});
	}, [messages, streamingText]);

	const handleSend = (e: React.SubmitEvent) => {
		e.preventDefault();
		if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
			return;
		}

		const userMessage: WidgetMessage = {
			senderType: "customer",
			text: input.trim(),
		};

		setMessages((prev) => [...prev, userMessage]);

		const payload = {
			event: "send_message",
			data: {
				conversationId,
				tenantId,
				text: input.trim(),
			},
		};

		wsRef.current.send(JSON.stringify(payload));
		setInput("");
	};

	const isDisconnected = connectionStatus === "closed" || connectionStatus === "reconnecting";

	return (
		<div className="fixed bottom-6 right-6 z-50 font-sans text-zinc-200 antialiased">
			{!isOpen && (
				<button
					onClick={() => setIsOpen(true)}
					className="h-14 w-14 rounded-full bg-linear-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 text-white hover:scale-105 transition active:scale-95"
				>
					<MessageSquare className="h-6 w-6" />
				</button>
			)}

			{isOpen && (
				<div className="w-95 h-130 rounded-2xl border border-zinc-800 bg-zinc-900/95 shadow-2xl backdrop-blur-md flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
					<header className="p-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
						<div className="flex items-center gap-2.5">
							<div
								className={`h-2 w-2 rounded-full ${
									connectionStatus === "open"
										? "bg-emerald-500 animate-pulse"
										: connectionStatus === "reconnecting"
											? "bg-amber-500 animate-pulse"
											: "bg-red-500"
								}`}
							/>
							<div>
								<h3 className="text-xs font-semibold tracking-wide text-zinc-100">Support Concierge</h3>
								<p className="text-[10px] text-zinc-500">
									{connectionStatus === "open" && "Connected"}
									{connectionStatus === "connecting" && "Connecting..."}
									{connectionStatus === "reconnecting" && "Reconnecting..."}
									{connectionStatus === "closed" && "Connection lost"}
								</p>
							</div>
						</div>
						<button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-zinc-300 transition">
							<X className="h-4 w-4" />
						</button>
					</header>

					<div className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar bg-linear-to-b from-zinc-950/20 to-zinc-950/60">
						{messages.map((msg, idx) => {
							const isCust = msg.senderType === "customer";
							return (
								<div key={idx} className={`flex w-full ${isCust ? "justify-end" : "justify-start"}`}>
									<div
										className={`max-w-[85%] p-3 text-xs leading-relaxed shadow-sm rounded-xl ${
											isCust
												? "bg-blue-600 text-white rounded-br-none"
												: "bg-zinc-800 border border-zinc-700/50 text-zinc-100 rounded-bl-none"
										}`}
									>
										{msg.text}
									</div>
								</div>
							);
						})}

						{streamingText && (
							<div className="flex w-full justify-start">
								<div className="max-w-[85%] p-3 text-xs leading-relaxed bg-zinc-800 border border-zinc-700/50 text-zinc-100 rounded-xl rounded-bl-none flex items-start gap-1.5 animate-pulse">
									<Bot className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
									<span>{streamingText}</span>
								</div>
							</div>
						)}
						<div ref={scrollRef} />
					</div>

					{isDisconnected && (
						<div className="px-3 py-2 bg-red-950/40 border-t border-red-900/50 flex items-center gap-2 text-[11px] text-red-300">
							<AlertCircle className="h-3.5 w-3.5 shrink-0" />
							<span>
								{connectionStatus === "reconnecting"
									? "Reconnecting to support..."
									: "Connection lost. Please close and reopen the chat."}
							</span>
						</div>
					)}

					<footer className="p-3 border-t border-zinc-800 bg-zinc-900">
						<form
							onSubmit={handleSend}
							className="relative flex items-center bg-zinc-950 border border-zinc-800 focus-within:border-zinc-700 rounded-lg p-1.5 transition"
						>
							<input
								type="text"
								value={input}
								onChange={(e) => setInput(e.target.value)}
								placeholder="Type your message..."
								disabled={connectionStatus !== "open"}
								className="flex-1 bg-transparent border-0 outline-none px-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none disabled:opacity-40"
							/>
							<button
								type="submit"
								disabled={!input.trim() || connectionStatus !== "open"}
								className="h-7 w-7 rounded-md bg-zinc-900 border border-zinc-800 text-blue-400 flex items-center justify-center hover:border-zinc-700 transition disabled:opacity-30 disabled:text-zinc-600"
							>
								<Send className="h-3 w-3" />
							</button>
						</form>
					</footer>
				</div>
			)}
		</div>
	);
}

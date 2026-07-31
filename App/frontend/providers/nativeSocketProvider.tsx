"use client";

import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageDoc, ConversationDoc } from "@/store/useChatStore";

interface SocketContextValue {
	socket: WebSocket | null;
	isConnected: boolean;
	sendMessage: (event: string, data: unknown) => boolean;
}

const NativeSocketContext = createContext<SocketContextValue>({
	socket: null,
	isConnected: false,
	sendMessage: () => false,
});

interface NativeSocketProviderProps {
	children: ReactNode;
}

export function NativeSocketProvider({ children }: NativeSocketProviderProps) {
	const queryClient = useQueryClient();
	const [socket, setSocket] = useState<WebSocket | null>(null);
	const [isConnected, setIsConnected] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectAttempts = useRef(0);
	const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const shouldReconnect = useRef(true);

	useEffect(() => {
		shouldReconnect.current = true;

		function connect() {
			const base =
				process.env.NEXT_PUBLIC_WS_URL ||
				(typeof window !== "undefined" && window.location.protocol === "https:"
					? "wss://localhost:3000"
					: "ws://localhost:3000");

			// Token passed as a query param since custom headers
			// aren't allowed on the browser WS handshake.
			const token = localStorage.getItem("accessToken") || "";
			const wsUrl = `${base}/dashboard?token=${encodeURIComponent(token)}`;

			const ws = new WebSocket(wsUrl);
			wsRef.current = ws;

			ws.onopen = () => {
				reconnectAttempts.current = 0;
				setSocket(ws);
				setIsConnected(true);

				ws.send(
					JSON.stringify({
						event: "join_tenant_dashboard",
						data: {}, // wherever this comes from in your auth
					}),
				);
			};

			ws.onmessage = (event) => {
				try {
					const payload = JSON.parse(event.data);

					switch (payload.event) {
						case "new_message": {
							const newMessage: MessageDoc = payload.data;
							queryClient.setQueryData<MessageDoc[]>(["messages", newMessage.conversationId], (old) => {
								if (!old) return [newMessage];
								const withoutTemp = old.filter((m) => m._id !== payload.data.tempId);
								return [...withoutTemp, newMessage];
							});

							queryClient.setQueryData<ConversationDoc[]>(["conversations"], (oldChats) => {
								if (!oldChats) return [];
								return oldChats
									.map((chat) =>
										chat._id === newMessage.conversationId ? { ...chat, updatedAt: newMessage.createdAt } : chat,
									)
									.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
							});

							break;
						}

						case "conversation_activity": {
							const updatedChat: ConversationDoc = payload.data;
							queryClient.setQueryData<ConversationDoc[]>(["conversations"], (oldChats) => {
								if (!oldChats) return [updatedChat];
								return oldChats.map((c) => (c._id === updatedChat._id ? updatedChat : c));
							});
							break;
						}

						case "conversation_settings_changed": {
							// status + aiHandled changed on the active conversation
							queryClient.setQueryData<ConversationDoc[]>(["conversations"], (oldChats) => {
								if (!oldChats) return [];
								return oldChats.map((c) =>
									c._id === payload.data.conversationId
										? { ...c, status: payload.data.status, aiHandled: payload.data.aiHandled }
										: c,
								);
							});
							break;
						}

						default:
							console.warn("Unhandled socket event:", payload.event);
					}
				} catch (err) {
					console.error("Failed to parse socket event frame:", err);
				}
			};

			ws.onerror = (err) => {
				console.error("Dashboard socket error:", err);
			};

			ws.onclose = () => {
				setSocket(null);
				setIsConnected(false);
				wsRef.current = null;

				if (shouldReconnect.current) {
					const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 15000);
					reconnectAttempts.current += 1;
					reconnectTimeout.current = setTimeout(connect, delay);
				}
			};
		}

		connect();

		return () => {
			shouldReconnect.current = false;
			clearTimeout(reconnectTimeout.current);
			wsRef.current?.close();
		};
	}, [queryClient]);

	const sendMessage = useCallback((event: string, data: unknown) => {
		if (wsRef.current?.readyState !== WebSocket.OPEN) {
			console.warn("Socket not open — message not sent:", event);
			return false;
		}
		wsRef.current.send(JSON.stringify({ event, data }));
		return true;
	}, []);

	return (
		<NativeSocketContext.Provider value={{ socket, isConnected, sendMessage }}>{children}</NativeSocketContext.Provider>
	);
}

export function useNativeSocket() {
	return useContext(NativeSocketContext);
}

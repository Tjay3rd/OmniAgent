"use client";

import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageDoc, ConversationDoc } from "@/store/useChatStore";

interface SocketContextValue {
	socket: WebSocket | null;
	isConnected: boolean;
	sendMessage: (event: string, data: unknown) => boolean;
}

interface ConversationActivity {
	conversationId: string;
	lastMessage: string;
	assignedTo: string;
	updatedAt: string;
}

interface NativeSocketProviderProps {
	children: ReactNode;
}

const NativeSocketContext = createContext<SocketContextValue>({
	socket: null,
	isConnected: false,
	sendMessage: () => false,
});

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
			// Prevent opening duplicate sockets if one is already open or connecting
			if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
				return;
			}

			const base =
				process.env.NEXT_PUBLIC_WS_URL ||
				(typeof window !== "undefined" && window.location.protocol === "https:"
					? "wss://actualSite.com" //actual production websocketURL
					: "ws://localhost:5000"); //development fallback

			const wsUrl = `${base}/dashboard`;

			const ws = new WebSocket(wsUrl);
			wsRef.current = ws;

			ws.onopen = () => {
				reconnectAttempts.current = 0;
				setSocket(ws);
				setIsConnected(true);

				if (ws.readyState === WebSocket.OPEN) {
					ws.send(
						JSON.stringify({
							event: "join_tenant_dashboard",
							data: {},
						}),
					);
				}
			};

			ws.onmessage = (event) => {
				try {
					const payload = JSON.parse(event.data);

					switch (payload.event) {
						case "error_message":
						case "new_message": {
							const newMessage: MessageDoc = payload.data;
							queryClient.setQueryData<MessageDoc[]>(["messages", newMessage.conversationId], (old) => {
								if (!old) {
									queryClient.invalidateQueries({ queryKey: ["messages", newMessage.conversationId] });
									return old;
								}

								const withoutTemp = payload.data.tempId ? old.filter((m) => m._id !== payload.data.tempId) : old;
								// Avoid duplicates if the message already exists(race conditions/network retries)
								if (withoutTemp.some((m) => m._id === newMessage._id)) return withoutTemp;

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
							const updatedChat: ConversationActivity = payload.data;
							queryClient.setQueryData<ConversationDoc[]>(["conversations"], (oldChats) => {
								if (!oldChats) return oldChats;
								const known = oldChats.some((c) => c._id === updatedChat.conversationId);
								if (!known) {
									// The conversation is not cached yet; refetch instead of inserting a partial doc.
									queryClient.invalidateQueries({ queryKey: ["conversations"] });
									return oldChats;
								}
								return oldChats
									.map((c) =>
										c._id === updatedChat.conversationId
											? {
													...c,
													assignedTo: updatedChat.assignedTo !== undefined ? updatedChat.assignedTo : c.assignedTo,
													updatedAt: new Date().toISOString(),
												}
											: c,
									)
									.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
							});
							break;
						}

						case "conversation_settings_changed": {
							// status + aiHandled changed on the active conversation
							queryClient.setQueryData<ConversationDoc[]>(["conversations"], (oldChats) => {
								if (!oldChats) {
									queryClient.invalidateQueries({ queryKey: ["conversations"] });
									return oldChats;
								}

								return oldChats.map((c) =>
									c._id === payload.data.conversationId
										? { ...c, status: payload.data.status, aiHandled: payload.data.aiHandled }
										: c,
								);
							});
							break;
						}

						case "message_error": {
							const { tempId, conversationId } = payload.data;
							if (!tempId || !conversationId) {
								console.warn("tempId or conversationId missing in message_error event:", payload.data);
								break;
							}

							queryClient.setQueryData<MessageDoc[]>(["messages", conversationId], (old) =>
								old?.map((m) => (m._id === tempId ? { ...m, status: "failed" } : m)),
							);
							break;
						}

						case "status_update_error": {
							const { conversationId, message } = payload.data;
							if (!conversationId || !message) break;
							console.warn(`Failed to update status for conversation ${conversationId}: ${message}`);
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

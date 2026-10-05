"use client";

import React, { useRef, useEffect } from "react";
import { useChatStore, MessageDoc } from "@/store/useChatStore";
import { useConversations, useTakeoverConversation } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, User, MessageSquare, Clock, Send, ChevronRight, Shield, Settings } from "lucide-react";
import { useNativeSocket } from "@/providers/nativeSocketProvider";
import Link from "next/link";

export default function DashboardPage() {
	const queryClient = useQueryClient();
	const { data: conversations, isLoading: isConversationsLoading } = useConversations();
	const { activeConversationId, setActiveConversationId, draftsByConversation, updateDraft, clearDraft } =
		useChatStore();
	const takeover = useTakeoverConversation();

	// Hook up your new Message Query Hook using the active selection ID
	const { data: messages, isLoading: isMessagesLoading } = useMessages(activeConversationId);

	const activeConversation = conversations?.find((c) => c._id === activeConversationId);
	const currentDraft = activeConversationId ? draftsByConversation[activeConversationId] || "" : "";

	// Ref anchor to keep the chat view automatically locked to the most recent messages
	const messageEndRef = useRef<HTMLDivElement>(null);

	const { sendMessage, isConnected } = useNativeSocket();

	useEffect(() => {
		messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, activeConversationId]);

	useEffect(() => {
		if (!activeConversationId || !isConnected) return;
		sendMessage("join_tenant_dashboard", { conversationId: activeConversationId });
	}, [activeConversationId, isConnected, sendMessage]);

	// Handle firing a text response out over the network interface

	const sendChatMessage = (text: string, tempId: string) => {
		if (!activeConversationId || !isConnected || !activeConversation) {
			return false;
		}

		const sent = sendMessage("send_message", {
			conversationId: activeConversationId,
			text,
			tempId,
		});

		if (sent) {
			queryClient.setQueryData<MessageDoc[]>(["messages", activeConversationId], (old) => [
				...(old || []).filter((m) => m._id !== tempId),
				{
					_id: tempId,
					tenantId: activeConversation.tenantId,
					conversationId: activeConversationId,
					senderType: "agent",
					text,
					senderId: "",
					createdAt: new Date().toISOString(),
					status: "sending",
				},
			]);
		} else {
			queryClient.setQueryData<MessageDoc[]>(["messages", activeConversationId], (old) =>
				old?.map((m) => (m._id === tempId ? { ...m, status: "failed" } : m)),
			);
		}

		return sent;
	};

	const handleSendMessage = (e: React.FormEvent) => {
		e.preventDefault();
		if (!currentDraft.trim() || !activeConversationId) return;

		const text = currentDraft.trim();
		const tempId = `temp-${crypto.randomUUID()}`;

		if (sendChatMessage(text, tempId)) {
			clearDraft(activeConversationId);
		}
	};

	const handleRetry = (msg: MessageDoc) => {
		sendChatMessage(msg.text, msg._id);
	};

	if (isConversationsLoading) {
		return (
			<div className="flex h-screen w-full items-center justify-center bg-zinc-950 text-zinc-400 font-sans">
				<div className="space-y-2 text-center">
					<div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-500 mx-auto" />
					<p className="text-xs tracking-wider">LOADING SECURE WORKSPACE...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-screen w-full overflow-hidden bg-zinc-950 text-zinc-200 font-sans selection:bg-emerald-500/20">
			{/* COLUMN 1: CONVERSATION SIDEBAR */}
			<aside className="w-80 border-r border-zinc-900 bg-zinc-900/20 flex flex-col shrink-0">
				<div className="p-4 border-b border-zinc-900 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<MessageSquare className="h-4 w-4 text-emerald-400" />
						<h1 className="font-semibold text-sm tracking-tight text-zinc-100">Live Queues</h1>
					</div>
					<span className="text-[10px] bg-zinc-900 px-2 py-0.5 rounded-full border border-zinc-800 font-mono text-zinc-400">
						{conversations?.length || 0} active
					</span>
				</div>

				<div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
					{conversations?.map((chat) => {
						const isActive = chat._id === activeConversationId;
						return (
							<button
								key={chat._id}
								onClick={() => setActiveConversationId(chat._id)}
								className={`w-full text-left p-3 rounded-lg border transition duration-150 flex flex-col gap-1.5 group relative ${
									isActive
										? "bg-zinc-900/80 border-zinc-800 shadow-md shadow-black/40"
										: "bg-transparent border-transparent hover:bg-zinc-900/40 hover:border-zinc-900"
								}`}
							>
								<div className="flex items-center justify-between w-full">
									<span className="text-xs font-mono text-zinc-400 tracking-tight group-hover:text-zinc-200">
										ID: {chat.customerId.slice(-6)}
									</span>
									<span className="text-[10px] text-zinc-500 font-mono">
										{new Date(chat.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
									</span>
								</div>

								<div className="flex items-center gap-2 mt-0.5">
									{chat.aiHandled ? (
										<span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/10 font-medium">
											<Bot className="h-3 w-3" /> AI Engine
										</span>
									) : (
										<span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 font-medium">
											<User className="h-3 w-3" /> Human Agent
										</span>
									)}

									<span
										className={`h-1.5 w-1.5 rounded-full ml-auto ${
											chat.status === "open" ? "bg-amber-500" : "bg-zinc-600"
										}`}
									/>
								</div>
							</button>
						);
					})}
				</div>
			</aside>

			{/* COLUMN 2: ACTIVE CHAT FEED WORKSPACE */}
			<main className="flex-1 flex flex-col bg-zinc-950 min-w-0 relative">
				{activeConversation ? (
					<>
						{/* Thread Header Context Banner */}
						<header className="h-14 border-b border-zinc-900 px-6 flex items-center justify-between shrink-0 bg-zinc-950/50 backdrop-blur-sm z-10">
							<div className="flex items-center gap-3">
								<div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
								<div>
									<h2 className="text-sm font-semibold text-zinc-200">Session Workspace</h2>
									<p className="text-[11px] text-zinc-500 font-mono">{activeConversation._id}</p>
								</div>
							</div>

							{activeConversation.aiHandled && (
								<button
									onClick={() => takeover.mutate(activeConversation._id)}
									disabled={takeover.isPending}
									className="inline-flex items-center gap-1.5 text-xs bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 px-3 py-1.5 rounded-md transition disabled:opacity-50"
								>
									{takeover.isPending ? "Intercepting Loop..." : "Take Over from AI"}
									<ChevronRight className="h-3 w-3" />
								</button>
							)}
						</header>

						{/* LIVE STREAM MESSAGE CONTAINER WINDOW */}
						<div className="flex-1 overflow-y-auto p-6 space-y-4 bg-linear-to-b from-zinc-950 via-zinc-950 to-zinc-900/10 custom-scrollbar">
							{isMessagesLoading ? (
								<div className="flex h-full items-center justify-center text-xs text-zinc-600 tracking-wider">
									SYNCING THREAD LOGS...
								</div>
							) : messages && messages.length > 0 ? (
								messages.map((msg) => {
									const isCustomer = msg.senderType === "customer";
									const isAI =
										msg.senderType === "ai" ||
										msg.senderType === "agent" ||
										msg.senderType === "admin" ||
										msg.senderType === "owner";

									return (
										<div
											key={msg._id}
											className={`flex flex-col max-w-[75%] ${isCustomer ? "mr-auto items-start" : "ml-auto items-end"}`}
										>
											{/* Badge identifier above text message bubbles */}
											<span className="text-[10px] text-zinc-500 mb-1 font-mono tracking-tight px-1">
												{isCustomer ? "Customer" : isAI ? "AI Agent" : "You (Agent)"}
											</span>

											<div
												className={`p-3 rounded-xl text-sm leading-relaxed shadow-sm ${
													isCustomer
														? "bg-zinc-900 border border-zinc-800 text-zinc-100"
														: isAI
															? "bg-blue-950/40 border border-blue-900/40 text-blue-200"
															: "bg-emerald-950/40 border border-emerald-900/40 text-emerald-200"
												} ${msg.status === "failed" ? "opacity-60 border-red-900/40" : ""}`}
											>
												{msg.text}
											</div>

											{msg.status === "failed" && (
												<button
													onClick={() => handleRetry(msg)}
													className="text-[10px] text-red-400 hover:text-red-300 mt-1"
												>
													Failed to send — tap to retry
												</button>
											)}
										</div>
									);
								})
							) : (
								<div className="max-w-md mx-auto text-center py-12 space-y-2 border border-dashed border-zinc-900 rounded-xl bg-zinc-900/5 p-4 mt-12">
									<Clock className="h-5 w-5 text-zinc-600 mx-auto" />
									<h3 className="text-xs font-semibold text-zinc-400">No Messages Logged</h3>
									<p className="text-xs text-zinc-500 leading-relaxed">
										This open session tracking channel currently has zero logged historical operations frames inside the
										database.
									</p>
								</div>
							)}
							{/* Invisible anchor target for automatic scroll execution */}
							<div ref={messageEndRef} />
						</div>

						{/* MESSAGE SUBMISSION INPUT DOCK */}
						<footer className="p-4 border-t border-zinc-900 bg-zinc-950 shrink-0">
							<form
								onSubmit={handleSendMessage}
								className="relative border border-zinc-900 bg-zinc-900/20 focus-within:border-zinc-800 rounded-xl transition duration-150 p-2 flex items-end gap-2"
							>
								<textarea
									value={currentDraft}
									onChange={(e) => updateDraft(activeConversation._id, e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter" && !e.shiftKey) {
											e.preventDefault();
											handleSendMessage(e);
										}
									}}
									placeholder={
										activeConversation.aiHandled
											? "Take over control from the AI agent loop to chat..."
											: "Type response to customer... (Press Enter to send)"
									}
									disabled={activeConversation.aiHandled}
									rows={2}
									className="flex-1 bg-transparent border-0 outline-none focus:ring-0 text-sm p-2 text-zinc-200 resize-none placeholder:text-zinc-600 disabled:opacity-40 focus:outline-none"
								/>
								<button
									type="submit"
									disabled={activeConversation.aiHandled || !currentDraft.trim()}
									className="h-9 w-9 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-emerald-400 flex items-center justify-center transition shrink-0 disabled:opacity-30 disabled:hover:border-zinc-800 disabled:text-zinc-600"
								>
									<Send className="h-4 w-4" />
								</button>
							</form>
						</footer>
					</>
				) : (
					<div className="flex-1 flex items-center justify-center text-center p-8">
						<div className="max-w-xs space-y-2">
							<div className="h-10 w-10 rounded-xl bg-zinc-900/50 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-500 shadow-inner">
								<Shield className="h-5 w-5" />
							</div>
							<h3 className="text-sm font-semibold text-zinc-300">No Active Selection</h3>
							<p className="text-xs text-zinc-500 leading-relaxed">
								Choose a tracking instance stream inside the sidebar to view current conversational context and
								operations metrics.
							</p>
						</div>
					</div>
				)}
			</main>

			{/* COLUMN 3: METADATA INSPECTOR */}
			{activeConversation && (
				<aside className="w-72 border-l border-zinc-900 bg-zinc-900/10 p-6 hidden lg:flex flex-col gap-6 shrink-0">
					<div className="space-y-1">
						<h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Metadata Context</h3>
						<p className="text-xs text-zinc-400">Operational properties for this window.</p>
					</div>

					<hr className="border-zinc-900" />

					<div className="space-y-4 text-xs">
						<div className="space-y-1.5">
							<span className="text-zinc-500 block font-medium">Timeline Milestones</span>
							<div className="bg-zinc-900/40 border border-zinc-900 rounded-lg p-3 space-y-2 font-mono text-[11px] text-zinc-400">
								<div className="flex justify-between">
									<span className="text-zinc-600">Updated:</span>
									<span>{new Date(activeConversation.updatedAt).toLocaleTimeString()}</span>
								</div>
								<div className="flex justify-between">
									<span className="text-zinc-600">Human Touch:</span>
									<span className="text-zinc-500">
										{activeConversation.wasFirstHandledByHumanAt
											? new Date(activeConversation.wasFirstHandledByHumanAt).toLocaleTimeString()
											: "Pending API..."}
									</span>
								</div>
							</div>
						</div>

						<div className="space-y-1.5">
							<span className="text-zinc-500 block font-medium">System Rules</span>
							<div className="bg-zinc-900/20 border border-zinc-900 rounded-lg p-3 text-zinc-400 leading-relaxed">
								Taking over manual handling locks down the automated LLM runtime window to prevent concurrent message
								interference.
							</div>
						</div>
					</div>
				</aside>
			)}
			<Link href="/dashboard/settings/widget">
				<button className="inline-flex items-center gap-1.5 text-xs bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 px-3 py-1.5 mt-2 mr-2 rounded-md transition disabled:opacity-50">
					Settings
					<Settings className="h-4 w-4" />
				</button>
			</Link>
		</div>
	);
}

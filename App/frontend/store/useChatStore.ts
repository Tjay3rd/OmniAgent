import { create } from "zustand";

export interface MessageDoc {
	_id: string;
	tenantId: string;
	conversationId: string;
	senderType: "customer" | "agent" | "ai";
	senderId?: string;
	text: string;
	createdAt: string;
}

export interface ConversationDoc {
	_id: string;
	tenantId: string;
	customerId: string;
	status: "open" | "snoozed" | "closed";
	aiHandled: boolean;
	assignedTo?: string;
	updatedAt: string; // Changed from string to Date object
	wasFirstHandledByHumanAt?: string; // Added to map backend metrics tracking
}

interface ChatState {
	conversations: ConversationDoc[];
	messagesByConversation: Record<string, MessageDoc[]>;
	activeConversationId: string | null;
	draftsByConversation: Record<string, string>;
	isLoadingConversations: boolean;

	setConversations: (conversations: ConversationDoc[]) => void;
	setLoadingConversations: (loading: boolean) => void;
	setActiveConversationId: (id: string | null) => void;
	setMessages: (conversationId: string, messages: MessageDoc[]) => void;
	updateDraft: (conversationId: string, text: string) => void;
	clearDraft: (conversationId: string) => void;

	// SYSTEM INTERCEPTORS: These are called by our WebSocket listener when the server broadcasts updates
	handleRealTimeActivity: (data: { conversationId: string; lastMessage: string; assignedTo?: string }) => void;
	handleIncomingMessage: (message: MessageDoc) => void;
	handleSettingsChange: (
		conversationId: string,
		updates: {
			status?: "open" | "snoozed" | "closed";
			aiHandled?: boolean;
			wasFirstHandledByHumanAt?: string;
			assignedTo?: string;
		},
	) => void;
}

export const useChatStore = create<ChatState>((set) => ({
	conversations: [],
	messagesByConversation: {},
	activeConversationId: null,
	draftsByConversation: {},
	isLoadingConversations: false,

	setConversations: (conversations) => set({ conversations }),
	setLoadingConversations: (loading) => set({ isLoadingConversations: loading }),
	setActiveConversationId: (id) => set({ activeConversationId: id }),
	setMessages: (conversationId, messages) =>
		set((state) => ({
			messagesByConversation: { ...state.messagesByConversation, [conversationId]: messages },
		})),
	updateDraft: (conversationId, text) =>
		set((state) => ({
			draftsByConversation: { ...state.draftsByConversation, [conversationId]: text },
		})),
	clearDraft: (conversationId) =>
		set((state) => {
			const updatedDrafts = { ...state.draftsByConversation };
			delete updatedDrafts[conversationId];
			return { draftsByConversation: updatedDrafts };
		}),

	/* WS RECEIVER: Bumps conversations to the top of the list when new messages come in, updates UI according to changes(in data parameter)*/
	handleRealTimeActivity: (data) =>
		set((state) => {
			const existingIndex = state.conversations.findIndex((c) => c._id === data.conversationId);
			if (existingIndex === -1) return state;

			const recentConversations = [...state.conversations];
			const target = recentConversations[existingIndex];

			recentConversations[existingIndex] = {
				...target,
				assignedTo: data.assignedTo ?? target.assignedTo,
				updatedAt: new Date().toISOString(), // Native Date instance timestamp update
			};

			// Sort chronological list on every message event receipt
			recentConversations.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

			return { conversations: recentConversations };
		}),

	/* WS RECEIVER: Appends live incoming text straight to the active reading stream*/
	handleIncomingMessage: (message) =>
		set((state) => {
			const currentMessages = state.messagesByConversation[message.conversationId] || [];
			if (currentMessages.some((m) => m._id === message._id)) return state;

			return {
				messagesByConversation: {
					...state.messagesByConversation,
					[message.conversationId]: [...currentMessages, message],
				},
			};
		}),

	/*WS RECEIVER: Updates settings silently when changes occur on the server. This handles our Takeover synchronization! When an agent clicks "Takeover", the backend fires an API response, updates DB metrics like `wasFirstHandledByHumanAt`, and broadcasts the change. This method applies those exact updates to our local state.*/
	handleSettingsChange: (conversationId, updates) =>
		set((state) => ({
			conversations: state.conversations.map((c) =>
				c._id === conversationId
					? {
							...c,
							...updates,
							updatedAt: new Date().toISOString(), // Ensure standard visual ordering updates
						}
					: c,
			),
		})),
}));

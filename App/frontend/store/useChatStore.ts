import { create } from "zustand";

export interface MessageDoc {
	_id: string;
	tenantId: string;
	conversationId: string;
	senderType: "owner" | "admin" | "agent" | "customer" | "ai";
	senderId?: string;
	text: string;
	createdAt: string;
	status?: "sending" | "failed";
}

export interface ConversationDoc {
	_id: string;
	tenantId: string;
	customerId: string;
	status: "open" | "snoozed" | "closed";
	aiHandled: boolean;
	assignedTo?: string;
	updatedAt: string; // ISO 8601 timestamp
	wasFirstHandledByHumanAt?: string; // Added to map backend metrics tracking
}

interface ChatState {
	activeConversationId: string | null;
	draftsByConversation: Record<string, string>;
	isLoadingConversations: boolean;

	setLoadingConversations: (loading: boolean) => void;
	setActiveConversationId: (id: string | null) => void;
	updateDraft: (conversationId: string, text: string) => void;
	clearDraft: (conversationId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
	activeConversationId: null,
	draftsByConversation: {},
	isLoadingConversations: false,

	setLoadingConversations: (loading) => set({ isLoadingConversations: loading }),
	setActiveConversationId: (id) => set({ activeConversationId: id }),

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
}));

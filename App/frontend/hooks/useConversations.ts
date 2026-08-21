import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useChatStore, ConversationDoc } from "@/store/useChatStore";

/*Hook 1: Fetch all conversations for the tenant dashboard workspace*/
export function useConversations() {
	return useQuery<ConversationDoc[]>({
		queryKey: ["conversations"],
		queryFn: async () => {
			const response = await api.get<{ conversations: ConversationDoc[] }>("/api/dasboard/conversations");
			return response.data.conversations;
		},
		// Keep data fresh, but poll less aggressively if WebSockets handle live updates
		staleTime: 1000 * 60 * 5,
	});
}

/* Hook 2: Take over a conversation from the AI agent loop*/
export function useTakeoverConversation() {
	const handleSettingsChange = useChatStore((state) => state.handleSettingsChange);
	const queryClient = useQueryClient();

	const takeoverMutation = useMutation({
		mutationFn: async (conversationId: string) => {
			// Hits Express backend endpoint to set assignedTo and wasFirstHandledByHumanAt
			const response = await api.patch<{ conversation: ConversationDoc }>(
				`/api/widget/chat/${conversationId}/takeover`,
			);
			return response.data.conversation;
		},
		// Optimistic or synchronous cache updates once backend gives the green light
		onSuccess: (updatedConversation, conversationId) => {
			// 2. Update our local Zustand store instantly so the agent sees the interface unlock
			handleSettingsChange(conversationId, {
				aiHandled: false,
				status: updatedConversation.status,
				wasFirstHandledByHumanAt: updatedConversation.wasFirstHandledByHumanAt
					? updatedConversation.wasFirstHandledByHumanAt
					: new Date().toDateString(),
				assignedTo: updatedConversation.assignedTo,
			});
			// Update the target conversation in our existing cache list directly(optimistically) without an extra network request
			queryClient.setQueryData<ConversationDoc[]>(["conversations"], (oldConversations) => {
				if (!oldConversations) return [updatedConversation];

				return oldConversations
					.map((c) => (c._id === updatedConversation._id ? updatedConversation : c))
					.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
			});
			// ...Or alternatively, Tell React Query to invalidate its server cache so its data matches the backend perfectly
			/* queryClient.invalidateQueries({ queryKey: ["conversations"] }); */
		},
	});
	return {
		mutate: takeoverMutation.mutate,
		isPending: takeoverMutation.isPending,
	};
}

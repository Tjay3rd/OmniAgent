import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ConversationDoc } from "@/store/useChatStore";

/*Hook 1: Fetch all conversations for the tenant dashboard workspace*/
export function useConversations() {
	return useQuery<ConversationDoc[]>({
		queryKey: ["conversations"],
		queryFn: async () => {
			const response = await api.get<{ conversations: ConversationDoc[] }>("/api/dashboard/conversations");
			return response.data.conversations;
		},
		// Keep data fresh, but poll less aggressively if WebSockets handle live updates
		staleTime: 1000 * 60 * 5,
	});
}

/* Hook 2: Take over a conversation from the AI agent loop*/
export function useTakeoverConversation() {
	const queryClient = useQueryClient();

	/*WS RECEIVER: Updates settings silently when changes occur on the server. This handles our Takeover synchronization! When an agent clicks "Takeover", the backend fires an API response, updates DB metrics like `wasFirstHandledByHumanAt`, and broadcasts the change. This method applies those exact updates to our local state.*/

	const takeoverMutation = useMutation({
		mutationFn: async (conversationId: string) => {
			// Hits Express backend endpoint to set assignedTo and wasFirstHandledByHumanAt
			const response = await api.patch<{ conversation: ConversationDoc }>(
				`/api/widget/chat/${conversationId}/takeover`,
			);
			return response.data.conversation;
		},
		// Optimistic or synchronous cache updates once backend gives the green light
		onSuccess: (updatedConversation) => {
			// 2. Update our local conversation doc instantly so the agent sees the interface unlock
			updatedConversation = {
				...updatedConversation,
				aiHandled: false,
				status: updatedConversation.status,
				wasFirstHandledByHumanAt: updatedConversation.wasFirstHandledByHumanAt
					? updatedConversation.wasFirstHandledByHumanAt
					: new Date().toISOString(),
				assignedTo: updatedConversation.assignedTo,
			};
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

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MessageDoc } from "@/store/useChatStore";

/* Hook to fetch historical messages for a specific conversation container */
export function useMessages(conversationId: string | null) {
	return useQuery<MessageDoc[]>({
		queryKey: ["messages", conversationId],
		queryFn: async () => {
			if (!conversationId) return [];
			const response = await api.get<{ messages: MessageDoc[] }>(`api/widget/chat/${conversationId}/messages`);
			return response.data.messages;
		},
		// Only fire the network request if an active conversation ID is provided
		enabled: !!conversationId,
		staleTime: 1000 * 60 * 2, // Consider data fresh for 2 minutes
	});
}

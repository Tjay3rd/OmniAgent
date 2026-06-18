import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import agentConfig from "../models/agentConfig.model.js";
import Message from "../models/chatMessage.model.js";
import { initWebSocketServer } from "./socket.service.js";

export class AiOrchestrationService {
	public static async handleIncomingMessage(
		tenantId: string,
		conversationId: string,
		customerMessageContent: string,
		wsEngine: initWebSocketServer, // Passing our raw WS server utility to send events
	): Promise<void> {
		// Step A: Fetch tenant configuration and message history at the same time
		const [aiConfig, history] = await Promise.all([
			agentConfig.findOne({ tenantId, isActive: true }).lean(),
			Message.find({ conversationId }).sort({ createdAt: -1 }).limit(10).lean(),
		]);

		// Safety Short-Circuit: If the tenant hasn't set up AI or deactivated it, stop here.
		if (!aiConfig) return;

		// Step B: Formating history. MongoDB gave it to us newest-first (.sort({createdAt: -1})),
		// but the LLM needs it in chronological order (oldest to newest). So we reverse it.
		const formattedHistory = history.reverse().map((msg) => ({
			role: msg.senderType === "customer" ? ("user" as const) : ("assistant" as const),
			content: msg.content,
		}));

		// Step C: Trigger the AI stream using Vercel AI SDK
		const result = await streamText({
			model: openai(aiConfig.modelName || "gpt-4o-mini"),
			temperature: aiConfig.temperature ?? 0.7,
			system: aiConfig.systemPrompt, // Injecting tenant-specific rules here
			messages: [...formattedHistory, { role: "user", content: customerMessageContent }],
		});

		let fullResponseText = "";

		// Step D: Iterate over the stream chunks as they arrive in real-time
		for await (const textChunk of result.textStream) {
			fullResponseText += textChunk;

			// Use our native WebSocket map engine to broadcast this piece to the specific room
			wsEngine.broadcastToRoom(`room:${conversationId}`, {
				event: "ai_chunk",
				payload: { conversationId, content: textChunk },
			});
		}

		// Step E: Stream complete! Save the final text to MongoDB
		await Message.create({
			conversationId,
			tenantId,
			senderType: "agent",
			senderId: null, // Null helps differentiate automated AI from a human teammate
			content: fullResponseText.trim(),
		});

		// Let the frontend know it can stop showing typing indicators
		wsEngine.broadcastToRoom(`room:${conversationId}`, {
			event: "ai_complete",
			payload: { conversationId },
		});
	}
}

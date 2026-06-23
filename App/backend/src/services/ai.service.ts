import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import AgentConfig from "../models/agentConfig.model.js";
import Message from "../models/chatMessage.model.js";
import Conversation from "../models/chatConversation.model.js";
import { WebSocket } from "ws";

const openai = createOpenAI({
	apiKey: process.env.OPENAI_API_KEY || "",
});

interface ITriggerAIPipeline {
	tenantId: string;
	conversationId: string;
	ws: WebSocket;
}

export const generateAgentResponseStream = async ({
	tenantId,
	conversationId,
	ws,
}: ITriggerAIPipeline): Promise<void> => {
	try {
		const config = await AgentConfig.findOne({ tenantId });
		if (!config || !config.isActive) {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(
					JSON.stringify({
						event: "error",
						data: { message: "The live AI assistant for this workspace is currently offline." },
					}),
				);
			}
			return;
		}

		// NEW: per-conversation guard — has a human taken this one over?
		const conversation = await Conversation.findById(conversationId).lean();
		if (!conversation || !conversation.aiHandled) return;

		const pastMessages = await Message.find({ conversationId }).sort({ createdAt: -1 }).limit(10).lean();

		pastMessages.reverse();

		// Explicitly typing the array using the streamText parameters schema
		const formattedHistory: Parameters<typeof streamText>[0]["messages"] = pastMessages.map((msg) => {
			switch (msg.senderType) {
				case "customer":
					return { role: "user", content: msg.text };

				case "ai":
					return { role: "assistant", content: msg.text };

				case "owner":
				case "admin":
				case "agent":
					// A human teammate, not the customer and not the AI.
					// Fold into "user" role but tag it so the model doesn't
					// mistake it for either the customer or its own prior reply.
					return { role: "user", content: `[Human agent]: ${msg.text}` };

				default:
					// Defensive fallback — better to surface an unexpected
					// senderType than silently mislabel it.
					throw new Error(`Unhandled senderType in formattedHistory: ${msg.senderType}`);
			}
		});

		const result = await streamText({
			model: openai(config.modelName || "gpt-4o-mini"),
			temperature: config.temperature,
			system: conversation.wasFirstHandledByHumanAt
				? `${config.systemPrompt}\n\nNote: This conversation includes messages from a human support agent, prefixed with "[Human agent]:". Do not claim authorship of those messages, and maintain consistency with decisions or commitments the human agent made.`
				: config.systemPrompt,
			messages: formattedHistory,
		});

		let fullAIResponseText = "";

		for await (const textChunk of result.textStream) {
			fullAIResponseText += textChunk;

			if (ws.readyState === WebSocket.OPEN) {
				ws.send(
					JSON.stringify({
						event: "ai_token",
						data: { conversationId, token: textChunk },
					}),
				);
			}
		}

		const finalizedMessage = await Message.create({
			tenantId,
			conversationId,
			senderType: "ai",
			text: fullAIResponseText,
		});

		if (ws.readyState === WebSocket.OPEN) {
			ws.send(
				JSON.stringify({
					event: "ai_stream_complete",
					data: finalizedMessage,
				}),
			);
		}
	} catch (error) {
		console.error("AI Orchestration Pipeline Failure:", error);
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(
				JSON.stringify({
					event: "error",
					data: { message: "The agent encountered an error processing your request." },
				}),
			);
		}
	}
};

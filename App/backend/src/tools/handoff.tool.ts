// tools/handoff.tool.ts
import { z } from "zod";
import { register } from "./registry.js";
import Conversation from "../models/chatConversation.model.js";

const schema = z.object({ reason: z.string().min(3).max(200) }).strict();

register({
	name: "request_human_handoff",
	description:
		"Hand the chat to a human agent when the customer asks for one or the question cannot be answered from company documents.",
	schema,
	async run({ reason }, ctx) {
		await Conversation.updateOne(
			{ _id: ctx.conversationId, tenantId: ctx.tenantId },
			{ $set: { aiHandled: false, handoffReason: reason } },
		);
		return { handedOff: true };
	},
});

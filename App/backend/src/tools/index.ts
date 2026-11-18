// tools/index.ts
import { tool } from "ai";
import { z } from "zod";
import { ragQuery } from "../services/ragQuery.service.js";
import Conversation from "../models/chatConversation.model.js";
import Tenant from "../models/tenant.model.js";
import { TicketModel } from "../models/supportTicket.model.js";
import { ragQueryResult } from "../types/customTypes.js";

// Built server-side from the authenticated WS session.
export interface ToolContext {
	readonly tenantId: string;
	readonly conversationId: string;
}

const MAX_SEARCHES = 2;

export function buildTools(ctx: ToolContext) {
	let searches = 0; // fresh counter per request

	return {
		search_knowledge_base: tool({
			description:
				"Search the company's documents. Write a standalone query using the whole conversation, not just the last message.",
			inputSchema: z.object({ query: z.string().min(3).max(300) }).strict(),
			execute: async ({ query }) => {
				if (++searches > MAX_SEARCHES) {
					return {
						found: false,
						results: [],
						note: "Search limit reached. Answer from what you have, or hand off to a human.",
					};
				}
				const hits: ragQueryResult[] = await ragQuery(ctx.tenantId, query);
				console.log(
					"[rag]",
					query,
					hits.map((h) => h.score.toFixed(3)),
				);
				if (hits.length === 0) {
					return {
						found: false,
						results: [],
						note: "No relevant documents. Do not guess.",
					};
				}
				return {
					found: true,
					results: hits.map((h) => ({
						title: h.title,
						text: h.text.slice(0, 1200),
						score: Number(h.score.toFixed(3)),
					})),
				};
			},
		}),

		request_human_handoff: tool({
			description:
				"Hand the chat to a human agent when the customer asks for one, or the question cannot be answered accurately from what you know or from company documents.",
			inputSchema: z.object({ reason: z.string().min(3).max(200) }).strict(),
			execute: async ({ reason }) => {
				const handoff = await Conversation.updateOne(
					{ _id: ctx.conversationId, tenantId: ctx.tenantId },
					{ $set: { aiHandled: false, handoffReason: reason } },
				);
				if (!handoff) return { handedOff: false, note: "Conversation not found or already handed off." };
				return { handedOff: true };
			},
		}),

		create_support_ticket: tool({
			description:
				"Create a ticket for an issue a human must follow up on later. Do not use for urgent chats; use request_human_handoff instead.",
			inputSchema: z
				.object({
					subject: z.string().min(3).max(120),
					details: z.string().min(10).max(1000),
				})
				.strict(),
			execute: async ({ subject, details }) => {
				const doc = await TicketModel.create({
					tenantId: ctx.tenantId,
					conversationId: ctx.conversationId,
					subject,
					details,
				});
				return { ticketId: String(doc._id) };
			},
		}),

		// get_business_hours: tool({
		// 	description: "Get the company's opening hours and timezone.",
		// 	inputSchema: z.object({}).strict(),
		// 	execute: async () => {
		// 		const t = await Tenant.findOne({ tenantId: ctx.tenantId }, { businessHours: 1, timezone: 1 }).lean();
		// 		return t
		// 			? {
		// 					hours: t.businessHours,
		// 					timezone: t.timezone,
		// 				}
		// 			: { hours: null, note: "Hours not configured." };
		// 	},
		// }),
	};
}

import { Request, Response, NextFunction } from "express";
import Conversation from "../models/chatConversation.model.js";
import Message from "../models/chatMessage.model.js";
import { broadcastToDashboardRoom, ActualData } from "../services/socket.service.js";
import AgentConfig from "../models/agentConfig.model.js";
import { agentConfigSchema, agentConfigPatchSchema } from "omni-shared";

function toDto(doc: { modelName: string; temperature: number; systemPrompt: string; isActive: boolean }) {
	// Return only what the form knows about, not _id/tenantId/etc.
	const { modelName, temperature, systemPrompt, isActive } = doc;
	return { modelName, temperature, systemPrompt, isActive };
}

/**
 * 1. GET WORKSPACE CONVERSATIONS
 * Pulls all active/historical chat lines bounded strictly to the logged-in user's tenant container
 */
export const getWorkspaceConversations = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	try {
		// req.user is hydrated cleanly by your requireAuth middleware
		const tenantId = req.user?.tenantId;
		const { status } = req.query; // Optional filter: ?status=open

		const query: Record<string, any> = { tenantId };
		if (status && ["open", "snoozed", "closed"].includes(status as string)) {
			query.status = status;
		}

		// Leveraging the high-speed compound index { tenantId: 1, status: 1, updatedAt: -1 } you built!

		const requestedLimit = Number(req.query.limit);
		const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
		const conversations = await Conversation.find(query).sort({ updatedAt: -1 }).limit(limit).lean();

		return res.status(200).json({ conversations });
	} catch (error) {
		next(error);
	}
};

/** 2. Human Takeover Handler **/
export const humanTakeoverHandler = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	try {
		const { conversationId } = req.params;

		// req.user is populated by the requireAuth middleware
		if (!req.user) {
			return res.status(401).json({ error: "Unauthenticated" });
		}

		// Atomically shift control away from the AI to this specific human agent
		const conversation = await Conversation.findOneAndUpdate(
			{ _id: conversationId, tenantId: req.user.tenantId },
			{
				$set: {
					aiHandled: false, // Turn off the AI engine for this chat
					assignedTo: req.user.id, // Lock it to this human agent
				},
			},
			{ new: true }, // Return the updated document
		);

		if (!conversation) {
			return res.status(404).json({ error: "Conversation not found in your workspace." });
		}

		return res.status(200).json({
			message: "AI muted. You have successfully taken control of this conversation.",
			conversation,
		});
	} catch (error) {
		next(error);
	}
};

/*
 * 3. CLOSE CONVERSATION
 * PATCH /api/dashboard/conversations/:conversationId/close
 * Archives a resolved ticket, locks out the conversation, and sets the system back to baseline status. Updates conversation status and broadcasts fully-typed data to open dashboard socket channels.
 */
export const closeConversation = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	try {
		const tenantId = req.user?.tenantId as string;
		const { conversationId } = req.params;

		// Perform a targeted update ensuring the conversation belongs to this tenant. Atomically close out the chat bubble window.
		const updatedConversation = await Conversation.findOneAndUpdate(
			{ _id: conversationId, tenantId },
			{
				$set: {
					status: "closed",
					aiHandled: true, // Hand back control to AI baseline if the conversation ever wakes back up
				},
			},
			{ new: true },
		);

		if (!updatedConversation) {
			return res.status(404).json({ error: "Conversation not found or access denied within this workspace context." });
		}

		const lastMessage = await Message.findOne({ conversationId }).sort({ createdAt: -1 }).select("text").lean();

		const fallbackText = "Conversation marked as closed by support agent.";
		const resolvedLastMessage = lastMessage?.text || fallbackText;

		// Assemble and map data explicitly using your exported ActualData structural rules
		const dashboardBroadcastPayload: ActualData = {
			conversationId: updatedConversation._id.toString(),
			lastMessage: resolvedLastMessage,
			assignedTo: updatedConversation.assignedTo ? updatedConversation.assignedTo : undefined,
		};

		// ALERT LISTENING DASHBOARDS IMMEDIATELY
		// This instantly pops the chat out of your agent UI's active sidebar without needing a page refresh
		broadcastToDashboardRoom(tenantId, "conversation_closed", dashboardBroadcastPayload);

		return res.status(200).json({
			message: "Conversation marked as resolved and closed successfully.",
			conversation: updatedConversation,
		});
	} catch (error) {
		next(error);
	}
};

/**4. Tenant AI Settings */
export async function agentConfigFull(req: Request, res: Response, next: NextFunction): Promise<any> {
	const { tenantId, ...rest } = req.body;

	if (!tenantId) return res.status(401).json({ error: "Unauthorized, missing key credentials" });

	const parsed = agentConfigSchema.safeParse(rest);
	if (!parsed.success) {
		return res.status(400).json({ errors: parsed.error.issues });
	}

	try {
		const created = await AgentConfig.create({ tenantId, ...parsed.data });
		return res.status(201).json(toDto(created));
	} catch (err: unknown) {
		// Your unique index on tenantId enforces one config per tenant.
		if ((err as { code?: number }).code === 11000) {
			return res.status(409).json({ error: "Agent Config FIle Already Exists" });
		}
		next(err);
	}
}

export async function agentConfigTweak(req: Request, res: Response, next: NextFunction): Promise<any> {
	try {
		const { tenantId, ...rest } = req.body;

		if (!tenantId) return res.status(401).json({ error: "Unauthorized, missing key credentials" });

		const parsed = agentConfigPatchSchema.safeParse(rest);
		if (!parsed.success) {
			return res.status(400).json({ errors: parsed.error.issues });
		}

		const updated = await AgentConfig.findOneAndUpdate(
			{ tenantId },
			{ $set: parsed.data },
			{ new: true, runValidators: true, upsert: false },
		);

		if (!updated) {
			return res.status(404).json({ error: "Agent config not found" });
		}

		return res.status(200).json(toDto(updated));
	} catch (err) {
		next(err);
	}
}

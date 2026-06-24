import { Request, Response, NextFunction } from "express";
import Conversation from "../models/chatConversation.model.js";
import Message from "../models/chatMessage.model.js";
import { broadcastToDashboardRoom, ActualData } from "../services/socket.service.js";

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
		const conversations = await Conversation.find(query).sort({ updatedAt: -1 }).lean();

		return res.status(200).json({ conversations });
	} catch (error) {
		next(error);
	}
};

/*
 * 2. CLOSE CONVERSATION
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

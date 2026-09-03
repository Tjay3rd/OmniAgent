import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { env } from "../validation/env.zod.js";
import Message from "../models/chatMessage.model.js";
import User from "../models/user.model.js";
import Conversation from "../models/chatConversation.model.js";
import { generateAgentResponseStream } from "./ai.service.js";
import mongoose, { ObjectId } from "mongoose";
import { messageSchema, statusUpdateSchema } from "../validation/socket.zod.js";

// Custom type extension to store session metadata directly on the socket object
interface ExtendedWebSocket extends WebSocket {
	isAlive?: boolean;
	tenantId?: string;
	conversationId?: string;
	agentId?: string;
	customerId?: string;
	senderType?: "owner" | "admin" | "agent" | "customer";
}

export interface ActualData {
	conversationId: string;
	assignedTo: ObjectId | undefined;
}

interface MessageData {
	tenantId: string;
	conversationId: string;
	senderType: "owner" | "admin" | "agent" | "customer";
	senderId?: string;
	text: string;
	tempId: string;
}

// In-memory Room structures replacing Socket.io namespaces
const conversationRooms = new Map<string, Set<ExtendedWebSocket>>();
const tenantDashboardRooms = new Map<string, Set<ExtendedWebSocket>>();

export const initWebSocketServer = (wss: WebSocketServer) => {
	// 1. Setup Heartbeat (Ping/Pong) loop to clear dead connection ghosts
	const interval = setInterval(() => {
		wss.clients.forEach((ws: ExtendedWebSocket) => {
			if (ws.isAlive === false) {
				cleanRooms(ws);
				return ws.terminate();
			}
			ws.isAlive = false;
			ws.ping();
		});
	}, 30000);

	wss.on("close", () => clearInterval(interval));

	// 2. Main Connection lifecycle handler
	wss.on("connection", (ws: ExtendedWebSocket) => {
		ws.isAlive = true;
		const verifiedTenantId = (ws as any).tenantId;
		const verifiedUserId = (ws as any).agentId;

		ws.on("pong", () => {
			ws.isAlive = true;
		});

		ws.on("message", async (rawData: string) => {
			try {
				const packet = JSON.parse(rawData);
				const { event, data } = packet;

				switch (event) {
					// Action A: Customer joins their specific chat bubble room
					case "join_conversation": {
						let decoded: { customerId: string; tenantId: string };
						try {
							decoded = jwt.verify(data.visitorToken, env.WIDGET_JWT_SECRET!) as typeof decoded;
						} catch {
							ws.close(1008, "Unauthorized: Invalid token or conversation ID");
							return;
						}

						if (!decoded.tenantId || !decoded.customerId) {
							ws.close(1008, "Unauthorized: Missing tenant or customer context");
							return;
						}

						const conversation = await Conversation.findOne({
							_id: data.conversationId,
							tenantId: decoded.tenantId,
							customerId: decoded.customerId,
						}).lean();

						ws.conversationId = data.conversationId;
						ws.tenantId = decoded.tenantId;
						ws.customerId = decoded.customerId;
						ws.senderType = "customer";

						if (!conversation) {
							ws.close(1008, "Unauthorized: Conversation not found or mismatched");
							return;
						}

						if (!conversationRooms.has(data.conversationId)) {
							conversationRooms.set(data.conversationId, new Set());
						}
						conversationRooms.get(data.conversationId)!.add(ws);
						break;
					}

					// Action B: Agent dashboard opens company console feed room
					case "join_tenant_dashboard":
						if (!verifiedTenantId || !verifiedUserId) {
							ws.close(1008, "Unauthorized: Missing tenant context");
							return;
						}

						if (!tenantDashboardRooms.has(verifiedTenantId)) {
							tenantDashboardRooms.set(verifiedTenantId, new Set());
						}
						tenantDashboardRooms.get(verifiedTenantId)!.add(ws);
						break;

					// Action C: Real-time message exchange engine
					case "send_message":
						await handleIncomingMessage(ws, data);
						break;

					// Action D: Dynamic real-time status and handoff synchronization
					case "update_conversation_status":
						await handleStatusUpdate(ws, data);
						break;

					default:
						ws.send(JSON.stringify({ error: "Unknown event pattern" }));
				}
			} catch (err) {
				ws.send(JSON.stringify({ error: "Invalid JSON transmission payload" }));
			}
		});

		// Handle abrupt socket disconnections cleanly
		ws.on("close", () => cleanRooms(ws));
		ws.on("error", () => cleanRooms(ws));
	});
};

//HELPER FUNCTIONS
// Helper 1: Database persistent engine & client broadcasting
const handleIncomingMessage = async (ws: ExtendedWebSocket, data: MessageData) => {
	const sendErrorMessage = (
		ws: ExtendedWebSocket,
		tempId: string | undefined,
		conversationId: string | undefined,
		message: string,
	) => {
		ws.send(
			JSON.stringify({
				event: "message_error",
				data: { tempId, conversationId, message },
			}),
		);
	};

	const parsed = messageSchema.safeParse(data);

	if (!parsed.success) {
		sendErrorMessage(ws, data?.tempId, data?.conversationId, "Invalid payload data");
		return;
	}

	const tenantId = ws.tenantId;
	const senderType = ws.senderType;
	const senderId = senderType === "customer" ? ws.customerId : ws.agentId;
	const { text, tempId } = parsed.data;
	const conversationId = parsed.data.conversationId || ws.conversationId;

	if (!tenantId || !senderId) {
		sendErrorMessage(ws, tempId, conversationId, "Unauthorized or mismatched tenant context");
		return;
	}

	if (!conversationId) {
		sendErrorMessage(ws, tempId, undefined, "Missing conversation context");
		return;
	}

	// 1. Quickly update conversation metadata (time-stamp) so the listing view can sort by most recent activity.
	const conversation = await Conversation.findOneAndUpdate(
		{ _id: conversationId, tenantId },
		{ $set: { updatedAt: new Date() } },
		{ new: true },
	);

	if (!conversation) {
		sendErrorMessage(ws, tempId, conversationId, "Conversation not found or unauthorized");
		return;
	}

	// 2. Commit message directly into MongoDB after verifying conversation actually exists to prevent orphaned messages.
	const newMessage = await Message.create({
		tenantId,
		conversationId,
		senderType,
		senderId,
		text,
	});

	const flattenedMessage = newMessage.toJSON();

	const stringifiedPayload = JSON.stringify({
		event: "new_message",
		data: { ...flattenedMessage, tempId },
	});

	// 3. Broadcast to all matching socket pipes in this Conversation room so all the participants of the conversation can see the new message immediately.
	const chatRoom = conversationRooms.get(conversationId);
	if (chatRoom) {
		chatRoom.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(stringifiedPayload);
			}
		});
	}

	// THE HANDOFF GATEKEEPER CHECK:
	if (conversation?.aiHandled && senderType === "customer") {
		// TRIGGER THE AI GENERATION PIPELINE. Fire and forget the async stream block so it doesn't block the socket thread loop.
		generateAgentResponseStream({
			tenantId,
			conversationId,
			ws, // Pass this exact websocket channel to let the generator pipe tokens down.
		}).catch((error) => {
			console.error("AI stream failed", { conversationId, tenantId, error });
			if (ws.readyState === WebSocket.OPEN) {
				sendErrorMessage(ws, undefined, conversationId, "AI response generation failed");
			}
		});
		console.log("AI is actively handling this. Processing streaming tokens...");
	} else {
		// THE AI IS MUTED. Alert the assigned agent's live dashboard view instead.
		broadcastToDashboardRoom(tenantId, "conversation_activity", {
			conversationId,
			assignedTo: conversation?.assignedTo, // Agent dashboard lights up red.
		});
		console.log("AI bypassed. Chat is under human command.");
	}
};

//Helper 2: Targeted tenant dashboard broadcasting for AI handoff alerts.
export const broadcastToDashboardRoom = (tenantId: string, eventDescription: string, actualData: ActualData) => {
	const dashboardRoom = tenantDashboardRooms.get(tenantId);
	if (!dashboardRoom) return;
	const payload = JSON.stringify({
		event: eventDescription,
		data: actualData,
	});
	dashboardRoom.forEach((client) => {
		if (client.readyState === WebSocket.OPEN) {
			client.send(payload);
		}
	});
};

// Helper 3: Memory manager cleanup loop to prevent active leaks.
const cleanRooms = (ws: ExtendedWebSocket) => {
	if (ws.conversationId && conversationRooms.has(ws.conversationId)) {
		const room = conversationRooms.get(ws.conversationId)!;
		room.delete(ws);
		if (room.size === 0) conversationRooms.delete(ws.conversationId);
	}

	if (ws.tenantId && tenantDashboardRooms.has(ws.tenantId)) {
		const room = tenantDashboardRooms.get(ws.tenantId)!;
		room.delete(ws);
		if (room.size === 0) tenantDashboardRooms.delete(ws.tenantId);
	}
};

//Helper 4: Handle real-time status updates for conversation handoff and assignment changes.
// Add this alongside your handleIncomingMessage helper in services/socket.service.ts

const handleStatusUpdate = async (ws: ExtendedWebSocket, data: any) => {
	const sendErrorMessage = (ws: ExtendedWebSocket, conversationId: string | undefined, message: string) => {
		ws.send(
			JSON.stringify({
				event: "status_update_error",
				data: { conversationId, message },
			}),
		);
	};

	const parsed = statusUpdateSchema.safeParse(data);
	if (!parsed.success) {
		sendErrorMessage(ws, data?.conversationId, "Invalid status update payload");
		return;
	}
	const { conversationId, status, aiHandled, assignedTo } = parsed.data;
	const tenantId = ws.tenantId;
	if (!tenantId || !ws.agentId || !ws.senderType || ws.senderType === "customer") {
		sendErrorMessage(ws, conversationId, "Unauthorized: Missing tenant context");
		return;
	}

	// 1. Build an incremental atomic update payload
	const updatePayload: Record<string, any> = { updatedAt: new Date() };

	if (status !== undefined) {
		if (!["open", "snoozed", "closed"].includes(status)) {
			sendErrorMessage(ws, conversationId, "Invalid status value");
			return;
		}
		updatePayload.status = status;
	}
	if (aiHandled !== undefined) {
		if (typeof aiHandled !== "boolean") {
			sendErrorMessage(ws, conversationId, "Invalid aiHandled value");
			return;
		}
		updatePayload.aiHandled = aiHandled;
	}
	if (assignedTo !== undefined) {
		if (typeof assignedTo !== "string") {
			sendErrorMessage(ws, conversationId, "Invalid assignedTo value");
			return;
		}
		const assignee = await User.exists({ _id: assignedTo, tenantId });
		if (!assignee) {
			sendErrorMessage(ws, conversationId, "Assignee not found in this workspace");
			return;
		}
		updatePayload.assignedTo = assignedTo;
	}
	// 2. Fetch current state first to verify our analytics hook requirements
	const currentConversation = await Conversation.findOne({ _id: conversationId, tenantId }).lean();
	if (!currentConversation) return;

	// ANALYTICS TRIGGER: If a human is taking over for the very first time, lock the timestamp
	if (aiHandled === false && !currentConversation.wasFirstHandledByHumanAt && !currentConversation.assignedTo) {
		updatePayload.wasFirstHandledByHumanAt = new Date();
	}

	// 3. Persist the state alterations to MongoDB
	const updatedConversation = await Conversation.findOneAndUpdate(
		{ _id: conversationId, tenantId },
		{ $set: updatePayload },
		{ new: true },
	);

	if (!updatedConversation) return;

	// 4. Structure the packect data to broadcast to the dashboard room for live updates
	const dashboardBroadcastPayload: ActualData = {
		conversationId,
		assignedTo: updatedConversation?.assignedTo,
	};

	// 5. Broadcast changes across all active channels
	// Alert the workspace dashboard console layout to move tabs or update badges instantly
	broadcastToDashboardRoom(tenantId, "conversation_activity", dashboardBroadcastPayload);

	// If an agent changes settings, emit a silent update event over the raw customer room
	// so the client widget UI knows whether to hide/show typing indicators or agent profiles
	const chatRoom = conversationRooms.get(conversationId);
	if (chatRoom) {
		chatRoom.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(
					JSON.stringify({
						event: "conversation_settings_changed",
						data: {
							conversationId: updatedConversation?._id,
							status: updatedConversation?.status,
							aiHandled: updatedConversation?.aiHandled,
						},
					}),
				);
			}
		});
	}

	console.log(
		`Live Status Sync: Conversation ${conversationId} updated. AI Handled: ${updatedConversation?.aiHandled}`,
	);
};

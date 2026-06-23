import { WebSocketServer, WebSocket } from "ws";
import Message from "../models/chatMessage.model.js";
import Conversation from "../models/chatConversation.model.js";
import { generateAgentResponseStream } from "./ai.service.js";
import { ObjectId } from "mongoose";

// Custom type extension to store session metadata directly on the socket object
interface ExtendedWebSocket extends WebSocket {
	isAlive?: boolean;
	tenantId?: string;
	conversationId?: string;
}

interface ActualData {
	conversationId: string;
	lastMessage: string;
	assignedTo: ObjectId | undefined;
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
		ws.on("pong", () => {
			ws.isAlive = true;
		});

		ws.on("message", async (rawData: string) => {
			try {
				const packet = JSON.parse(rawData);
				const { event, data } = packet;

				switch (event) {
					// Action A: Customer joins their specific chat bubble room
					case "join_conversation":
						ws.conversationId = data.conversationId;
						if (!conversationRooms.has(data.conversationId)) {
							conversationRooms.set(data.conversationId, new Set());
						}
						conversationRooms.get(data.conversationId)!.add(ws);
						break;

					// Action B: Agent dashboard opens company console feed room
					case "join_tenant_dashboard":
						ws.tenantId = data.tenantId;
						if (!tenantDashboardRooms.has(data.tenantId)) {
							tenantDashboardRooms.set(data.tenantId, new Set());
						}
						tenantDashboardRooms.get(data.tenantId)!.add(ws);
						break;

					// Action C: Real-time message exchange engine
					case "send_message":
						await handleIncomingMessage(ws, data);
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
const handleIncomingMessage = async (ws: ExtendedWebSocket, data: any) => {
	const { tenantId, conversationId, senderType, text, senderId } = data;

	// 1. Commit message directly into MongoDB
	const newMessage = await Message.create({
		tenantId,
		conversationId,
		senderType,
		senderId,
		text,
	});

	// 2. Quickly update conversation metadata (time-stamp) so the listing view can sort by most recent activity.
	const conversation = await Conversation.findByIdAndUpdate(
		conversationId,
		{
			$set: { updatedAt: new Date() },
		},
		{ new: true },
	);
	if (!conversation) return;

	const stringifiedPayload = JSON.stringify({
		event: "new_message",
		data: newMessage,
	});

	// 3. Broadcast to all matching socket pipes in this Conversation room so all the paricipants of the conversation can see the new message immediately.
	const chatRoom = conversationRooms.get(conversationId);
	if (chatRoom) {
		chatRoom.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(stringifiedPayload);
			}
		});
	}

	// 4. Alert listening dashboards about incoming text events
	const dashboardRoom = tenantDashboardRooms.get(tenantId);

	// THE HANDOFF GATEKEEPER CHECK:
	if (conversation?.aiHandled && senderType === "customer") {
		// TRIGGER THE AI GENERATION PIPELINE. Fire and forget the async stream block so it doesn't block the socket thread loop.
		generateAgentResponseStream({
			tenantId,
			conversationId,
			ws, // Pass this exact websocket channel to let the generator pipe tokens down.
		});
		console.log("AI is actively handling this. Processing streaming tokens...");
	} else {
		// THE AI IS MUTED. Alert the assigned agent's live dashboard view instead.
		broadcastToDashboardRoom(dashboardRoom, "conversation_activity", {
			conversationId,
			lastMessage: text,
			assignedTo: conversation?.assignedTo, // Agent dashboard lights up red.
		});
		console.log("AI bypassed. Chat is under human command.");
	}
};

//Helper 2: Targeted tenant dashboard broadcasting for AI handoff alerts.
const broadcastToDashboardRoom = (
	dashboardRoom: Set<ExtendedWebSocket> | undefined,
	eventDescription: string,
	actualData: ActualData,
) => {
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

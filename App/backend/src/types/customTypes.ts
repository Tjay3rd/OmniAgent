import { WebSocket } from "ws";

export type Tier = "free" | "starter" | "production";

export interface ExtendedWebSocket extends WebSocket {
	isAlive?: boolean;
	tenantId?: string;
	conversationId?: string;
	agentId?: string;
	customerId?: string;
	senderType?: "owner" | "admin" | "agent" | "customer";
}

export interface ragQueryResult {
	_id: string;
	title: string;
	text: string;
	score: number;
}

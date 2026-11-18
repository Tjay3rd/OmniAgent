import { z } from "zod";

// Built server-side from the authenticated WS session. The model never sees or controls any of this.
export interface ToolContext {
	readonly tenantId: string;
	readonly conversationId: string;
}

export interface ToolDef<S extends z.ZodType> {
	name: string;
	description: string;
	schema: S;
	run: (args: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
}

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

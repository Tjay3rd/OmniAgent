import { z } from "zod";
import type { ToolContext, ToolDef, ToolResult } from "./types.js";

const registry = new Map<string, ToolDef<z.ZodType>>();

export function register<S extends z.ZodType>(tool: ToolDef<S>): void {
	registry.set(tool.name, tool as ToolDef<z.ZodType>);
}

export function describeTools(): string {
	return [...registry.values()].map((t) => `- ${t.name}: ${t.description}`).join("\n");
}

export async function executeTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
	const tool = registry.get(name);
	if (!tool) return { ok: false, error: `Unknown tool: ${name}` };

	const parsed = tool.schema.safeParse(rawArgs);
	if (!parsed.success) {
		return { ok: false, error: "Invalid arguments" };
	}

	try {
		const data = await tool.run(parsed.data, ctx);
		return { ok: true, data };
	} catch (err) {
		console.error(`[tool:${name}]`, err);
		return { ok: false, error: "Tool failed" };
	}
}

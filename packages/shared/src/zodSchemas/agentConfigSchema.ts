import { z } from "zod";

export const agentConfigSchema = z.object({
	modelName: z.enum(
		[
			"gemini-2.5-flash",
			"gemini-2.5-flash-lite",
			"gemini-3.1-flash-lite",
			"gemini-3.5-flash",
			"gemini-3.5-flash-lite",
			"gemini-3.6-flash",
			"gemini-3.7-flash",
			"gemini-3.8-flash",
		],
		{ message: "Pick a model" },
	),
	temperature: z
		.number("Temperature must be a number")
		.min(0, "Temperature can't go below 0")
		.max(2, "Temperature can't go above 2"),
	systemPrompt: z
		.string()
		.min(20, "System prompt should be at least 20 characters")
		.max(4000, "System prompt is too long (max 4000 characters)"),
	isActive: z.boolean(),
});

export type AgentConfigFormValues = z.infer<typeof agentConfigSchema>;

// Same rules, every field optional, unknown keys rejected,
// and at least one field required.
export const agentConfigPatchSchema = agentConfigSchema
	.partial()
	.strict()
	.refine((v) => Object.keys(v).length > 0, {
		message: "No fields to update",
	});

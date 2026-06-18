import { Schema, model, Document } from "mongoose";

export interface IAgentConfig extends Document {
	tenantId: Schema.Types.ObjectId;
	systemPrompt: string; // The core personality/rules for the AI
	temperature: number; // LLM creativity variance (e.g., 0.0 to 1.0)
	modelProvider: string; // e.g., "openai", "anthropic", "gemini"
	modelName: string; // e.g., "gpt-4o", "claude-3-5-sonnet"
	isActive: boolean; // Toggle to enable/disable AI assistant globally
	createdAt: Date;
	updatedAt: Date;
}

const agentConfigSchema = new Schema<IAgentConfig>(
	{
		tenantId: {
			type: Schema.Types.ObjectId,
			ref: "Tenant",
			required: true,
			unique: true, // One dedicated bot configuration per tenant business workspace
		},
		systemPrompt: {
			type: String,
			required: true,
			default: "You are a helpful customer support assistant. Keep answers concise.",
		},
		temperature: {
			type: Number,
			required: true,
			default: 0.3, // Low temperature by default for predictable support answers
			min: 0.0,
			max: 1.0,
		},
		modelProvider: {
			type: String,
			required: true,
			default: "openai",
		},
		modelName: {
			type: String,
			required: true,
			default: "gpt-4o-mini",
		},
		isActive: {
			type: Boolean,
			default: true,
		},
	},
	{ timestamps: true },
);

// High-speed index lookup for the live socket thread engine
agentConfigSchema.index({ tenantId: 1 });

const AgentConfig = model<IAgentConfig>("AgentConfig", agentConfigSchema);
export default AgentConfig;

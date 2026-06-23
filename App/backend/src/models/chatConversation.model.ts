import { Schema, model, Document } from "mongoose";

export interface IConversation extends Document {
	tenantId: Schema.Types.ObjectId;
	customerId: Schema.Types.ObjectId;
	assignedTo?: Schema.Types.ObjectId; // Empty if managed by AI agent
	status: "open" | "snoozed" | "closed";
	aiHandled: boolean; // Tracks if AI is actively responding
	wasFirstHandledByHumanAt: Date | null; // For analytics: when did a human first take over (if ever)
	createdAt: Date;
	updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
	{
		tenantId: {
			type: Schema.Types.ObjectId,
			ref: "Tenant",
			required: true,
		},
		customerId: {
			type: Schema.Types.ObjectId,
			ref: "Customer",
			required: true,
		},
		assignedTo: {
			type: Schema.Types.ObjectId,
			ref: "User",
		},
		status: {
			type: String,
			enum: ["open", "snoozed", "closed"],
			default: "open",
		},
		aiHandled: {
			type: Boolean,
			default: true,
		},
		wasFirstHandledByHumanAt: {
			type: Date,
			default: null,
		},
	},
	{ timestamps: true },
);

// High-speed index lookup for the dashboard to list a business's active chats
conversationSchema.index({ tenantId: 1, status: 1, updatedAt: -1 });

const Conversation = model<IConversation>("Conversation", conversationSchema);
export default Conversation;

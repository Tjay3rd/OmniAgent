import { Schema, model, Document } from "mongoose";

export interface IMessage extends Document {
	tenantId: Schema.Types.ObjectId;
	conversationId: Schema.Types.ObjectId;
	senderType: "customer" | "owner" | "admin" | "agent" | "ai";
	senderId?: Schema.Types.ObjectId; // Populated if an actual human agent sent it
	text: string;
	createdAt: Date;
}

const messageSchema = new Schema<IMessage>(
	{
		tenantId: {
			type: Schema.Types.ObjectId,
			ref: "Tenant",
			required: true,
		},
		conversationId: {
			type: Schema.Types.ObjectId,
			ref: "Conversation",
			required: true,
		},
		senderType: {
			type: String,
			enum: ["customer", "owner", "admin", "agent", "ai"],
			required: true,
		},
		senderId: {
			type: Schema.Types.ObjectId,
			ref: "User",
		},
		text: {
			type: String,
			required: true,
			trim: true,
		},
	},
	{ timestamps: { createdAt: true, updatedAt: false } }, // No need for updatedAt
);

// Index to instantly sort and pull message history for a specific active chat bubble
messageSchema.index({ conversationId: 1, createdAt: 1 });

const Message = model<IMessage>("Message", messageSchema);
export default Message;

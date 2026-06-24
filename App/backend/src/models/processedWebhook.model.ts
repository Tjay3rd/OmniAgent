import { Schema, model, Document } from "mongoose";

export interface IProcessedWebhook extends Document {
	eventId: string; // Unique identifier supplied by the provider (e.g., event.id from Stripe)
	provider: string; // e.g., "stripe", "paypal"
	status: "processing" | "completed" | "failed";
	createdAt: Date;
}

const processedWebhookSchema = new Schema<IProcessedWebhook>(
	{
		eventId: {
			type: String,
			required: true,
			unique: true, // Prevents duplicate entries at the database level
			trim: true,
		},
		provider: {
			type: String,
			required: true,
			enum: ["stripe"], // Expandable if you integrate other payment/auth providers later
		},
		status: {
			type: String,
			required: true,
			enum: ["processing", "completed", "failed"],
			default: "processing",
		},
	},
	{
		timestamps: { createdAt: true, updatedAt: false }, // We only care about insertion time
	},
);

// High-speed index lookup for our idempotency gatekeeper checks
processedWebhookSchema.index({ eventId: 1 });

// Time-To-Live (TTL) Index: Automatically deletes webhook records after 7 days
// This keeps your database lightweight since old webhook IDs are highly unlikely to be retried.
processedWebhookSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

const ProcessedWebhook = model<IProcessedWebhook>("ProcessedWebhook", processedWebhookSchema);
export default ProcessedWebhook;

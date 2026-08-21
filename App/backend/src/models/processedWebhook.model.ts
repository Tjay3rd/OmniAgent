import { Schema, model, Document } from "mongoose";

export interface IProcessedWebhook extends Document {
	eventId: string; // Unique identifier supplied by the provider (e.g., event.id from Stripe)
	status: "processing" | "completed" | "failed";
	createdAt: Date;
	eventType: string; // e.g., "checkout.session.completed", "customer.subscription.created"
	lastAttemptAt: Date; // Timestamp of the last processing attempt
	errorMessage: string; // Optional error message to track what went wrong on failed webhooks
}

const processedWebhookSchema = new Schema<IProcessedWebhook>(
	{
		eventId: {
			type: String,
			required: true,
			unique: true, // Prevents duplicate entries at the database level
			trim: true,
		},
		status: {
			type: String,
			required: true,
			enum: ["processing", "completed", "failed"],
			default: "processing",
		},
		eventType: {
			type: String,
			required: true,
			trim: true,
		},
		lastAttemptAt: {
			type: Date,
			default: Date.now(), // Tracks the last time we attempted to process this webhook
		},
		errorMessage: {
			type: String,
			default: null, // Optional field to store error messages if processing fails
		},
	},
	{
		timestamps: { createdAt: true, updatedAt: false }, // We only care about insertion time
	},
);

// Time-To-Live (TTL) Index: Automatically deletes webhook records after 7 days
// This keeps your database lightweight since old webhook IDs are highly unlikely to be retried.
processedWebhookSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

const ProcessedWebhook = model<IProcessedWebhook>("ProcessedWebhook", processedWebhookSchema);
export default ProcessedWebhook;

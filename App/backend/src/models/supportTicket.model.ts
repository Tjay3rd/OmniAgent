import mongoose, { Schema, Document, Model } from "mongoose";

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";

export interface ITicket extends Document {
	tenantId: mongoose.Types.ObjectId;
	customerEmail: string;
	subject: string;
	description: string;
	status: TicketStatus;
	priority: TicketPriority;
	assignedTo?: string;
	tags: string[];
	createdAt: Date;
	updatedAt: Date;
}

const TicketSchema = new Schema<ITicket>(
	{
		tenantId: {
			type: Schema.Types.ObjectId,
			required: true,
			index: true, // Fast isolation queries per tenant
		},
		customerEmail: {
			type: String,
			required: true,
			lowercase: true,
			trim: true,
		},
		subject: {
			type: String,
			required: true,
			trim: true,
		},
		description: {
			type: String,
			required: true,
		},
		status: {
			type: String,
			enum: ["open", "in_progress", "resolved", "closed"],
			default: "open",
			index: true,
		},
		priority: {
			type: String,
			enum: ["low", "medium", "high", "urgent"],
			default: "medium",
		},
		assignedTo: {
			type: String,
			required: false,
		},
		tags: {
			type: [String],
			default: [],
		},
	},
	{
		timestamps: true, // Automatically manages createdAt and updatedAt
	},
);

// Compound index for fast tenant-scoped filtering by status and recency
TicketSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

// Prevent model overwrite errors during hot-reloads in dev
export const TicketModel: Model<ITicket> = mongoose.models.Ticket || mongoose.model<ITicket>("Ticket", TicketSchema);

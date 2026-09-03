import { z } from "zod";
import mongoose from "mongoose";

export const messageSchema = z.object({
	conversationId: z
		.string()
		.refine((val) => mongoose.Types.ObjectId.isValid(val), { message: "Invalid ObjectId" })
		.optional(),
	text: z.string().nonempty(),
	tempId: z.string(),
});

export const statusUpdateSchema = z
	.object({
		conversationId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), { message: "Invalid ObjectId" }),
		status: z.enum(["open", "snoozed", "closed"]).optional(),
		aiHandled: z.boolean().optional(),
		assignedTo: z
			.string()
			.refine((val) => mongoose.Types.ObjectId.isValid(val), { message: "Invalid ObjectId" })
			.optional(),
	})
	.refine((data) => data.status !== undefined || data.aiHandled !== undefined || data.assignedTo !== undefined, {
		message: "Provide at least one status update",
	});

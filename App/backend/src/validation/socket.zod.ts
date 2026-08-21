import { z } from "zod";
import mongoose from "mongoose";

export const messageSchema = z.object({
	tenantId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), { message: "Invalid ObjectId" }),
	conversationId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), { message: "Invalid ObjectId" }),
	senderType: z.string().nonempty(),
	text: z.string().nonempty(),
	senderId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), { message: "Invalid ObjectId" }),
	tempId: z.string(),
});

export const statusUpdateSchema = z.object({
	conversationId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), { message: "Invalid ObjectId" }),
	status: z.enum(["open", "snoozed", "closed"]),
	aiHandled: z.boolean(),
	assignedTo: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), { message: "Invalid ObjectId" }),
});

import { z } from "zod";

export const messageSchema = z.object({
	tenantId: z.string().nonempty(),
	conversationId: z.string().nonempty(),
	senderType: z.string().nonempty(),
	text: z.string().nonempty(),
	senderId: z.string().nonempty(),
	tempId: z.string(),
});

export const assignedToSchema = z.object({
	assignedTo: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid assignedTo value."),
});

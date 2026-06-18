import { z } from "zod";

export const acceptInviteSchema = z.object({
	token: z.string().regex(/^[0-9a-fA-F]{64}$/, "Invalid token structure"),
	name: z.string().min(2).max(60).trim(),
	password: z
		.string()
		.min(8, "Password must be at least 8 characters")
		.max(72, "Password max 72 chars")
		.regex(/[A-Z]/, "Must contain uppercase letter")
		.regex(/[0-9]/, "Must contain a number")
		.regex(/[!@#$%]/, "Must contain a special character"),
});

import { z } from "zod";

export const registrationSchema = z.object({
	name: z.string().min(2).max(60).trim(),
	email: z.email().toLowerCase().trim(),
	companyName: z.string().min(2).max(60).trim(),
	// URL-safe subdomain validation rule
	subdomain: z
		.string()
		.min(2, "Subdomain must be at least 2 characters")
		.max(30, "Subdomain max 30 characters")
		.toLowerCase()
		.trim()
		// 1. Block dots explicitly with an informative error
		.refine((val) => !val.includes("."), {
			message: "Subdomain cannot contain periods or dots",
		})
		// 2. Enforce standard URL slug rules (letters, numbers, and hyphens only)
		.refine((val) => /^[a-z0-9-]+$/.test(val), {
			message: "Subdomain can only contain lowercase letters, numbers, and hyphens",
		})
		// 3. Prevent leading or trailing hyphens
		.refine((val) => !val.startsWith("-") && !val.endsWith("-"), {
			message: "Subdomain cannot start or end with a hyphen",
		}),
	password: z
		.string()
		.min(8, "Password must be at least 8 characters")
		.max(72, "Password max 72 chars (bcrypt limit)")
		.regex(/[A-Z]/, "Must contain uppercase letter")
		.regex(/[0-9]/, "Must contain a number")
		.regex(/[!@#$%]/, "Must contain a special character"),
});

export const loginSchema = z.object({
	email: z.email().toLowerCase().trim(),
	password: z
		.string()
		.min(8, "Password must be at least 8 characters")
		.max(72, "Password max 72 chars (bcrypt limit)")
		.regex(/[A-Z]/, "Must contain uppercase letter")
		.regex(/[0-9]/, "Must contain a number")
		.regex(/[!@#$%]/, "Must contain a special character"),
});

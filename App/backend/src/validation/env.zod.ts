import dotenv from "dotenv";
import { z } from "zod";
// Load the actual .env file into process.env
dotenv.config();
// Define the schema representing what should be in your .env
const envSchema = z.object({
	PORT: z
		.string()
		.default("5000")
		.transform((val) => parseInt(val, 10)),
	MONGO_URI: z.url(),
	JWT_ACCESS_SECRET: z.string().min(10, "JWT Secret must be at least 10 characters long"),
	JWT_REFRESH_SECRET: z.string().min(10, "JWT Secret must be at least 10 characters long"),
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
	STRIPE_SECRET_KEY: z.string().min(10, "Stripe Secret Key must be at least 10 characters long"),
	STRIPE_WEBHOOK_SECRET: z.string().min(10, "Stripe Webhook Secret must be at least 10 characters long"),
	FRONTEND_URL: z.url(),
});
// Validate process.env against the schema
const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
	console.error("❌ Invalid environment variables:", z.treeifyError(parsedEnv.error));
	process.exit(1); // Stop the server immediately
}
// Export the type-safe environment object
export const env = parsedEnv.data;

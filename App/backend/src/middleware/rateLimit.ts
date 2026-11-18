import rateLimit from "express-rate-limit";
import { Request, Response } from "express";

export const verifiedLimiter = rateLimit({
	windowMs: 10 * 60 * 1000, // 10 minutes
	max: (req: Request) => {
		if (req.user?.plan === "production") return 5000;
		if (req.user?.plan === "starter") return 2000;
		return 100; // Free plan default
	},
	standardHeaders: "draft-8",
	legacyHeaders: false,

	// Custom key generator based on Tenant ID
	keyGenerator: (req: Request): string => {
		// 1. Extract tenant ID from authenticated user, header, or route param
		const tenantId = req.user?.tenantId || req.params.tenantId;

		// 2. Fallback to IP if tenant ID is not found (e.g., unauthenticated routes)
		if (!tenantId) {
			return req.ip!;
		}

		// 3. Return a unique key scoped to the tenant
		return `tenant:${tenantId}`;
	},

	handler: (req: Request, res: Response) => {
		res.status(429).json({
			error: "Too Many Requests",
			message: "Rate limit exceeded for your tenant workspace. Please try again later.",
		});
	},
});

export const unverifiedLimiter = rateLimit({
	windowMs: 10 * 60 * 1000, // 10 minutes
	max: 100,
	standardHeaders: "draft-8",
	legacyHeaders: false,
});

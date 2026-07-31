declare global {
	namespace Express {
		interface Request {
			user?: {
				id: string;
				tenantId: string;
				role: "owner" | "admin" | "agent";
			};
		}
	}
}
export {};

export type Tier = "free" | "starter" | "production";

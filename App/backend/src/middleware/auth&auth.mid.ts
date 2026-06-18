import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../validation/env.zod.js";

//Authentication middleware to verify JWT tokens and attach user info to the request object
export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	try {
		// Reading token directly from secure httpOnly cookies
		const token = req.cookies.accessToken;

		if (!token) {
			return res.status(401).json({ error: "Access token missing" });
		}

		const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as any;

		req.user = {
			id: decoded.id,
			tenantId: decoded.tenantId,
			role: decoded.role,
		};

		next();
	} catch (error) {
		return res.status(401).json({ error: "Session expired" });
	}
};

//Authorization middleware to restrict access based on user roles (owner, agent, admin)
export const restrictTo = (...allowedRoles: ("owner" | "admin" | "agent")[]) => {
	return (req: Request, res: Response, next: NextFunction): any => {
		if (!req.user) {
			return res.status(401).json({ error: "Unauthenticated" });
		}

		if (!allowedRoles.includes(req.user.role)) {
			return res.status(403).json({
				error: "Forbidden: Insufficient workspace permissions",
			});
		}

		next();
	};
};

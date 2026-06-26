import { Request, Response, NextFunction } from "express";
import Tenant from "../models/tenant.model.js";

// Extend the Express Request type to hold our Tenant document
declare global {
	namespace Express {
		interface Request {
			tenant?: any;
		}
	}
}

export const extractSubdomain = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	const hostname = req.hostname; // e.g., "logistics.yourplatform.com" or "localhost"

	// Split by dots to isolate the parts
	const parts = hostname.split(".");

	// Ignore standard paths like 'www' or local setups
	if (parts.length < 3 || parts[0] === "www" || parts[0] === "localhost") {
		return next(); // Carry on to marketing pages / main platform auth
	}

	const subdomainStr = parts[0].toLowerCase();

	try {
		// Look up who this subdomain belongs to
		const tenant = await Tenant.findOne({ subdomain: subdomainStr });
		if (!tenant) {
			return res
				.status(404)
				.json({ error: "Either workspace does not exist or workspace doesnt match with authenticated user." });
		}

		// Attach the verified tenant database object to the request lifecycle
		req.tenant = tenant;
		next();
	} catch (error) {
		next(error);
	}
};

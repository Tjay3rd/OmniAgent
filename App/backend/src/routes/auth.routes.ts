import { Router } from "express";
import { Response, Request, NextFunction } from "express";
import { loginHandler, tenantRegistrationHandler } from "../controllers/auth.controller.js";
import Customer from "../models/customer.model.js";
import Tenant from "../models/tenant.model.js";
import { requireAuth } from "../middleware/auth&auth.mid.js";
import { restrictTo } from "../middleware/auth&auth.mid.js";
import { validate } from "../middleware/validation.middleware.js";
import { acceptInviteSchema } from "../validation/inviteToken.zod.js";
import { acceptInviteHandler } from "../controllers/invite.controller.js";

const authRouter = Router();

// Multi-tenant protected route pipeline example
authRouter.get(
	"/dashboard/agent-settings",
	requireAuth,
	restrictTo("owner"), // Blocks normal support agents automatically
	(req, res) => {
		res.json({ msg: `Welcome, Owner of Tenant Workspace: ${req.user?.tenantId}` });
	},
);

// Public endpoint route for processing incoming invitation payloads
authRouter.post("/auth/accept-invite", validate(acceptInviteSchema), acceptInviteHandler);

authRouter.post("/users/register", tenantRegistrationHandler);
authRouter.post("/tenants/register", tenantRegistrationHandler);

authRouter.post("/users/login", loginHandler(Customer));
authRouter.post("/tenants/login", loginHandler(Tenant));

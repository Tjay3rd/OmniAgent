import { Router } from "express";
import {
	tenantRegistrationHandler,
	loginHandler,
	handleTokenRefresh,
	handleLogout,
} from "../controllers/auth.controller.js";
import { updateAgentConfig } from "../controllers/agentConfig.controller.js";
import User from "../models/user.model.js";

// Import your custom middleware layers
import { validate } from "../middleware/validation.middleware.js";
import { requireAuth, restrictTo } from "../middleware/auth&auth.mid.js";

// Import your schemas (adjust paths to match your file naming)
import { registrationSchema, loginSchema, agentConfigSchema } from "../validation/auth.zod.js";

const adminRouter = Router();

// --- PUBLIC AUTHENTICATION ENDPOINTS (With Zod Validation) ---
adminRouter.post("/register", validate(registrationSchema), tenantRegistrationHandler);
adminRouter.post("/login", validate(loginSchema), loginHandler(User));
adminRouter.post("/refresh", handleTokenRefresh);
adminRouter.post("/logout", handleLogout);

// --- PROTECTED WORKSPACE MANAGEMENT ENDPOINTS ---
adminRouter.use(requireAuth);

// Only an 'owner' can adjust settings, and the body payload must pass Zod validation
adminRouter.patch("/settings/ai-agent", restrictTo("owner"), validate(agentConfigSchema), updateAgentConfig);

export default adminRouter;

import { Router } from "express";
import { requireAuth } from "../middleware/auth&auth.mid.js";
import { restrictTo } from "../middleware/auth&auth.mid.js";
import { updateAgentConfig } from "../controllers/agentConfig.controller.js";

const adminRouter = Router();

// Secure the entire sub-tree block
adminRouter.use(requireAuth);

// Explicitly lock AI adjustments to the workspace Owner
adminRouter.patch("/settings/ai-agent", restrictTo("owner"), updateAgentConfig);

export default adminRouter;

import { Router } from "express";
import { getWorkspaceConversations, closeConversation } from "../controllers/dashboard.controller.js";
// Import your custom middleware layers
import { requireAuth, restrictTo } from "../middleware/auth&auth.mid.js";
import { extractSubdomain } from "../middleware/subdomain.middleware.js";

const dashboardRouter = Router();

// Force user token validation and extract workspace tenant context for every route below
dashboardRouter.use(requireAuth);
dashboardRouter.use(extractSubdomain);
dashboardRouter.use((req, res, next) => {
	if (!req.tenant || req.tenant._id.toString() !== req.user?.tenantId) {
		return res.status(403).json({ error: "Forbidden: workspace context mismatch" });
	}
	next();
});
dashboardRouter.use(restrictTo("owner", "admin", "agent"));

// Owners, admins and agents can view the active conversation timelines within their active tenant container
dashboardRouter.get("/conversations", getWorkspaceConversations);

// Owners, admins and agents can archive resolved tickets
dashboardRouter.patch("/conversations/:conversationId/close", closeConversation);

export default dashboardRouter;

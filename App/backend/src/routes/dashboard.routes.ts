import { Router } from "express";
import { getWorkspaceConversations, closeConversation } from "../controllers/dashboard.controller.js";

// Import your custom middleware layers
import { requireAuth, restrictTo } from "../middleware/auth&auth.mid.js";
import { extractSubdomain } from "../middleware/subdomain.middleware.js";

const dashboardRouter = Router();

// Force user token validation and extract workspace tenant context for every route below
dashboardRouter.use(requireAuth);
dashboardRouter.use(extractSubdomain);

// Owners, admins and agents can view the active conversation timelines within their active tenant container
dashboardRouter.get("/conversations", restrictTo("owner", "admin", "agent"), getWorkspaceConversations);

// Owners, admins and agents can archive resolved tickets
dashboardRouter.patch("/conversations/:conversationId/close", restrictTo("owner", "admin", "agent"), closeConversation);

export default dashboardRouter;

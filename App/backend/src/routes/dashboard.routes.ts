import { Router } from "express";
import {
	getWorkspaceConversations,
	closeConversation,
	humanTakeoverHandler,
	agentConfigFull,
	agentConfigTweak,
	getSourceStatus,
} from "../controllers/dashboard.controller.js";
import { uploadContextDocs } from "../controllers/docUpload.controller.js";
// Import your custom middleware layers
import { requireAuth, restrictTo } from "../middleware/auth&auth.mid.js";
//import { extractSubdomain } from "../middleware/subdomain.middleware.js";
import multer from "multer";

const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: 15 * 1024 * 1024, // 15 MB
		files: 1,
	},
	fileFilter: (req, file, cb) => {
		const allowed = ["application/pdf", "text/plain"];
		if (!allowed.includes(file.mimetype)) {
			return cb(new Error("Only PDF or TXT files allowed"));
		}
		cb(null, true);
	},
}); // Keep file in memory buffer

const dashboardRouter = Router();

// Global-route middleware for all dashboard routes
dashboardRouter.use(requireAuth);
dashboardRouter.use(restrictTo("owner", "admin", "agent"));

// Owners, admins and agents can view the active conversation timelines within their active tenant container
dashboardRouter.get("/conversations", getWorkspaceConversations);

dashboardRouter.patch("/conversations/:conversationId/takeover", humanTakeoverHandler);

// Owners, admins and agents can archive resolved tickets
dashboardRouter.patch("/conversations/:conversationId/close", closeConversation);

// agents can configure their AI settings
dashboardRouter.route("/settings/agent_config").post(agentConfigFull).patch(agentConfigTweak);

//rag documents upload endpoint
dashboardRouter.post("/knowledge/upload_file", upload.single("file"), uploadContextDocs);
dashboardRouter.get("/knowledge/sources/:id", getSourceStatus);

export default dashboardRouter;

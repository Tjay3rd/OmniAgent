import { Router } from "express";
//import { extractSubdomain } from "../middleware/subdomain.middleware.js";
import {
	initializeWidgetCustomer,
	identifyWidgetCustomer,
	getOrCreateConversation,
	getConversationMessages,
	humanTakeoverHandler,
	widgetScript,
} from "../controllers/widget.controller.js";
import { requireAuth, restrictTo } from "../middleware/auth&auth.mid.js";

const widgetRouter = Router();

// Apply the subdomain extractor to all paths inside this router
// Force every single route within this tree to dynamically extract tenant profiles via headers
//widgetRouter.use(extractSubdomain);
// routes/widget.js

const router = Router();

router.get("/script.js", widgetScript);

// Customer Profiling Operations
widgetRouter.post("/customer/init", initializeWidgetCustomer);
widgetRouter.patch("/customer/identify", identifyWidgetCustomer);

// Chat Core Operations
widgetRouter.post("/conversation", getOrCreateConversation);
widgetRouter.get("/:conversationId/messages", getConversationMessages);

// --- PROTECTED INTER-SERVICE ENDPOINTS ---
// The manual AI-mute function requires an agent token, so we place it safely below the guard
widgetRouter.patch(
	"/:conversationId/takeover",
	requireAuth,
	restrictTo("owner", "admin", "agent"),
	humanTakeoverHandler,
);

export default widgetRouter;

import { Router } from "express";
import { extractSubdomain } from "../middleware/subdomain.middleware.js";
import {
	initializeWidgetCustomer,
	identifyWidgetCustomer,
	getOrCreateConversation,
	getConversationMessages,
	humanTakeoverHandler,
} from "../controllers/widget.controller.js";
import { requireAuth } from "../middleware/auth&auth.mid.js";

const widgetRouter = Router();

// Apply the subdomain extractor to all paths inside this router
// Force every single route within this tree to dynamically extract tenant profiles via headers
widgetRouter.use(extractSubdomain);

// Customer Profiling Operations
widgetRouter.post("/customer/init", initializeWidgetCustomer);
widgetRouter.patch("/customer/identify", identifyWidgetCustomer);

// Chat Core Operations
widgetRouter.post("/chat/session", getOrCreateConversation);
widgetRouter.get("/chat/:conversationId/messages", getConversationMessages);

// --- PROTECTED INTER-SERVICE ENDPOINTS ---
// The manual AI-mute function requires an agent token, so we place it safely below the guard
widgetRouter.patch("/chat/:conversationId/takeover", requireAuth, humanTakeoverHandler);

export default widgetRouter;

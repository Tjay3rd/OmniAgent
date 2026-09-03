import { Router } from "express";
import {
	initializeWidgetCustomer,
	identifyWidgetCustomer,
	getOrCreateConversation,
	getConversationMessages,
	humanTakeoverHandler,
	widgetScript,
	getTenantId,
} from "../controllers/widget.controller.js";
import { requireAuth, restrictTo } from "../middleware/auth&auth.mid.js";

const widgetRouter = Router();

widgetRouter.get("/script.js", widgetScript);

// Customer Profiling Operations
widgetRouter.post("/customer/init", initializeWidgetCustomer);
widgetRouter.patch("/customer/identify", identifyWidgetCustomer);

// Chat Core Operations
widgetRouter.post("/conversation", getOrCreateConversation);
widgetRouter.get("/chat/:conversationId/messages", getConversationMessages);

// --- PROTECTED INTER-SERVICE ENDPOINTS ---
// The manual AI-mute function requires an agent token, so we place it safely below the guard
widgetRouter.patch(
	"chat/:conversationId/takeover",
	requireAuth,
	restrictTo("owner", "admin", "agent"),
	humanTakeoverHandler,
);
//get TenantId for widget script
widgetRouter.get("/getTenantId", requireAuth, getTenantId);

export default widgetRouter;

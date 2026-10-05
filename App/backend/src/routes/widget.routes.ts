import { Router } from "express";
import {
	initializeWidgetCustomer,
	identifyWidgetCustomer,
	getOrCreateConversation,
	getConversationMessages,
	widgetScript,
	getTenantId,
} from "../controllers/widget.controller.js";
import { requireAuth } from "../middleware/auth&auth.mid.js";

const widgetRouter = Router();

widgetRouter.get("/script.js", widgetScript);

// Customer Profiling Operations
widgetRouter.post("/customer/init", initializeWidgetCustomer);
widgetRouter.patch("/customer/identify", identifyWidgetCustomer);

// Chat Core Operations
widgetRouter.post("/conversation", getOrCreateConversation);
widgetRouter.get("/chat/:conversationId/messages", getConversationMessages);

// --- PROTECTED INTER-SERVICE ENDPOINTS ---
//get TenantId for widget script
widgetRouter.get("/getTenantId", requireAuth, getTenantId);

export default widgetRouter;

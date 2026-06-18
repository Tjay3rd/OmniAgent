import { Router } from "express";
import { extractSubdomain } from "../middleware/subdomain.middleware.js";
import { initializeWidgetCustomer, identifyWidgetCustomer } from "../controllers/widget.controller.js";
import { getOrCreateConversation, getConversationMessages } from "../controllers/widget.controller.js";

const widgetRouter = Router();

// Apply the subdomain extractor to all paths inside this router
widgetRouter.use(extractSubdomain);

// Force every single route within this tree to dynamically extract tenant profiles via headers
widgetRouter.use(extractSubdomain);

// Customer Profiling Operations
widgetRouter.post("/customer/init", initializeWidgetCustomer);
widgetRouter.patch("/customer/identify", identifyWidgetCustomer);

// Chat Core Operations
widgetRouter.post("/chat/session", getOrCreateConversation);
widgetRouter.get("/chat/:conversationId/messages", getConversationMessages);

export default widgetRouter;

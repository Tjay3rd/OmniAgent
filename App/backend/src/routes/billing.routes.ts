import { getBilling, createCheckoutSession, createBillingPortalSession } from "../controllers/billing.controller.js";
import { requireAuth } from "../middleware/auth&auth.mid.js";
import { Router } from "express";

const billingRouter = Router();

billingRouter.post("/checkout", requireAuth, createCheckoutSession);
billingRouter.post("/portal", requireAuth, createBillingPortalSession);
billingRouter.get("/subscription", requireAuth, getBilling);

export default billingRouter;

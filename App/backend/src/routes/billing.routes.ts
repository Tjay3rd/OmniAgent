import { getBilling, createCheckoutSession, createBillingPortalSession } from "../controllers/billing.controller.js";
import { requireAuth } from "../middleware/auth&auth.mid.js";
import { Router } from "express";

const billingRouter = Router();

billingRouter.use(requireAuth); //JWT Auth middleware

billingRouter.post("/checkout", createCheckoutSession);
billingRouter.post("/portal", createBillingPortalSession);
billingRouter.get("/subscription", getBilling);

export default billingRouter;

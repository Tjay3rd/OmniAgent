import { Router } from "express";
import express from "express";
import { handleStripeWebhook } from "../webhooks/stripe.webhook.js";

const webhookRouter = Router();

// Force raw buffer parsing ONLY for this specific stripe streaming endpoint
webhookRouter.post("/stripe", express.raw({ type: "application/json" }), handleStripeWebhook);

export default webhookRouter;

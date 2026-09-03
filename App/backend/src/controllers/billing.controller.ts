import { Request, Response, NextFunction } from "express";
import Tenant from "../models/tenant.model.js";
import Stripe from "stripe";
import { env } from "../validation/env.zod.js";
import crypto from "node:crypto";

const PLAN_PRICE_MAP: Record<string, string> = {
	starter_monthly: env.STRIPE_PRICE_STARTER,
	pro_monthly: env.STRIPE_PRICE_PRODUCTION,
};
const stripe = new Stripe(env.STRIPE_SECRET_KEY || "");

export const createCheckoutSession = async (req: Request, res: Response, next: NextFunction) => {
	const windowBucket = Math.floor(Date.now() / (5 * 60 * 1000));

	try {
		const { planKey } = req.body;
		const tenantId = req.user?.tenantId;

		if (!planKey || !tenantId) {
			return res.status(400).json({
				message: "Missing priceId or tenant context.",
			});
		}

		const priceId = PLAN_PRICE_MAP[planKey];
		if (!priceId) {
			return res.status(400).json({
				message: "Invalid or unsupported plan provided.",
			});
		}

		const tenant = await Tenant.findById(tenantId);
		if (!tenant) {
			return res.status(404).json({ message: "Tenant not found" });
		}

		const billableStatuses = ["active", "cancelling", "past_due"];
		if (tenant.subscriptionStatus && billableStatuses.includes(tenant.subscriptionStatus)) {
			return res.status(409).json({
				message: "Tenant already has an active subscription. Use the billing portal to manage your subscription.",
			});
		}

		const idempotencyKey = crypto
			.createHash("sha256")
			.update(`checkout:${tenantId}:${priceId}:${windowBucket}`)
			.digest("hex");

		const session = await stripe.checkout.sessions.create(
			{
				mode: "subscription",
				line_items: [{ price: priceId, quantity: 1 }],
				success_url: `${env.FRONTEND_URL}/dashboard/billing?success=true`,
				cancel_url: `${env.FRONTEND_URL}/dashboard/billing?canceled=true`,
				// Reuse existing Stripe customer if we already have one, so repeat purchases don't fragment into duplicate customers
				customer: tenant.stripeCustomerId || undefined,
				metadata: { tenantId },
				subscription_data: {
					metadata: { tenantId },
				},
			},
			{ idempotencyKey },
		);

		res.json({ url: session.url });
	} catch (error) {
		next(error);
	}
};

export const createBillingPortalSession = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const tenant = await Tenant.findById(req.user?.tenantId);

		if (!tenant?.stripeCustomerId) {
			return res.status(400).json({
				message: "No active Stripe customer for this tenant.",
			});
		}

		const session = await stripe.billingPortal.sessions.create({
			customer: tenant.stripeCustomerId,
			return_url: `${env.FRONTEND_URL}/dashboard/billing`,
		});

		res.json({ url: session.url });
	} catch (error) {
		next(error);
	}
};

export const getBilling = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const tenant = await Tenant.findById(req.user?.tenantId).select(
			"subscriptionId subscriptionPriceId subscriptionStatus plan subscriptionPeriodEnd",
		);
		if (!tenant) {
			return res.status(404).json({ message: "Tenant not found" });
		}

		res.json({
			subscriptionId: tenant.subscriptionId ?? null,
			priceId: tenant.subscriptionPriceId ?? null,
			status: tenant.subscriptionStatus ?? "inactive",
			plan: tenant.plan ?? "free",
			currentPeriodEnd: tenant.subscriptionPeriodEnd ?? null,
		});
	} catch (error) {
		next(error);
	}
};

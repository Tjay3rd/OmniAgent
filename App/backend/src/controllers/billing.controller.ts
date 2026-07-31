import { Request, Response, NextFunction } from "express";
import Tenant from "../models/tenant.model.js";
import Stripe from "stripe";
import { env } from "../validation/env.zod.js";

const stripe = new Stripe(env.STRIPE_SECRET_KEY || "");

export const createCheckoutSession = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { priceId } = req.body;
		const tenantId = req.user?.tenantId;

		if (!priceId || !tenantId) {
			return res.status(400).json({
				message: "Missing priceId or tenant context.",
			});
		}

		const tenant = await Tenant.findById(tenantId);
		if (!tenant) {
			return res.status(404).json({ message: "Tenant not found" });
		}

		const session = await stripe.checkout.sessions.create({
			mode: "subscription",
			line_items: [{ price: priceId, quantity: 1 }],
			success_url: `${env.FRONTEND_URL}/billing?success=true`,
			cancel_url: `${env.FRONTEND_URL}/billing?canceled=true`,
			// Reuse existing Stripe customer if we already have one,
			// so repeat purchases don't fragment into duplicate customers
			customer: tenant.stripeCustomerId || undefined,
			metadata: { tenantId },
			subscription_data: {
				metadata: { tenantId },
			},
		});

		res.json({ url: session.url });
	} catch (error) {
		next(error);
	}
};

export const createPortalSession = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const tenant = await Tenant.findById(req.user?.tenantId);

		if (!tenant?.stripeCustomerId) {
			return res.status(400).json({
				message: "No active Stripe customer for this tenant.",
			});
		}

		const session = await stripe.billingPortal.sessions.create({
			customer: tenant.stripeCustomerId,
			return_url: `${env.FRONTEND_URL}/billing`,
		});

		res.json({ url: session.url });
	} catch (error) {
		next(error);
	}
};

export const getBilling = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const tenant = await Tenant.findById(req.user?.tenantId).select(
			"subscriptionId subscriptionPriceId subscriptionStatus subscriptionPeriodEnd",
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

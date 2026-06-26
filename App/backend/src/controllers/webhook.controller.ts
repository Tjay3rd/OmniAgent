import { Request, Response } from "express";
import stripeFramework from "stripe";
import Tenant from "../models/tenant.model.js";
import { env } from "../validation/env.zod.js";
import ProcessedWebhook from "../models/processedWebhook.model.js";

// Initialize Stripe instance with your secure backend environment token
const stripe = new stripeFramework(env.STRIPE_SECRET_KEY || "");
const webhookSecret = env.STRIPE_WEBHOOK_SECRET || "";

export const handleStripeWebhook = async (req: Request, res: Response): Promise<any> => {
	const signature = req.headers["stripe-signature"];

	if (!signature) {
		return res.status(400).json({ error: "Missing Stripe verification signature header." });
	}

	let event: stripeFramework.Event;

	try {
		// CRITICAL: Construct event using the raw unparsed request buffer to verify signature integrity
		event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
	} catch (err: any) {
		console.error(`Webhook Signature Validation Failed: ${err.message}`);
		return res.status(400).send(`Webhook Error: ${err.message}`);
	}

	if (!event.livemode && env.NODE_ENV === "production") {
		return res.status(200).json({ received: true }); // ignore silently
	}

	const existingEvent = await ProcessedWebhook.findOne({ eventId: event.id });

	if (existingEvent?.status === "completed") {
		// Already handled — acknowledge Stripe and bail early
		return res.status(200).json({ received: true });
	}

	// use upsert instead of create so a retry on a "failed" record resets it to "processing" rather than hitting a duplicate-key error (11000).
	try {
		await ProcessedWebhook.findOneAndUpdate(
			{ eventId: event.id },
			{ $set: { provider: "stripe", status: "processing" } },
			{ upsert: true },
		);
	} catch (err: any) {
		if (err.code === 11000) {
			// Race condition: another instance beat us to the upsert. Safe to bail — it will handle this event.
			console.warn(`Idempotency race blocked: ${event.id}`);
			return res.status(200).json({ received: true, duplicate: true });
		}
		throw err; //pass any other database errors up
	}

	// Handle the target subscription lifecycle events
	try {
		switch (event.type) {
			// Case A: A checkout sequence successfully closes (Initial upgrade)
			case "checkout.session.completed": {
				const session = event.data.object as stripeFramework.Checkout.Session;
				const tenantId = session.metadata?.tenantId; // Extract metadata passed during checkout configuration
				const subscriptionId = session.subscription as string;
				const stripeCustomerId = session.customer as string;

				if (tenantId) {
					await Tenant.findByIdAndUpdate(tenantId, {
						$set: {
							subscriptionPeriodStart: new Date(session.created * 1000),
							subscriptionStatus: "active",
							stripeCustomerId,
							subscriptionId: subscriptionId,
						},
					});
				}
				break;
			}

			// Case B: Monthly automated payment clears or updates
			case "customer.subscription.updated": {
				const subscription = event.data.object as stripeFramework.Subscription;
				const stripeCustomerId = subscription.customer as string;

				// Map Stripe status rules straight to database status flags
				const statusMap: Record<string, string> = {
					active: "active",
					trialing: "trialing",
					past_due: "past_due",
					unpaid: "unpaid",
					canceled: "inactive",
					incomplete: "inactive",
					incomplete_expired: "inactive",
				};

				const isCancelingAtPeriodEnd = subscription.status === "active" && subscription.cancel_at_period_end === true;

				const resolvedStatus = isCancelingAtPeriodEnd ? "cancelling" : (statusMap[subscription.status] ?? "inactive");

				await Tenant.findOneAndUpdate(
					{ stripeCustomerId },
					{
						$set: {
							subscriptionStatus: resolvedStatus,
							subscriptionPeriodEnd: subscription.items?.data?.[0]?.current_period_end
								? new Date(subscription.items.data[0].current_period_end * 1000)
								: null,
						},
					},
				);
				break;
			}

			// Case C: The billing window completely drops or closes permanently
			case "customer.subscription.deleted": {
				const subscription = event.data.object as stripeFramework.Subscription;
				const stripeCustomerId = subscription.customer as string;

				await Tenant.findOneAndUpdate(
					{ stripeCustomerId },
					{ $set: { subscriptionStatus: "inactive", subscriptionPeriodEnd: null } },
				);
				break;
			}

			default:
				// Log unhandled hooks quietly so we don't spam errors for events we don't care about
				console.log(`Stripe unhandled operational event received: ${event.type}`);
		}
		await ProcessedWebhook.findOneAndUpdate({ eventId: event.id }, { status: "completed" });
		// Return a clean 200 OK block to acknowledge safe processing receipt to Stripe's servers
		return res.status(200).json({ received: true });
	} catch (dbError) {
		console.error("Database sync failure inside webhook execution:", dbError);

		// FIX: mark as "failed" so Stripe's retry finds no
		// "completed" record and falls through the early-bail
		// check above to reprocess it.
		await ProcessedWebhook.findOneAndUpdate({ eventId: event.id }, { status: "failed" }).catch((markErr) => {
			console.error("Could not mark webhook as failed:", markErr);
		});
		return res.status(500).json({ error: "Internal processing error hook breakdown." });
	}
};

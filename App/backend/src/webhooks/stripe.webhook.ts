import { Request, Response } from "express";
import stripeFramework from "stripe";
import Tenant from "../models/tenant.model.js";
import { env } from "../validation/env.zod.js";
import ProcessedWebhook from "../models/processedWebhook.model.js";
import { Tier } from "../types/customTypes.js";

// Initialize Stripe instance with secure backend environment token
const stripe = new stripeFramework(env.STRIPE_SECRET_KEY || "");
const webhookSecret = env.STRIPE_WEBHOOK_SECRET || "";

export const handleStripeWebhook = async (req: Request, res: Response): Promise<any> => {
	const signature = req.headers["stripe-signature"];

	if (!signature) {
		return res.status(400).json({ error: "Missing Stripe verification signature header." });
	}

	let event: stripeFramework.Event;

	try {
		//Construct event using the raw unparsed request buffer to verify signature integrity
		event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
	} catch (err: any) {
		console.error(`Webhook Signature Validation Failed: ${err.message}`);
		return res.status(400).send(`Webhook Error: ${err.message}`);
	}

	// Lock Stale Threshold: If an event is stuck in 'processing' for > 30s, assume worker died
	const STALE_LOCK_MS = 30_000;
	const now = Date.now();
	const staleThreshold = new Date(now - STALE_LOCK_MS);
	let lockAcquired = false;

	//Step 1 Atomic lock acquisition: Attempt to find and lock the event for processing, ensuring no other worker is handling it concurrently.
	try {
		// Try to acquire the lock if:
		// A) The document does not exist yet (upsert: true)
		// B) The status is 'failed' (retry allowed)
		// C) The status is 'processing' BUT it timed out / went stale (dead worker takeover)
		const doc = await ProcessedWebhook.findOneAndUpdate(
			{
				eventId: event.id,
				$or: [{ status: "failed" }, { status: "processing", lastAttemptAt: { $lt: staleThreshold } }],
			},
			{
				$setOnInsert: { eventType: event.type },
				$set: { status: "processing", lastAttemptAt: new Date(now), errorMessage: null },
			},
			{ upsert: true, new: false },
		);

		// If doc === null, upsert created a brand-new record -> Lock Acquired!
		// If doc exists, query matched one of the $or conditions -> Lock Re-Acquired!
		lockAcquired = true;
	} catch (err: any) {
		// MongoDB code 11000: Query didn't match $or (e.g. status was 'completed' OR 'processing' & active)
		if (err.code === 11000) {
			const existingEvent = await ProcessedWebhook.findOne({ eventId: event.id });

			if (existingEvent?.status === "completed") {
				// Already handled — acknowledge Stripe and bail early
				return res.status(200).json({ received: true });
			}

			if (existingEvent?.status === "processing" && existingEvent.lastAttemptAt > staleThreshold) {
				// Race condition! Another worker is actively processing right now. Return 409 so Stripe waits and retries later when status settles!
				return res.status(409).json({ error: "Event currently processing by another worker" });
			}
		}
		return res.status(500).json({ error: "Database Lock Acquisition Failed" }); //pass any other database errors up
	}

	// Handle the target subscription lifecycle events
	if (lockAcquired) {
		try {
			switch (event.type) {
				// Case A: A checkout sequence successfully closes (Initial upgrade) emmiting 2 events at once: checkout completion and subscription creation.
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

				case "customer.subscription.created": {
					const subscription = event.data.object as stripeFramework.Subscription;
					const tenantId = subscription.metadata?.tenantId; // Extract metadata passed during checkout configuration
					const subscriptionPriceId = subscription.items?.data?.[0]?.price?.id as string;

					if (!tenantId || !subscriptionPriceId)
						throw new Error("Tenant Id and Subscription Price Id are needed to create subscription");

					if (tenantId && subscriptionPriceId) {
						function customerPlan(subscriptionPriceId: string): Tier | null {
							return subscriptionPriceId === env.STRIPE_PRICE_STARTER
								? "starter"
								: subscriptionPriceId === env.STRIPE_PRICE_PRODUCTION
									? "production"
									: null;
						}
						const plan: Tier | null = customerPlan(subscriptionPriceId);

						if (!plan) throw new Error("Price Id doesnt match any known plans");

						await Tenant.findByIdAndUpdate(tenantId, {
							$set: {
								subscriptionPriceId,
								plan,
							},
						});
					}

					break;
				}

				// Case B: Monthly recurring automated payment clears or updates
				case "customer.subscription.updated": {
					const subscription = event.data.object as stripeFramework.Subscription;
					const stripeCustomerId = subscription.customer as string;
					const tenantId = subscription.metadata?.tenantId; // Extract metadata passed during checkout configuration

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

					await Tenant.findOneAndUpdate(tenantId ? { _id: tenantId } : { stripeCustomerId }, {
						$set: {
							subscriptionStatus: resolvedStatus,
							subscriptionPeriodEnd: subscription.items?.data?.[0]?.current_period_end
								? new Date(subscription.items.data[0].current_period_end * 1000)
								: null,
						},
					});
					break;
				}

				// Case C: The billing window completely drops or closes permanently
				case "customer.subscription.deleted": {
					const subscription = event.data.object as stripeFramework.Subscription;
					const stripeCustomerId = subscription.customer as string;

					await Tenant.findOneAndUpdate(
						{ stripeCustomerId },
						{
							$set: {
								subscriptionStatus: "inactive",
								subscriptionPeriodEnd: null,
								subscriptionId: null,
								plan: "free",
							},
						},
					);
					break;
				}

				default:
					// Log unhandled hooks quietly so we don't spam errors for events we don't care about
					console.log(`Stripe unhandled operational event received: ${event.type}`);
			}
			await ProcessedWebhook.updateOne({ eventId: event.id }, { $set: { status: "completed" } });
			// Return a clean 200 OK block to acknowledge safe processing receipt to Stripe's servers
			return res.status(200).json({ received: true });
		} catch (dbError: any) {
			console.error("Database sync failure inside webhook execution:", dbError);
			// mark as "failed" so Stripe's automatic retry finds no "completed" record and falls through the early-bail check above to reprocess it.
			await ProcessedWebhook.updateOne(
				{ eventId: event.id },
				{ $set: { status: "failed", errorMessage: dbError.message } },
			).catch((markErr) => {
				console.error("Could not mark webhook as failed:", markErr);
			});
			return res.status(500).json({ error: "Internal processing error hook breakdown." });
		}
	}
};

import { Request, Response, NextFunction } from "express";
import Customer from "../models/customer.model.js";
import Conversation from "../models/chatConversation.model.js";
import Tenant from "../models/tenant.model.js";
import Message from "../models/chatMessage.model.js";
import jwt from "jsonwebtoken";
import { env } from "../validation/env.zod.js";
import path from "path";

export const initializeWidgetCustomer = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	try {
		const { tenantId, visitorToken } = req.body;

		if (!tenantId) {
			return res.status(400).json({ error: "Missing tenantId." });
		}

		const tenant = await Tenant.findById(tenantId).lean();
		if (!tenant) {
			return res.status(400).json({ error: "Unknown tenant." });
		}

		// Returning visitor — they already carry a token from a previous visit
		if (visitorToken) {
			try {
				const decoded = jwt.verify(visitorToken, env.WIDGET_JWT_SECRET!) as { customerId: string; tenantId: string };

				// Token must actually belong to this tenant — guards against a stale or mismatched token (e.g. widget moved to a different tenant's site)
				if (decoded.tenantId === tenantId) {
					const existingCustomer = await Customer.findOne({
						_id: decoded.customerId,
						tenantId,
					});

					if (existingCustomer) {
						return res.status(200).json({
							message: "Welcome back",
							token: visitorToken,
							customer: existingCustomer,
						});
					}
				}
			} catch {
				// invalid/expired — fall through and provision a fresh anonymous customer
			}
		}

		// New visitor (or the old token no longer resolves to anything)
		const newCustomer = await Customer.create({
			tenantId,
			name: "Anonymous Guest",
		});

		const token = jwt.sign({ customerId: newCustomer._id.toString(), tenantId }, env.WIDGET_JWT_SECRET!, {
			expiresIn: "90d",
		});

		return res.status(201).json({
			message: "Anonymous visitor profile initialized",
			token,
			customer: newCustomer,
		});
	} catch (error) {
		next(error);
	}
};

export const identifyWidgetCustomer = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	try {
		const { visitorToken, email, name, externalId } = req.body;

		if (!visitorToken) {
			return res.status(400).json({ error: "Missing visitor session token." });
		}

		let decoded: { customerId: string; tenantId: string };
		try {
			decoded = jwt.verify(visitorToken, env.WIDGET_JWT_SECRET!) as typeof decoded;
		} catch {
			return res.status(401).json({ error: "Invalid or expired session." });
		}

		const updatedCustomer = await Customer.findOneAndUpdate(
			{ _id: decoded.customerId, tenantId: decoded.tenantId },
			{
				$set: {
					...(email && { email: email.toLowerCase().trim() }),
					...(name && { name: name.trim() }),
					...(externalId && { externalId }),
				},
			},
			{ new: true },
		);

		if (!updatedCustomer) {
			return res.status(404).json({ error: "Customer profile lookup mismatch." });
		}

		return res.status(200).json({
			message: "Customer identity synced successfully",
			customer: updatedCustomer,
		});
	} catch (error) {
		next(error);
	}
};

export const getOrCreateConversation = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	try {
		const { visitorToken } = req.body;

		if (!visitorToken) {
			return res.status(400).json({ error: "Missing visitor session token." });
		}

		let decoded: { customerId: string; tenantId: string };
		try {
			decoded = jwt.verify(visitorToken, env.WIDGET_JWT_SECRET!) as typeof decoded;
		} catch {
			return res.status(401).json({ error: "Invalid or expired session." });
		}

		let conversation = await Conversation.findOne({
			tenantId: decoded.tenantId,
			customerId: decoded.customerId,
		});

		let isNew = false;

		if (!conversation) {
			conversation = await Conversation.create({
				tenantId: decoded.tenantId,
				customerId: decoded.customerId,
				status: "open",
				aiHandled: true,
			});
			isNew = true;
		}

		return res.status(isNew ? 201 : 200).json({
			message: isNew ? "New chat session initialized." : "Active chat session restored.",
			conversation,
		});
	} catch (error) {
		next(error);
	}
};

export const getConversationMessages = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	try {
		const { conversationId } = req.params;
		const { visitorToken } = req.query as { visitorToken?: string };

		if (!visitorToken) {
			return res.status(400).json({ error: "Missing visitor session token." });
		}

		let decoded: { customerId: string; tenantId: string };
		try {
			decoded = jwt.verify(visitorToken, env.WIDGET_JWT_SECRET!) as typeof decoded;
		} catch {
			return res.status(401).json({ error: "Invalid or expired session." });
		}

		// Ownership check — this is the piece that was missing before
		const conversation = await Conversation.findOne({
			_id: conversationId,
			tenantId: decoded.tenantId,
			customerId: decoded.customerId,
		}).lean();

		if (!conversation) {
			return res.status(404).json({ error: "Conversation not found or access denied." });
		}

		const limit = parseInt(req.query.limit as string) || 50;
		const beforeTimestamp = req.query.before ? new Date(req.query.before as string) : null;

		const query: any = { conversationId };
		if (beforeTimestamp) {
			query.createdAt = { $lt: beforeTimestamp };
		}

		const messages = await Message.find(query).sort({ createdAt: -1 }).limit(limit).lean();

		messages.reverse();

		return res.status(200).json({ count: messages.length, messages });
	} catch (error) {
		next(error);
	}
};

export const humanTakeoverHandler = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	try {
		const { conversationId } = req.params;

		// req.user is populated by your requireAuth middleware
		if (!req.user) {
			return res.status(401).json({ error: "Unauthenticated" });
		}

		// Atomically shift control away from the AI to this specific human agent
		const conversation = await Conversation.findOneAndUpdate(
			{ _id: conversationId, tenantId: req.user.tenantId },
			{
				$set: {
					aiHandled: false, // Turn off the AI engine for this chat
					assignedTo: req.user.id, // Lock it to this human agent
				},
			},
			{ new: true }, // Return the updated document
		);

		if (!conversation) {
			return res.status(404).json({ error: "Conversation not found in your workspace." });
		}

		return res.status(200).json({
			message: "AI muted. You have successfully taken control of this conversation.",
			conversation,
		});
	} catch (error) {
		next(error);
	}
};

export const widgetScript = async (req: Request, res: Response) => {
	try {
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.sendFile(path.join(__dirname, "../public/widget.js"));
	} catch (error) {
		res.status(500).send('console.error("Failed to load widget script");');
	}
};

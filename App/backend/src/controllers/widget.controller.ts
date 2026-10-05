import { Request, Response, NextFunction } from "express";
import Customer from "../models/customer.model.js";
import Conversation from "../models/chatConversation.model.js";
import Tenant from "../models/tenant.model.js";
import Message from "../models/chatMessage.model.js";
import jwt from "jsonwebtoken";
import { env } from "../validation/env.zod.js";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth&auth.mid.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const initializeWidgetCustomer = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	try {
		const { tenantId, visitorToken } = req.body;

		if (!tenantId || !mongoose.isValidObjectId(tenantId)) {
			return res.status(400).json({ error: "Missing or invalid tenantId." });
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
						const refreshedToken = jwt.sign(
							{ customerId: existingCustomer._id.toString(), tenantId },
							env.WIDGET_JWT_SECRET!,
							{
								expiresIn: "30d",
							},
						);
						return res.status(200).json({
							message: "Welcome back",
							token: refreshedToken,
							customer: existingCustomer,
						});
					}
				}
			} catch {
				// invalid/expired — fall through and provision a fresh anonymous customer
			}
		}

		// New visitor (or the old token is expired or no longer resolves to anything)
		const newCustomer = await Customer.create({
			tenantId,
			name: "Anonymous Guest",
		});

		const token = jwt.sign({ customerId: newCustomer._id.toString(), tenantId }, env.WIDGET_JWT_SECRET!, {
			expiresIn: "30d",
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

		const allowedDashboardOrigins = new Set(["https://dashboard.example.com", "http://localhost:3000"]);
		const isDashboardRequest: boolean = allowedDashboardOrigins.has(req.headers.origin ?? "");

		if (isDashboardRequest) {
			return await getDashboardMessages(req, res, next);
		}
		return await getVisitorMessages(req, res, next);

		// Helper functions for messages retrieval
		async function getDashboardMessages(req: Request, res: Response, next: NextFunction) {
			try {
				//Authenticate dashboard user first
				const token = req.cookies.accessToken;
				if (!token) {
					return res.status(401).json({ error: "Access token missing" });
				}
				const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as any;
				req.user = {
					id: decoded.id,
					tenantId: decoded.tenantId,
					role: decoded.role,
				};
				if (!req.user) return res.status(401).json({ error: "Session probably expired" });

				//ownership check
				const conversation = await Conversation.findOne({
					_id: conversationId,
					tenantId: req.user?.tenantId,
				}).lean();

				if (!conversation) {
					return res.status(404).json({ error: "Conversation not found or access denied." });
				}

				const messages = await fetchMessagesFromDatabase(req, conversationId);

				return res.status(200).json({ count: messages?.length, messages });
			} catch (error) {
				next(error);
			}
		}
		async function getVisitorMessages(req: Request, res: Response, next: NextFunction) {
			try {
				const visitorToken = req.headers.authorization?.startsWith("Bearer ")
					? req.headers.authorization.slice(7).trim()
					: undefined;

				if (!visitorToken) {
					return res.status(400).json({ error: "Missing visitor session token." });
				}

				let decoded: { customerId: string; tenantId: string };
				try {
					decoded = jwt.verify(visitorToken, env.WIDGET_JWT_SECRET!) as typeof decoded;
				} catch {
					return res.status(401).json({ error: "Invalid or expired session." });
				}

				const conversation = await Conversation.findOne({
					_id: conversationId,
					tenantId: decoded.tenantId,
					customerId: decoded.customerId,
				}).lean();

				if (!conversation) {
					return res.status(404).json({ error: "Conversation not found or access denied." });
				}

				const messages = await fetchMessagesFromDatabase(req, conversationId);

				return res.status(200).json({ count: messages?.length, messages });
			} catch (error) {
				next(error);
			}
		}
		async function fetchMessagesFromDatabase(req: Request, conversationId: string | string[]) {
			const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
			const beforeTimestampParsed = req.query.before ? new Date(req.query.before as string) : null;
			const beforeTimestamp =
				beforeTimestampParsed && !isNaN(beforeTimestampParsed.getTime()) ? beforeTimestampParsed : null;

			const query: any = { conversationId };
			if (beforeTimestamp) {
				query.createdAt = { $lt: beforeTimestamp };
			}

			const messages = await Message.find(query).sort({ createdAt: -1 }).limit(limit).lean();

			messages.reverse();
			return messages;
		}
	} catch (error) {
		next(error);
	}
};

export const widgetScript = async (req: Request, res: Response) => {
	try {
		res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.sendFile(path.join(__dirname, "../public/widget.js"), (error) => {
			if (error) {
				console.error("Failed to load widget script:", error);
				if (!res.headersSent) {
					res.status(500).send('console.error("Failed to load widget script");');
				}
			}
		});
	} catch (error) {
		res.status(500).send('console.error("Failed to load widget script");');
	}
};

export const getTenantId = async (req: Request, res: Response) => {
	const tenantId = req.user?.tenantId;
	if (tenantId) {
		res.status(200).json({ tenantId });
	} else {
		res.status(404).json({ error: "Tenant ID not found" });
	}
};

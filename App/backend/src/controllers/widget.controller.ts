import { Request, Response, NextFunction } from "express";
import Customer from "../models/customer.model.js";
import Conversation from "../models/chatConversation.model.js";
import Message from "../models/chatMessage.model.js";

export const initializeWidgetCustomer = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	try {
		// 1. Ensure the request actually came through a valid tenant subdomain
		if (!req.tenant) {
			return res.status(400).json({ error: "Missing tenant workspace context." });
		}

		const { visitorToken } = req.body;

		// 2. If the user already has a tracked token in localStorage, verify them
		if (visitorToken) {
			const existingCustomer = await Customer.findOne({
				tenantId: req.tenant._id,
				_id: visitorToken, // Using the MongoDB object ID as their browser token
			});

			if (existingCustomer) {
				return res.status(200).json({
					message: "Welcome back",
					customer: existingCustomer,
				});
			}
		}

		// 3. If they are completely new, provision an anonymous record
		const newCustomer = await Customer.create({
			tenantId: req.tenant._id,
			name: "Anonymous Guest",
			// email and externalId are empty for now until they provide them
		});

		// 4. Return the new profile. The widget script saves this ID to localStorage
		return res.status(201).json({
			message: "Anonymous visitor profile initialized",
			visitorToken: newCustomer._id,
			customer: newCustomer,
		});
	} catch (error) {
		next(error);
	}
};

export const identifyWidgetCustomer = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	try {
		if (!req.tenant) {
			return res.status(400).json({ error: "Missing tenant workspace context." });
		}

		const { visitorToken, email, name, externalId } = req.body;

		if (!visitorToken) {
			return res.status(400).json({ error: "Missing visitor identifier token." });
		}

		// Update the record safely inside this tenant's siloed boundaries
		const updatedCustomer = await Customer.findOneAndUpdate(
			{ _id: visitorToken, tenantId: req.tenant._id },
			{
				$set: {
					...(email && { email: email.toLowerCase().trim() }),
					...(name && { name: name.trim() }),
					...(externalId && { externalId }),
				},
			},
			{ new: true }, // Returns the newly modified record
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
		// req.tenant is provided by our extractSubdomain middleware
		if (!req.tenant) {
			return res.status(400).json({ error: "Tenant context missing." });
		}

		const { customerId } = req.body;
		if (!customerId) {
			return res.status(400).json({ error: "Customer identifier required." });
		}

		// Look for an existing open conversation channel for this customer
		let conversation = await Conversation.findOne({
			tenantId: req.tenant._id,
			customerId,
			status: "open",
		});

		let isNew = false;

		// If no open thread exists (first time chatting or past chat was closed), provision a new one
		if (!conversation) {
			conversation = await Conversation.create({
				tenantId: req.tenant._id,
				customerId,
				status: "open",
				aiHandled: true, // System defaults to AI automation out of the gate
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

		// Optional pagination: default to loading the 50 most recent texts
		const limit = parseInt(req.query.limit as string) || 50;
		const beforeTimestamp = req.query.before ? new Date(req.query.before as string) : null;

		// Build query to securely target the single conversation thread
		const query: any = { conversationId };

		// If paginating backward through history, only pull messages older than the current top screen message
		if (beforeTimestamp) {
			query.createdAt = { $lt: beforeTimestamp };
		}

		const messages = await Message.find(query)
			.sort({ createdAt: -1 }) // Get newest first to cleanly limit the payload array size
			.limit(limit)
			.lean(); // Skips Mongoose internal tracking fluff to maximize execution speed

		// Reverse the array slice before returning so the frontend can map over them chronologically
		messages.reverse();

		return res.status(200).json({
			count: messages.length,
			messages,
		});
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

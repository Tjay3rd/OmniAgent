import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import Invite from "../models/invite.model.js";
import User from "../models/user.model.js";
import { signTokenAndSetCookies } from "../lib/jwt.js";
import { v4 as uuidv4 } from "uuid";

export const acceptInviteHandler = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	try {
		const { token, name, password } = req.body;

		// 1. Locate the record inside the database invitation engine
		const invite = await Invite.findOne({ token });
		if (!invite) {
			return res.status(400).json({
				error: "Invitation link is invalid or has already been used.",
			});
		}

		// 2. Perform a redundant verification safety check for expiration limits
		if (invite.expiresAt.getTime() < Date.now()) {
			await invite.deleteOne(); // Purge expired link immediately
			return res.status(400).json({ error: "Invitation link expired." });
		}

		// 3. Hash the onboarding employee's new credentials
		const passwordHash = await bcrypt.hash(password, 12);

		// 4. Create the formal User under the matching tenant business container
		const newUser = await User.create({
			tenantId: invite.tenantId,
			name,
			email: invite.email,
			role: invite.role, // Inherits "admin" or "agent" from the owner's definition
			passwordHash,
		});

		// 5. Instantly clean up and clear out the active invite row record
		await invite.deleteOne();

		// 6. Sign session tokens matching the precise user context
		await signTokenAndSetCookies(res, {
			id: newUser._id.toString(),
			tenantId: newUser.tenantId.toString(),
			role: newUser.role,
		});

		// Convert to plain object to scrub security data keys safely using JavaScript delete
		const cleanedUser = newUser.toObject();
		delete cleanedUser.passwordHash;

		return res.status(201).json({
			message: "Employee profile deployed and workspace session authenticated.",
			user: cleanedUser,
		});
	} catch (error) {
		next(error);
	}
};

export const createInviteHandler = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	try {
		const tenantId = req.user?.tenantId; // Injected via requireAuth middleware
		const { email, role } = req.body;

		if (!email || !role) {
			return res.status(400).json({ error: "Invitee email address and organizational role are required." });
		}

		// 1. Check if a pending invitation already exists for this email within this tenant to avoid duplicates
		const existingInvite = await Invite.findOne({ tenantId, email: email.toLowerCase().trim() });
		if (existingInvite) {
			// If it's expired, clear it out so we can issue a fresh one
			if (existingInvite.expiresAt.getTime() < Date.now()) {
				await existingInvite.deleteOne();
			} else {
				return res.status(409).json({ error: "An active pending invitation has already been sent to this employee." });
			}
		}

		// 2. Generate a secure, unique invitation tracking key
		const uniqueToken = uuidv4();

		// 3. Establish an explicit expiration window (7 days from right now)
		const expirationDate = new Date();
		expirationDate.setDate(expirationDate.getDate() + 7);

		// 4. Save the document into MongoDB
		const newInvite = await Invite.create({
			tenantId,
			email: email.toLowerCase().trim(),
			role,
			token: uniqueToken,
			expiresAt: expirationDate,
		});

		return res.status(201).json({
			message: "Secure invitation record generated successfully.",
			inviteLink: `https://${req.hostname}/invite/accept?token=${uniqueToken}`, // Formatted for your dynamic subdomains
			invite: {
				id: newInvite._id,
				email: newInvite.email,
				role: newInvite.role,
				token: newInvite.token,
				expiresAt: newInvite.expiresAt,
			},
		});
	} catch (error) {
		next(error);
	}
};

import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import Invite from "../models/invite.model.js";
import User from "../models/user.model.js";
import { signTokenAndSetCookies } from "../lib/jwt.js";

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

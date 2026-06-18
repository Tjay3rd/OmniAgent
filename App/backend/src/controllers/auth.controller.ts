import mongoose from "mongoose";
import bcrypt from "bcrypt";
import RefreshToken from "../models/refreshToken.model.js";
import { signAccessToken } from "../lib/jwt.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { signTokenAndSetCookies } from "../lib/jwt.js";
import { Request, Response, NextFunction } from "express";
import User from "../models/user.model.js";
import Tenant from "../models/tenant.model.js";

export const tenantRegistrationHandler = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	const session = await mongoose.startSession();
	try {
		const { companyName, name, email, password, subdomain } = req.body;

		if (!companyName || !name || !email || !password || subdomain) {
			return res.status(400).json({ error: "All fields are required" });
		}

		const existingUser = await User.findOne({ email });
		if (existingUser) {
			return res.status(409).json({ error: "Email already registered" });
		}

		session.startTransaction();
		const [tenant] = await Tenant.create(
			[
				{
					companyName,
					subdomain,
					email, // The billing/contact email for the business
					subscriptionStatus: "incomplete", // Becomes active after Stripe checkout
				},
			],
			{ session },
		);

		const passwordHash = await bcrypt.hash(password, 12);
		const [user] = await User.create(
			[
				{
					tenantId: tenant._id,
					name,
					email,
					role: "owner",
					passwordHash,
				},
			],
			{ session },
		);
		await session.commitTransaction();
		session.endSession();

		await signTokenAndSetCookies(res, {
			id: user._id.toString(),
			tenantId: tenant._id.toString(),
			role: user.role,
		});

		const userResponse = user.toObject();
		delete userResponse.passwordHash;

		res.status(201).json({
			message: "Tenant workspace and owner account created successfully",
			user: userResponse,
			tenant,
		});
	} catch (error) {
		await session.abortTransaction();
		session.endSession();
		next(error);
	}
};

export const loginHandler =
	(Model: any) =>
	async (req: Request, res: Response, next: NextFunction): Promise<any> => {
		try {
			const { email, password } = req.body;

			if (!email || !password) {
				return res.status(400).json({ error: "Email and password are required" });
			}

			const user = await Model.findOne({ email }).select("+passwordHash +loginAttempts +lockoutUntil +lockoutCount");
			const DUMMY_HASH = "$2b$12$KIXQJH8a9rG1ZyYp3v5uOeXl7s6q1Z5j1z5uOeXl7s6q1Z5j1z5u";
			const isValid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

			if (!user || !isValid) {
				if (user) await user.incrementLoginAttempts();
				return res.status(401).json({ error: "Invalid email or password" });
			}

			if (user.lockoutUntil && user.lockoutUntil.getTime() > Date.now()) {
				return res.status(403).json({
					error: "Account temporarily locked.",
					retryAfter: Math.ceil((user.lockoutUntil.getTime() - Date.now()) / 1000),
				});
			}

			await user.resetLoginAttempts();

			await signTokenAndSetCookies(res, {
				id: user._id.toString(),
				tenantId: user.tenantId.toString(),
				role: user.role,
			});

			const userResponse = user.toObject();
			delete userResponse.passwordHash;

			res.status(200).json({ message: "Login successful", user: userResponse });
		} catch (error) {
			next(error);
		}
	};

export const handleTokenRefresh = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	try {
		const oldRefreshToken = req.cookies.refreshToken;
		if (!oldRefreshToken) {
			return res.status(401).json({ error: "Refresh token missing" });
		}

		// 1. Find the token string in MongoDB
		const tokenDoc = await RefreshToken.findOne({ token: oldRefreshToken });

		// BREACH DETECTED (Case 1): Token not in DB but cookie exists?
		// Attacker might be reusing a token from a wiped family.
		if (!tokenDoc) {
			res.clearCookie("accessToken");
			res.clearCookie("refreshToken");
			return res.status(401).json({ error: "Session invalid. Please re-login." });
		}

		// BREACH DETECTED (Case 2): Token exists but is already marked USED.
		// Someone is attempting a replay attack. Nuke the whole family!
		if (tokenDoc.isUsed) {
			await RefreshToken.deleteMany({ familyId: tokenDoc.familyId });
			res.clearCookie("accessToken");
			res.clearCookie("refreshToken");
			return res.status(403).json({
				error: "Security breach detected. All active sessions revoked.",
			});
		}

		// 2. Verify the structural integrity of the JWT token string
		let decoded: any;
		try {
			decoded = jwt.verify(oldRefreshToken, process.env.REFRESH_SECRET as string);
		} catch (err) {
			// If token is expired or altered, clear it out safely
			await tokenDoc.deleteOne();
			return res.status(401).json({ error: "Session expired" });
		}

		// 3. Mark the current token as used immediately
		tokenDoc.isUsed = true;
		await tokenDoc.save();

		// 4. Generate a fresh Token Pair inside the same Family lineage
		const newAccessToken = signAccessToken({
			id: decoded.id,
			tenantId: decoded.tenantId,
			role: decoded.role,
		});

		const newRawRefreshToken = crypto.randomBytes(40).toString("hex");
		const jwtRefreshToken = jwt.sign(
			{ id: decoded.id, tenantId: decoded.tenantId, role: decoded.role },
			process.env.REFRESH_SECRET as string,
			{ expiresIn: "7d" },
		);

		// 5. Store the new child token in the database family tree
		await RefreshToken.create({
			userId: decoded.id,
			tenantId: decoded.tenantId,
			token: jwtRefreshToken,
			familyId: tokenDoc.familyId, // Inherits family pool context
			isUsed: false,
			expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
		});

		// 6. Deploy updated httpOnly cookies safely to browser storage
		res.cookie("accessToken", newAccessToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "strict",
			maxAge: 15 * 60 * 1000, // 15 Minutes
		});

		res.cookie("refreshToken", jwtRefreshToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "strict",
			maxAge: 7 * 24 * 60 * 60 * 1000, // 7 Days
		});

		return res.status(200).json({ status: "Session rotated successfully" });
	} catch (error) {
		next(error);
	}
};

export const handleLogout = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	try {
		const refreshToken = req.cookies.refreshToken;

		// If the browser has a refresh token cookie, pull it out of our database whitelist
		if (refreshToken) {
			await RefreshToken.deleteOne({ token: refreshToken });
		}

		// Clear both httpOnly cookies immediately from the user's browser storage
		res.clearCookie("accessToken", {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "strict",
		});

		res.clearCookie("refreshToken", {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "strict",
		});

		return res.status(200).json({
			message: "Logged out successfully. Session tokens wiped.",
		});
	} catch (error) {
		next(error);
	}
};

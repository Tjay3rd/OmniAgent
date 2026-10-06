import mongoose from "mongoose";
import bcrypt from "bcrypt";
import RefreshToken from "../models/refreshToken.model.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../validation/env.zod.js";
import {
	signTokenAndSetCookies,
	ACCESS_TOKEN_TTL_MS,
	IDLE_WINDOW_MS,
	baseOptions,
	hashToken,
	refreshPath,
} from "../lib/jwt.js";
import { Request, Response, NextFunction } from "express";
import User from "../models/user.model.js";
import Tenant from "../models/tenant.model.js";

export const tenantRegistrationHandler = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	const session = await mongoose.startSession();
	try {
		const ALLOWED_PLANS = ["free", "starter", "production"];

		const { companyName, name, email, password, subdomain } = req.body;

		const plan = ALLOWED_PLANS.includes(req.body.plan) ? req.body.plan : "free"; // safe default

		if (!companyName || !name || !email || !password || !subdomain || !plan) {
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
					email, // The billing/contact email for the business
					subdomain,
					//plan: safePlan, Stripe Webhook is now the single source of truth for all financial data.
					subscriptionStatus: plan === "free" ? "trialing" : "inactive", // Becomes active after Stripe checkout
				},
			],
			{ session },
		);

		const passwordHash = await bcrypt.hash(password, 12);
		const [user] = await User.create(
			[
				{
					tenantId: tenant._id,
					username: name,
					subdomain,
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
		console.log("transaction error", error);
		await session.abortTransaction();
		session.endSession();
		next(error);
		return;
	}
};

export const loginHandler =	(Model: any) => {
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
			return;
		}
	};
};

export const handleTokenRefresh = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	try {
		const oldRefreshToken = req.cookies.refreshToken;
		if (!oldRefreshToken) {
			return res.status(401).json({ error: "Refresh token missing" });
		}

		// 1. Find the token string in MongoDB
		const oldTokenHash = hashToken(oldRefreshToken);
		const tokenDoc = await RefreshToken.findOne({ tokenHash: oldTokenHash });

		// BREACH DETECTED (Case 1): Token not in DB but cookie exists?
		// Attacker might be reusing a token from a wiped family, or simply a fake made up token.
		if (!tokenDoc) {
			res.clearCookie("accessToken", { ...baseOptions, path: "/" });
			res.clearCookie("refreshToken", { ...baseOptions, path: refreshPath });
			return res.status(401).json({ error: "Session invalid. Please re-login." });
		}

		// BREACH DETECTED (Case 2): Token exists but is already marked USED.
		// Someone is attempting a replay attack. Nuke the whole family!
		if (tokenDoc.isUsed) {
			await RefreshToken.deleteMany({ familyId: tokenDoc.familyId });
			res.clearCookie("accessToken", { ...baseOptions, path: "/" });
			res.clearCookie("refreshToken", { ...baseOptions, path: refreshPath });
			return res.status(403).json({
				error: "Security breach detected. All active sessions revoked.",
			});
		}

		const now = Date.now();
		const familyExpiresAt = tokenDoc.familyExpiresAt;
		const tokenExpiresAt = tokenDoc.expiresAt;

		//2. Hard cap check — family has lived its full life
		if (now >= familyExpiresAt.getTime()) {
			await RefreshToken.deleteMany({
				familyId: tokenDoc.familyId,
			});
			res.clearCookie("accessToken", { ...baseOptions, path: "/" });
			res.clearCookie("refreshToken", { ...baseOptions, path: refreshPath });
			return res.status(401).json({
				error: "Session expired. Please re-login.",
			});
		}

		//fallback for when mongo hasnt cleared the expired token yet, but the family is still valid. This is a hard cap on the individual token's life.
		if (now >= tokenExpiresAt.getTime()) {
			await RefreshToken.deleteOne({ _id: tokenDoc._id });
			res.clearCookie("accessToken", { ...baseOptions, path: "/" });
			res.clearCookie("refreshToken", { ...baseOptions, path: refreshPath });
			return res.status(401).json({
				error: "Session expired. Please re-login.",
			});
		}

		let newAccessToken!: string;
		let newRawRefreshToken!: string;
		let breach = false;

		// Sliding idle window, but capped at family ceiling
		const slidingExpiry = now + IDLE_WINDOW_MS;
		const newExpiresAt = new Date(Math.min(slidingExpiry, familyExpiresAt.getTime()));
		const remainingMs = newExpiresAt.getTime() - now;

		const session = await mongoose.startSession();
		try {
			await session.withTransaction(async () => {
				// 3. Mark the current token as used immediately
				const claimedToken = await RefreshToken.findOneAndUpdate(
					{ tokenHash: oldTokenHash, isUsed: false },
					{ $set: { isUsed: true } },
					{ session, new: true },
				);

				if (!claimedToken) {
					// no match: token doesn't exist, or already used — treat as breach
					breach = true;
					const staleToken = await RefreshToken.findOne({
						tokenHash: oldTokenHash,
					}).session(session);

					if (staleToken) {
						await RefreshToken.deleteMany({ familyId: staleToken.familyId }, { session });
					}

					return;
				}

				// 4. Generate a fresh access token.
				newAccessToken = jwt.sign(
					{ id: tokenDoc.userId, tenantId: tokenDoc.tenantId, role: tokenDoc.role },
					env.JWT_ACCESS_SECRET,
					{ expiresIn: ACCESS_TOKEN_TTL_MS / 1000 },
				);

				//5. Generate a fresha opaque refresh token and store it in the DB.
				newRawRefreshToken = crypto.randomBytes(64).toString("hex");
				const newRefreshTokenHash = hashToken(newRawRefreshToken);

				await RefreshToken.create(
					[
						{
							userId: tokenDoc.userId,
							tenantId: tokenDoc.tenantId,
							role: tokenDoc.role,
							tokenHash: newRefreshTokenHash,
							familyId: tokenDoc.familyId,
							familyExpiresAt: familyExpiresAt, // never changes
							isUsed: false,
							expiresAt: newExpiresAt, // slides forward each time
						},
					],
					{ session },
				);
			});
		} finally {
			await session.endSession();
		}

		if (breach) {
			res.clearCookie("accessToken", { ...baseOptions, path: "/" });
			res.clearCookie("refreshToken", { ...baseOptions, path: refreshPath });
			return res.status(403).json({
				error: "Security breach detected. All active sessions revoked.",
			});
		}

		// 6. Deploy updated httpOnly cookies safely to browser storage

		res.cookie("accessToken", newAccessToken, {
			...baseOptions,
			path: "/",
			maxAge: ACCESS_TOKEN_TTL_MS, // 45 Minutes
		});

		res.cookie("refreshToken", newRawRefreshToken, {
			...baseOptions,
			path: refreshPath,
			maxAge: remainingMs,
		});

		return res.status(200).json({ status: "Session rotated successfully" });
	} catch (error) {
		next(error);
	}
};

export const handleLogout = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
	try {
		const refreshToken = req.cookies.refreshToken;
		const { nukeEverywhere } = req.body; // boolean flag from the client

		// If the browser has a refresh token cookie, pull it out of our database whitelist
		if (refreshToken) {
			const tokenDoc = await RefreshToken.findOne({ tokenHash: hashToken(refreshToken) });

			if (tokenDoc) {
				if (nukeEverywhere) {
					await RefreshToken.deleteMany({ userId: tokenDoc.userId });
				} else {
					await RefreshToken.deleteOne({ _id: tokenDoc._id });
				}
			}
		}

		// Clear both httpOnly cookies immediately from the user's browser storage
		res.clearCookie("accessToken", {
			...baseOptions,
			path: "/",
		});

		res.clearCookie("refreshToken", {
			...baseOptions,
			path: refreshPath,
		});

		return res.status(200).json({
			message: nukeEverywhere
				? "Logged out and completely wiped out all sessions altogether."
				: "Logged out of current session and all current session tokens wiped out.",
		});
	} catch (error) {
		next(error);
	}
};

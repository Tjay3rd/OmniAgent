import jwt from "jsonwebtoken";
import { env } from "../validation/env.zod.js";
import { Response } from "express";
import RefreshToken from "../models/refreshToken.model.js";
import { v4 as uuidv4 } from "uuid";

const FAMILY_MAX_MS = 90 * 24 * 60 * 60 * 1000; // 90 day hard cap
const IDLE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const signToken = (payload: Record<string, string>) => {
	const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
	const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
		expiresIn: Math.floor(IDLE_WINDOW_MS / 1000), // 30d
	});
	return { accessToken, refreshToken };
};

export const setTokenCookies = async (res: Response, accessToken: string, refreshToken: string) => {
	const baseOptions = {
		httpOnly: true,
		secure: env.NODE_ENV === "production",
		sameSite: "strict" as const,
	};

	res.cookie("accessToken", accessToken, {
		...baseOptions,
		path: "/",
		maxAge: 15 * 60 * 1000, // 15min.
	});

	res.cookie("refreshToken", refreshToken, {
		...baseOptions,
		path: "/api/refresh",
		maxAge: IDLE_WINDOW_MS, // 30 days (first window)
	});
};

export const signTokenAndSetCookies = async (
	res: Response,
	payload: { id: string; tenantId: string; role: string },
): Promise<void> => {
	const now = Date.now();
	const familyId = uuidv4(); // Unique identifier for this token family lineage.
	const familyExpiresAt = new Date(now + FAMILY_MAX_MS); // hard ceiling.
	const idleExpiresAt = new Date(now + IDLE_WINDOW_MS); // first idle window.

	const { accessToken, refreshToken } = await signToken(payload);
	await setTokenCookies(res, accessToken, refreshToken);

	// Persist the root token of this new family
	await RefreshToken.create({
		userId: payload.id,
		tenantId: payload.tenantId,
		token: refreshToken,
		familyId,
		familyExpiresAt, // never changes for this family
		isUsed: false,
		expiresAt: idleExpiresAt,
	});
};

import jwt from "jsonwebtoken";
import { env } from "../validation/env.zod.js";
import crypto from "crypto";
import { Response } from "express";
import RefreshToken from "../models/refreshToken.model.js";
import { v4 as uuidv4 } from "uuid";

interface CookieOptions {
	httpOnly: boolean;
	secure: boolean;
	sameSite: "none" | "lax";
}

const FAMILY_MAX_MS = 90 * 24 * 60 * 60 * 1000; // 90 day hard cap
export const refreshPath = "/api/admin/refresh"; // The only endpoint that can set the refresh cookie
export const ACCESS_TOKEN_TTL_MS = 45 * 60 * 1000; // 45 minutes
export const IDLE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
export const baseOptions: CookieOptions = {
	httpOnly: true,
	secure: env.NODE_ENV === "production",
	sameSite: env.NODE_ENV === "production" ? "lax" : "none",
	//domain: ".omniagentdeck.top"
};

export const setTokenCookies = async (res: Response, accessToken: string, refreshToken: string) => {
	res.cookie("accessToken", accessToken, {
		...baseOptions,
		path: "/",
		maxAge: ACCESS_TOKEN_TTL_MS, // 45 minutes
	});

	res.cookie("refreshToken", refreshToken, {
		...baseOptions,
		path: refreshPath,
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

	const rawRefreshToken = crypto.randomBytes(64).toString("hex");
	const refreshTokenHash = hashToken(rawRefreshToken);

	const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_TTL_MS / 1000 });

	await RefreshToken.create({
		userId: payload.id,
		tenantId: payload.tenantId,
		role: payload.role,
		tokenHash: refreshTokenHash,
		familyId: familyId,
		familyExpiresAt: familyExpiresAt, // never changes
		isUsed: false,
		expiresAt: idleExpiresAt, // slides forward each time
	});

	await setTokenCookies(res, accessToken, rawRefreshToken);
};

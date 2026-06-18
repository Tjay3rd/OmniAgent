import jwt from "jsonwebtoken";
import { env } from "../validation/env.zod.js";
import { Response } from "express";
import crypto from "crypto";
import RefreshToken from "../models/refreshToken.model.js";

export const signAccessToken = (payload: Record<string, string>) => {
	return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
};

export const signToken = async (payload: Record<string, string>) => {
	const accessToken = signAccessToken(payload);
	const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
	return { accessToken, refreshToken };
};

export const setTokenCookies = async (res: any, refreshToken: string, accessToken: string) => {
	const baseOptions = {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict" as const,
	};

	res.cookie("accessToken", accessToken, {
		...baseOptions,
		path: "/",
		maxAge: 15 * 60 * 1000, // 15 mins
	});

	res.cookie("refreshToken", refreshToken, {
		...baseOptions,
		path: "/api/refresh",
		maxAge: 7 * 24 * 60 * 60 * 1000, // 7d
	});
};

export const signTokenAndSetCookies = async (res: any, payload: Record<string, string>): Promise<void> => {
	const { accessToken, refreshToken } = await signToken(payload);
	await setTokenCookies(res, refreshToken, accessToken);
};

export const loginUserSession = async (res: Response, userPayload: { id: string; tenantId: string; role: string }) => {
	// 1. Sign access token string
	const accessToken = jwt.sign(userPayload, process.env.JWT_SECRET as string, { expiresIn: "15m" });

	// 2. Establish a unique Family tracking group string
	const familyId = crypto.randomUUID();
	const refreshTokenString = jwt.sign(userPayload, process.env.REFRESH_SECRET as string, { expiresIn: "7d" });

	// 3. Persist the seed token row into MongoDB
	await RefreshToken.create({
		userId: userPayload.id,
		tenantId: userPayload.tenantId,
		token: refreshTokenString,
		familyId,
		isUsed: false,
		expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
	});

	// 4. Set both cookies
	res.cookie("accessToken", accessToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict",
		maxAge: 15 * 60 * 1000,
	});

	res.cookie("refreshToken", refreshTokenString, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict",
		maxAge: 7 * 24 * 60 * 60 * 1000,
	});
};

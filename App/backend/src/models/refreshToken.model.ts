import { Schema, model, Document } from "mongoose";

export interface IRefreshToken extends Document {
	userId: Schema.Types.ObjectId;
	tenantId: Schema.Types.ObjectId;
	role: string;
	tokenHash: string;
	familyId: string; // Tracks the "token chain" to detect reuse.
	familyExpiresAt: Date; // Absolute expiration for the entire token family, regardless of sliding window activity.
	isUsed: boolean; // If true, this token should NEVER be presented again.
	expiresAt: Date;
}

const refreshTokenSchema = new Schema<IRefreshToken>({
	userId: {
		type: Schema.Types.ObjectId,
		ref: "User",
		required: true,
	},
	tenantId: {
		type: Schema.Types.ObjectId,
		ref: "Tenant",
		required: true,
	},
	tokenHash: { type: String, required: true, unique: true },
	role: { type: String, required: true },
	familyId: { type: String, required: true },
	isUsed: { type: Boolean, default: false },
	expiresAt: { type: Date, required: true },
	familyExpiresAt: {
		type: Date,
		required: true,
		default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
		expires: 0,
	}, // TTL index, auto-reaps on expiry. Default to 90 days from now.
});

// Automatic cleanup index when token expires
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RefreshToken = model<IRefreshToken>("RefreshToken", refreshTokenSchema);
export default RefreshToken;

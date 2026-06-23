import { Schema, HydratedDocument, model } from "mongoose";
import { loginSecurityPlugin } from "../plugins/loginSecurity.plugin.js";

interface IUser {
	tenantId: Schema.Types.ObjectId;
	username: string;
	subdomain: string;
	email: string;
	role: "owner" | "admin" | "agent";
	passwordHash?: string;
}

const userSchema = new Schema<IUser>(
	{
		tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
		subdomain: { type: String, required: true, trim: true },
		username: { type: String, required: true, trim: true },
		email: { type: String, required: true, trim: true },
		role: { type: String, enum: ["owner", "admin", "agent"], default: "admin" },
		passwordHash: { type: String, required: true, select: false },
	},
	{ timestamps: true },
);

userSchema.index({ tenantId: 1, email: 1 }, { unique: true });

const User = model("User", userSchema);

export type UserModel = HydratedDocument<typeof User>;

userSchema.plugin(loginSecurityPlugin, { maxAttempts: 3 });

export default User;

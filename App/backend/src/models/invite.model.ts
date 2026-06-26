import { Schema, model, HydratedDocument } from "mongoose";

interface IInvite {
	tenantId: Schema.Types.ObjectId;
	email: string;
	role: "admin" | "agent";
	token: string;
	expiresAt: Date;
}

const inviteSchema = new Schema<IInvite>({
	tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
	email: { type: String, required: true, trim: true },
	role: { type: String, enum: ["admin", "agent"], required: true },
	token: { type: String, required: true, unique: true }, // Secure random string
	expiresAt: { type: Date, required: true },
});

// Automatically delete expired invites out of MongoDB after the expiration date
inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
inviteSchema.index({ tenantId: 1, email: 1 }, { unique: true });

const Invite = model<IInvite>("Invite", inviteSchema);

type InviteDocument = HydratedDocument<typeof Invite>;
export default Invite;

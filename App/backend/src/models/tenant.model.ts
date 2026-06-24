import { Schema, HydratedDocument, model } from "mongoose";

interface ITenant {
	companyName: string;
	email: string;
	subdomain: string;
	stripeCustomerId?: string;
	subscriptionId?: string;
	subscriptionStatus: "active" | "trialing" | "past_due" | "unpaid" | "inactive" | "cancelling";
	subscriptionPeriodStart?: Date;
	subscriptionPeriodEnd?: Date;
}

const tenantSchema = new Schema<ITenant>(
	{
		companyName: { type: String, required: true, trim: true },
		email: { type: String, required: true, unique: true, trim: true },
		subdomain: { type: String, required: true, unique: true, lowercase: true, trim: true },
		stripeCustomerId: { type: String, required: true, sparse: true },
		subscriptionId: { type: String },
		subscriptionStatus: {
			type: String,
			enum: ["active", "trialing", "past_due", "unpaid", "inactive", "cancelling"],
			default: "inactive",
		},
		subscriptionPeriodStart: { type: Date },
		subscriptionPeriodEnd: { type: Date },
	},
	{ timestamps: true },
);

const Tenant = model<ITenant>("Tenant", tenantSchema);

export type TenantModel = HydratedDocument<typeof Tenant>;

export default Tenant;

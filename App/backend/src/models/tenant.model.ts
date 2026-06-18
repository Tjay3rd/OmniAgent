import { Schema, HydratedDocument, model } from "mongoose";

interface ITenant {
	companyName: string;
	email: string;
	subdomain: string;
	stripeCustomerId?: string;
	subscriptionId?: string;
	subscriptionStatus: "active" | "incomplete" | "cancelled";
}

const tenantSchema = new Schema<ITenant>(
	{
		companyName: { type: String, required: true, trim: true },
		email: { type: String, required: true, unique: true, trim: true },
		subdomain: { type: String, required: true, unique: true, lowercase: true, trim: true },
		stripeCustomerId: { type: String, required: true, sparse: true },
		subscriptionId: { type: String },
		subscriptionStatus: { type: String, enum: ["active", "incomplete", "cancelled"], default: "incomplete" },
	},
	{ timestamps: true },
);

const Tenant = model("Tenant", tenantSchema);

type TenantModel = HydratedDocument<typeof Tenant>;

export default Tenant;

import { HydratedDocument, Schema, model } from "mongoose";

interface ICustomer {
	tenantId: Schema.Types.ObjectId;
	email: string;
	username: string;
	externalId?: string;
}

const customerSchema = new Schema<ICustomer>(
	{
		tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
		email: { type: String, required: true, lowercase: true, trim: true },
		username: { type: String, required: true, unique: true, trim: true },
		externalId: { type: String, trim: true },
	},
	{ timestamps: true },
);

customerSchema.index({ tenantId: 1, email: 1 });
customerSchema.index({ tenantId: 1, externalId: 1 }, { sparse: true });

const Customer = model("Customer", customerSchema);

type CustomerModel = HydratedDocument<typeof Customer>;

export default Customer;

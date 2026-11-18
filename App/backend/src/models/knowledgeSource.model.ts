import { Schema, model } from "mongoose";

const knowledgeSourceSchema = new Schema(
	{
		tenantId: { type: String, required: true, index: true },
		title: { type: String, required: true },
		status: {
			type: String,
			enum: ["queued", "processing", "ready", "failed"],
			default: "queued",
		},
		chunkCount: { type: Number, default: 0 },
		error: { type: String },
	},
	{ timestamps: true },
);

const KnowledgeSource = model("KnowledgeSource", knowledgeSourceSchema);
export default KnowledgeSource;

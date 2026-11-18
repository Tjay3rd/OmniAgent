import { Schema, model, Types } from "mongoose";

const knowledgeChunkSchema = new Schema(
	{
		tenantId: {
			type: String,
			ref: "Tenant",
			required: true,
			index: true,
		},
		sourceId: {
			type: Schema.Types.ObjectId,
			//later => ref: "DocumentSource",
			required: true,
			index: true,
		},
		title: { type: String, required: true },
		text: { type: String, required: true },
		embedding: { type: [Number], required: true },
		metadata: {
			chunkIndex: { type: Number, required: true },
			indexedAt: { type: Date, required: true, default: Date.now },
		},
	},
	{ timestamps: true, collection: "embeddings" },
);

const KnowledgeChunk = model("KnowledgeChunk", knowledgeChunkSchema);

export default KnowledgeChunk;

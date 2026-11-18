import { embedQuery } from "./embedding.service.js";
import KnowledgeChunk from "../models/chunks.model.js";
import { ragQueryResult } from "../types/customTypes.js";

const MIN_SCORE = 0.7; // Minimum score threshold for relevant chunks

export async function ragQuery(tenantId: string, question: string): Promise<ragQueryResult[]> {
	try {
		// 1. Embed the user's question, returns an array of normalized vectors.
		const queryVector = await embedQuery(question);

		// 2. Search MongoDB Atlas Vector Search for similar chunks
		const relevantChunks = await KnowledgeChunk.aggregate<ragQueryResult>([
			{
				$vectorSearch: {
					index: "new_vector_index",
					path: "embedding",
					queryVector,
					numCandidates: 100,
					limit: 5,
					filter: { tenantId },
				},
			},
			{
				$project: {
					title: 1,
					text: 1,
					score: { $meta: "vectorSearchScore" },
				},
			},
			{ $match: { score: { $gte: MIN_SCORE } } },
		]);

		return relevantChunks;
	} catch (error) {
		console.error("RAG retrieval failed", { tenantId, error });
		return [];
	}
}

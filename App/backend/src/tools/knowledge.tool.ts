// tools/knowledge.tool.ts
import { z } from "zod";
import { register } from "./registry.js";
import { ragQuery } from "../services/ragQuery.service.js";
import { ragQueryResult } from "../types/customTypes.js";

const schema = z.object({ query: z.string().min(3).max(300) }).strict(); // no tenantId, and unknown keys are rejected

register({
	name: "search_knowledge_base",
	description:
		"Search the company's documents. Write a standalone query using the full conversation context, not just the last message.",
	schema,
	async run({ query }, ctx) {
		// tenantId comes from ctx only
		const hits: ragQueryResult[] = await ragQuery(ctx.tenantId, query);
		if (hits.length === 0) {
			return {
				found: false,
				results: [],
				note: "No relevant documents. Do not guess.",
			};
		}
		return {
			found: true,
			results: hits.map((h) => ({
				title: h.title,
				text: h.text.slice(0, 1200),
				score: Number(h.score.toFixed(3)),
			})),
		};
	},
});

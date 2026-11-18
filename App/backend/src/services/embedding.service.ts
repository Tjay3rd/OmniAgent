import { Types } from "mongoose";
import KnowledgeChunk from "../models/chunks.model.js";
import { env } from "../validation/env.zod.js";
import { embed, embedMany } from "ai";
import { createGoogle, GoogleProvider } from "@ai-sdk/google";

const DIMS = 768;
const BATCH_SIZE = 20;
const TOKENS_PER_MINUTE = 25_000; // under the free-tier cap
let embeddingModel: ReturnType<GoogleProvider["embeddingModel"]> | null = null;
const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Rough estimate: about 1.4 tokens per English word
function estimateTokens(texts: string[]) {
	const words = texts.reduce((n, t) => n + countWords(t), 0);
	return Math.ceil(words * 1.4);
}

function getEmbeddingModel() {
	if (!embeddingModel) {
		const apiKey = env.GEMINI_EMBEDDING_API_KEY;
		if (!apiKey) {
			throw new Error("GEMINI_EMBEDDING_API_KEY is not set");
		}
		embeddingModel = createGoogle({ apiKey }).embeddingModel("gemini-embedding-001");
	}
	return embeddingModel;
}

export async function indexDocument(
	tenantId: string,
	sourceId: string,
	title: string,
	content: string,
	onProgress?: (percent: number) => void | Promise<void>,
) {
	// 1. Split content by paragraph into semantic chunks.
	const chunks = splitIntoChunks(content);

	if (chunks.length === 0) throw new Error("No extractable text");
	const sourceObjectId = new Types.ObjectId(sourceId);
	const rows: any[] = [];

	// 2. embed chunks in batches to avoid requests(api calls) rate limits
	for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
		const batch = chunks.slice(i, i + BATCH_SIZE);
		const textsArray = batch.map((chunk) => chunk.text);
		const vectors = await embedBatch(textsArray);
		// match vectors in embedded batch to their corresponding chunks, mapping by index. push everything into rows array until the whole doc is full embedded.
		batch.forEach((chunk, idx) => {
			rows.push({
				tenantId,
				sourceId: sourceObjectId,
				title,
				text: chunk.text,
				embedding: vectors[idx],
				metadata: {
					chunkIndex: chunk.index,
					indexedAt: new Date(),
				},
			});
		});

		await onProgress?.(Math.round(((i + batch.length) / chunks.length) * 100));

		// Pace the next call so we stay under the token budget
		const isLast = i + BATCH_SIZE >= chunks.length;
		if (!isLast) {
			const waitMs = (estimateTokens(textsArray) / TOKENS_PER_MINUTE) * 60_000;
			await sleep(waitMs);
		}
	}

	// 3. finally store the full complete set of embedded chunks in MongoDB
	// Idempotent: a retried job must never leave duplicates behind
	await KnowledgeChunk.deleteMany({
		tenantId,
		sourceId: sourceObjectId,
	});

	await KnowledgeChunk.insertMany(rows);
	return { sourceId, chunkCount: rows.length };
}

export async function embedBatch(texts: string[]) {
	const model = getEmbeddingModel();

	const { embeddings } = await embedMany({
		model,
		values: texts,
		maxParallelCalls: 2,
		maxRetries: 4,
		providerOptions: {
			google: {
				taskType: "RETRIEVAL_DOCUMENT",
				outputDimensionality: DIMS,
			},
		},
	});

	return embeddings.map(finalize);
}

export async function embedQuery(text: string) {
	const model = getEmbeddingModel();

	const { embedding } = await embed({
		model,
		value: text,
		maxRetries: 1,
		providerOptions: {
			google: {
				taskType: "RETRIEVAL_QUERY",
				outputDimensionality: DIMS,
			},
		},
	});

	return finalize(embedding);
}

const wc = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function splitIntoChunks(raw: string, maxWords = 250, overlapWords = 40, minWords = 60) {
	const paragraphs = raw
		.replace(/\r/g, "")
		.split(/\n\s*\n/)
		.map((p) => p.replace(/\s*\n\s*/g, " ").trim())
		.filter(Boolean);

	// Attach short heading-like lines to the paragraph after them
	const blocks: string[] = [];
	let heading = "";
	for (const p of paragraphs) {
		if (wc(p) <= 12 && !/[.!?:]$/.test(p)) {
			heading = heading ? `${heading} ${p}` : p;
			continue;
		}
		blocks.push(heading ? `${heading}\n${p}` : p);
		heading = "";
	}
	if (heading) blocks.push(heading);

	const sentences = blocks.flatMap((b) => b.split(/(?<=[.!?])\s+/));

	// Hard-split any single sentence longer than maxWords
	const units = sentences.flatMap((s) => {
		const w = s.split(/\s+/);
		if (w.length <= maxWords) return [s];
		const parts: string[] = [];
		for (let i = 0; i < w.length; i += maxWords) {
			parts.push(w.slice(i, i + maxWords).join(" "));
		}
		return parts;
	});

	const chunks: string[] = [];
	let cur: string[] = [];
	let curWords = 0;
	let carryLen = 0;

	for (const u of units) {
		const n = wc(u);
		if (curWords + n > maxWords && cur.length > carryLen) {
			chunks.push(cur.join(" "));

			// Carry the last few sentences forward as overlap
			const carry: string[] = [];
			let carried = 0;
			for (let i = cur.length - 1; i >= 0; i--) {
				const cw = wc(cur[i]);
				if (carried + cw > overlapWords) break;
				carry.unshift(cur[i]);
				carried += cw;
			}
			cur = carry;
			curWords = carried;
			carryLen = carry.length;
		}
		cur.push(u);
		curWords += n;
	}

	// Merge an undersized tail into the previous chunk
	const fresh = cur.slice(carryLen);
	if (fresh.length) {
		if (chunks.length && wc(fresh.join(" ")) < minWords) {
			chunks[chunks.length - 1] += " " + fresh.join(" ");
		} else {
			chunks.push(cur.join(" "));
		}
	}

	return chunks.map((text, index) => ({ text, index }));
}

function finalize(v: number[]): number[] {
	if (!v || v.length !== DIMS) {
		throw new Error("Unexpected embedding dimensions");
	}
	const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
	if (mag === 0) throw new Error("Zero-magnitude vector");
	return v.map((x) => x / mag);
}

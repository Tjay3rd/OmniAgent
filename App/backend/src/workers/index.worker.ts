// workers/indexing.worker.ts
import { Worker } from "bullmq";
import { getRedisConnection } from "../config/redis.js";
import { INDEXING_QUEUE, IndexingJobData } from "../queues/indexing.queue.js";
import { indexDocument } from "../services/embedding.service.js";
import KnowledgeSource from "../models/knowledgeSource.model.js";

export function startIndexingWorker() {
	const worker = new Worker<IndexingJobData>(
		INDEXING_QUEUE,
		async (job) => {
			const { tenantId, sourceId, title, text } = job.data;
			// attemptsMade counts attempts finished before this one
			const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

			try {
				await KnowledgeSource.updateOne({ _id: sourceId }, { status: "processing" });

				const { chunkCount } = await indexDocument(tenantId, sourceId, title, text, (percent) =>
					job.updateProgress(percent),
				);

				await KnowledgeSource.updateOne({ _id: sourceId }, { status: "ready", chunkCount });
			} catch (err) {
				if (isLastAttempt) {
					await KnowledgeSource.updateOne(
						{ _id: sourceId },
						{
							status: "failed",
							error: err instanceof Error ? err.message : String(err),
						},
					);
				}
				throw err; // rethrow so BullMQ records it and retries
			}
		},
		{
			connection: getRedisConnection(),
			concurrency: 1, // one document at a time
		},
	);

	worker.on("error", (err) => console.error("Indexing worker error", err));
	return worker;
}

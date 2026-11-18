import { Queue } from "bullmq";
import { getRedisConnection } from "../config/redis.js";

export const INDEXING_QUEUE = "doc-indexing";

export interface IndexingJobData {
	tenantId: string;
	sourceId: string;
	title: string;
	text: string;
}

let queue: Queue<IndexingJobData> | null = null;

function getIndexingQueue() {
	if (!queue) {
		queue = new Queue<IndexingJobData>(INDEXING_QUEUE, {
			connection: getRedisConnection(),
		});
	}
	return queue;
}

export function enqueueIndexing(data: IndexingJobData) {
	return getIndexingQueue().add("index-document", data, {
		jobId: data.sourceId, // the same source can't be queued twice
		attempts: 3,
		backoff: { type: "exponential", delay: 31_000 },
		removeOnComplete: { age: 3600, count: 100 },
		removeOnFail: { age: 24 * 3600 },
	});
}

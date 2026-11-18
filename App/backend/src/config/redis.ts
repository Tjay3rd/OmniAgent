// config/redis.ts
import { Redis } from "ioredis";
import { env } from "../validation/env.zod.js";

let connection: Redis | null = null;

export function getRedisConnection() {
	if (!connection) {
		connection = new Redis(env.REDIS_URL, {
			maxRetriesPerRequest: null, // required by BullMQ workers
		});
	}
	return connection;
}

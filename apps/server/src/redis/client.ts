import { Redis } from "ioredis";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";

export type RedisClient = InstanceType<typeof Redis>;

export function createRedis(config: Config, log: Logger): RedisClient {
  const client = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  client.on("error", (err: unknown) => {
    log.error("redis_client_error", { err: String(err) });
  });

  return client;
}

export async function pingRedis(client: RedisClient): Promise<string> {
  return client.ping();
}

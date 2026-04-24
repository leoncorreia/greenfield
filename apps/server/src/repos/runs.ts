import type { RedisClient } from "../redis/client.js";
import { nanoid } from "nanoid";
import type { RunRecord } from "../models/run.js";
import type { RunState } from "../state-machine.js";
import { keys } from "../redis/keys.js";

export async function createRun(
  redis: RedisClient,
  demandId: string,
  initialState: RunState,
  correlationId?: string,
): Promise<RunRecord> {
  const id = nanoid();
  const cid = correlationId ?? nanoid();
  const now = new Date().toISOString();
  const record: RunRecord = {
    id,
    correlationId: cid,
    demandId,
    state: initialState,
    createdAt: now,
    updatedAt: now,
    artifacts: { candidates: [] },
  };
  await redis.set(keys.run(id), JSON.stringify(record));
  await redis.set(keys.latestRun(), id);
  return record;
}

export async function getRun(redis: RedisClient, id: string): Promise<RunRecord | null> {
  const raw = await redis.get(keys.run(id));
  if (!raw) return null;
  return JSON.parse(raw) as RunRecord;
}

export async function saveRun(redis: RedisClient, record: RunRecord): Promise<void> {
  record.updatedAt = new Date().toISOString();
  await redis.set(keys.run(record.id), JSON.stringify(record));
}

export async function getLatestRunId(redis: RedisClient): Promise<string | null> {
  return redis.get(keys.latestRun());
}

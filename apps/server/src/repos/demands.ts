import type { RedisClient } from "../redis/client.js";
import { nanoid } from "nanoid";
import type { DemandPayload, DemandRecord } from "../models/demand.js";
import { keys } from "../redis/keys.js";

export async function createDemand(redis: RedisClient, payload: DemandPayload): Promise<DemandRecord> {
  const id = nanoid();
  const record: DemandRecord = {
    ...payload,
    id,
    createdAt: new Date().toISOString(),
  };
  await redis.set(keys.demand(id), JSON.stringify(record));
  return record;
}

export async function getDemand(redis: RedisClient, id: string): Promise<DemandRecord | null> {
  const raw = await redis.get(keys.demand(id));
  if (!raw) return null;
  return JSON.parse(raw) as DemandRecord;
}

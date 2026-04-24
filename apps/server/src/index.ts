import "dotenv/config";
import { createServer } from "http";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createRedis, pingRedis } from "./redis/client.js";
import { createApp } from "./app.js";

async function main() {
  const config = loadConfig();
  const log = createLogger(config);
  const redis = createRedis(config, log);
  await redis.connect().catch((e: unknown) => {
    log.error("redis_connect_failed", { err: String(e) });
    process.exit(1);
  });
  await pingRedis(redis);
  log.info("redis_ready", {});

  const orchestratorDeps = { config, log, redis };
  const app = createApp(config, log, redis, orchestratorDeps);
  const server = createServer(app);
  server.listen(config.PORT, () => {
    log.info("server_listening", { port: config.PORT });
  });

  const workerIntervalMs = 60_000;
  setInterval(() => {
    log.info("worker_heartbeat", { intervalMs: workerIntervalMs });
  }, workerIntervalMs);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

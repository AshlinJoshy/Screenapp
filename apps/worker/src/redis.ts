import type { ConnectionOptions } from "bullmq";

// Supports both Upstash (TLS URL) and local Redis
function parseRedisConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;

  if (url) {
    // Upstash or full Redis URL: redis[s]://[[user]:[pass]@]host[:port]
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 6379,
      password: parsed.password || undefined,
      username: parsed.username || undefined,
      tls: parsed.protocol === "rediss:" ? {} : undefined,
    };
  }

  return {
    host: process.env.REDIS_HOST ?? "127.0.0.1",
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  };
}

export const redisConnection = parseRedisConnection();

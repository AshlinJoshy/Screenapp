/**
 * AdScreen Worker Process
 *
 * Runs scheduled and event-driven background jobs:
 *  - Hourly auction (every hour at :00)
 *  - Daily budget reset (every day at 00:00 UTC)
 *  - Creative processing (on-demand, triggered by API)
 */

import { Worker, QueueScheduler } from "bullmq";
import {
  auctionQueue, budgetResetQueue, creativeQueue,
  QUEUE_AUCTION, QUEUE_BUDGET_RESET, QUEUE_CREATIVE,
  JOB_HOURLY_AUCTION, JOB_DAILY_BUDGET_RESET, JOB_PROCESS_CREATIVE,
} from "./queues/index.js";
import { runHourlyAuction } from "./jobs/auction.js";
import { runDailyBudgetReset } from "./jobs/budgetReset.js";
import { processCreative, type CreativeJobData } from "./jobs/creativeProcessor.js";
import { redisConnection } from "./redis.js";

// ─── Validate environment ─────────────────────────────────────────────────────

const required = ["DATABASE_URL"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

console.log("AdScreen Worker starting…");

// ─── Workers ──────────────────────────────────────────────────────────────────

const auctionWorker = new Worker(
  QUEUE_AUCTION,
  async (job) => {
    if (job.name === JOB_HOURLY_AUCTION) await runHourlyAuction(job);
  },
  { connection: redisConnection, concurrency: 1 }
);

const budgetWorker = new Worker(
  QUEUE_BUDGET_RESET,
  async (job) => {
    if (job.name === JOB_DAILY_BUDGET_RESET) await runDailyBudgetReset(job);
  },
  { connection: redisConnection, concurrency: 1 }
);

const creativeWorker = new Worker<CreativeJobData>(
  QUEUE_CREATIVE,
  async (job) => {
    if (job.name === JOB_PROCESS_CREATIVE) await processCreative(job);
  },
  { connection: redisConnection, concurrency: 3 }
);

// ─── Recurring job schedules ──────────────────────────────────────────────────

async function setupSchedules() {
  // Hourly auction — every hour at :00
  await auctionQueue.upsertJobScheduler(
    "hourly-auction-cron",
    { pattern: "0 * * * *" },
    { name: JOB_HOURLY_AUCTION, data: {} }
  );

  // Daily budget reset — every day at 00:00 UTC
  await budgetResetQueue.upsertJobScheduler(
    "daily-budget-reset-cron",
    { pattern: "0 0 * * *" },
    { name: JOB_DAILY_BUDGET_RESET, data: {} }
  );

  console.log("Job schedules registered:");
  console.log("  [auction]     hourly at :00");
  console.log("  [budgetReset] daily  at 00:00 UTC");
  console.log("  [creative]    on-demand (triggered by API)");
}

// ─── Event logging ────────────────────────────────────────────────────────────

for (const [worker, name] of [
  [auctionWorker, "auction"],
  [budgetWorker, "budgetReset"],
  [creativeWorker, "creative"],
] as const) {
  worker.on("completed", (job) => {
    console.log(`[${name}] Job ${job.id} (${job.name}) completed`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[${name}] Job ${job?.id} (${job?.name}) failed:`, err.message);
  });
  worker.on("error", (err) => {
    console.error(`[${name}] Worker error:`, err);
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────

setupSchedules()
  .then(() => console.log("Worker ready"))
  .catch((err) => {
    console.error("Failed to set up schedules:", err);
    process.exit(1);
  });

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown() {
  console.log("Shutting down workers…");
  await Promise.all([
    auctionWorker.close(),
    budgetWorker.close(),
    creativeWorker.close(),
  ]);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

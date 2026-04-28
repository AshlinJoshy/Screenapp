import { Queue } from "bullmq";
import { redisConnection } from "../redis.js";

// ─── Queue names ──────────────────────────────────────────────────────────────
export const QUEUE_AUCTION = "auction";
export const QUEUE_BUDGET_RESET = "budgetReset";
export const QUEUE_CREATIVE = "creative";

// ─── Job name constants ───────────────────────────────────────────────────────
export const JOB_HOURLY_AUCTION = "hourlyAuction";
export const JOB_DAILY_BUDGET_RESET = "dailyBudgetReset";
export const JOB_PROCESS_CREATIVE = "processCreative";

// ─── Queues ───────────────────────────────────────────────────────────────────
export const auctionQueue = new Queue(QUEUE_AUCTION, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});

export const budgetResetQueue = new Queue(QUEUE_BUDGET_RESET, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 100,
    attempts: 3,
    backoff: { type: "exponential", delay: 10000 },
  },
});

export const creativeQueue = new Queue(QUEUE_CREATIVE, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 200,
    removeOnFail: 500,
    attempts: 2,
    backoff: { type: "fixed", delay: 30000 },
  },
});

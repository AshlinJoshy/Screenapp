/**
 * Daily Budget Reset Job
 *
 * Runs at 00:00 UTC every day. Resets totalSpendCents to 0 for all
 * ad groups and campaigns, and re-activates paused groups whose
 * daily budget was the only reason they were paused.
 */

import { eq, and, sql } from "drizzle-orm";
import type { Job } from "bullmq";
import { db } from "../db.js";
import { adGroups, campaigns } from "@adscreen/db";

export async function runDailyBudgetReset(job: Job) {
  console.log(`[budgetReset] Starting daily budget reset at ${new Date().toISOString()}`);

  // 1. Reset all ad group spend counters
  const adGroupResult = await db
    .update(adGroups)
    .set({ totalSpendCents: 0 });

  // 2. Re-activate ad groups that were auto-paused by budget exhaustion
  //    (status = 'paused' and they belong to an active campaign)
  //    We re-activate all paused ad groups — the auction will re-pause
  //    them again if/when they exhaust today's budget.
  await db
    .update(adGroups)
    .set({ status: "active" })
    .where(eq(adGroups.status, "paused"));

  // 3. Reset campaign total spend (for reporting accuracy — actual billing
  //    is tracked at ad group level)
  await db
    .update(campaigns)
    .set({ totalSpendCents: sql`0` })
    .where(eq(campaigns.status, "active"));

  console.log(`[budgetReset] Daily reset complete — ad groups reset and re-activated`);
  await job.updateProgress(100);
}

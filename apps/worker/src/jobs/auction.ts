/**
 * Hourly Auction Job
 *
 * Runs at :00 every hour. For each active screen:
 *  1. Finds all approved, active ad groups targeting it
 *  2. Runs the God Formula auction (computeMarkup + runHourlyAllocation)
 *  3. Writes auction_hourly_results + auction_allocations
 *  4. Updates playlist weights based on new allocations
 *  5. Pauses ad groups that have hit their daily budget
 */

import { eq, and, inArray, sql } from "drizzle-orm";
import type { Job } from "bullmq";
import { db } from "../db.js";
import {
  screens, adGroups, adGroupScreens, auctionHourlyResults,
  auctionAllocations, campaigns, playlists, ads, creatives,
} from "@adscreen/db";
import { computeMarkup } from "../lib/auction.js";
import { generatePlaylist } from "../lib/playlist.js";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveGroup = {
  adGroupId: string;
  adGroupScreenId: string;
  dailyBudgetCents: number;
  totalSpendCents: number;
  impressionDurationSec: number;
  campaignId: string;
};

// ─── Main job handler ─────────────────────────────────────────────────────────

export async function runHourlyAuction(job: Job) {
  const hourBucket = startOfCurrentHour();
  console.log(`[auction] Starting hourly auction for ${hourBucket.toISOString()}`);

  // Fetch all active screens
  const activeScreens = await db
    .select({ id: screens.id, floorCpsCents: screens.floorCpsCents })
    .from(screens)
    .where(eq(screens.isActive, true));

  console.log(`[auction] Processing ${activeScreens.length} active screens`);

  for (const screen of activeScreens) {
    try {
      await processScreen(screen.id, screen.floorCpsCents, hourBucket);
    } catch (err) {
      console.error(`[auction] Failed for screen ${screen.id}:`, err);
      // Continue with other screens — don't fail the whole job
    }
  }

  await job.updateProgress(100);
  console.log(`[auction] Hourly auction complete`);
}

async function processScreen(
  screenId: string,
  floorCpsCents: number,
  hourBucket: Date
) {
  // 1. Find all approved active ad groups targeting this screen
  const rows = await db
    .select({
      adGroupId: adGroupScreens.adGroupId,
      adGroupScreenId: adGroupScreens.id,
      dailyBudgetCents: adGroups.dailyBudgetCents,
      totalSpendCents: adGroups.totalSpendCents,
      impressionDurationSec: adGroups.impressionDurationSec,
      campaignId: adGroups.campaignId,
      adGroupStatus: adGroups.status,
      campaignStatus: campaigns.status,
    })
    .from(adGroupScreens)
    .innerJoin(adGroups, eq(adGroups.id, adGroupScreens.adGroupId))
    .innerJoin(campaigns, eq(campaigns.id, adGroups.campaignId))
    .where(
      and(
        eq(adGroupScreens.screenId, screenId),
        eq(adGroupScreens.approvalStatus, "approved"),
        eq(adGroups.status, "active"),
        eq(campaigns.status, "active")
      )
    );

  if (rows.length === 0) return;

  // 2. Filter out groups that have already hit their daily budget
  const eligible: ActiveGroup[] = rows.filter(
    (r) => r.totalSpendCents < r.dailyBudgetCents
  );

  const n = eligible.length;
  if (n === 0) return;

  // 3. Run God Formula
  const M = computeMarkup(n);
  const effCpsCents = floorCpsCents / (1 - M);

  // Total airtime = 3600 seconds/hour
  const TOTAL_AIRTIME = 3600;

  // Hourly budget per group = dailyBudget / 24 (remaining budget spread over remaining hours)
  // Use remaining budget for a more accurate allocation
  const groups = eligible.map((g) => {
    const remainingBudgetCents = g.dailyBudgetCents - g.totalSpendCents;
    const cpiCents = g.impressionDurationSec * effCpsCents;
    const hourlyBudgetCents = Math.min(
      remainingBudgetCents,
      g.dailyBudgetCents / 24
    );
    const demandedSec = hourlyBudgetCents / effCpsCents;
    return { ...g, cpiCents, demandedSec, hourlyBudgetCents };
  });

  const totalDemandedSec = groups.reduce((s, g) => s + g.demandedSec, 0);
  const isOversubscribed = totalDemandedSec > TOTAL_AIRTIME;

  // 4. Compute allocations
  const allocations = groups.map((g) => {
    const allocatedSec = isOversubscribed
      ? (g.demandedSec / totalDemandedSec) * TOTAL_AIRTIME
      : g.demandedSec;
    const impressionsTarget = Math.floor(allocatedSec / g.impressionDurationSec);
    const hourlySpendCents = Math.floor(impressionsTarget * g.cpiCents);
    const impressionPct = allocatedSec / TOTAL_AIRTIME;
    return { ...g, allocatedSec, impressionsTarget, hourlySpendCents, impressionPct };
  });

  // 5. Compute revenue
  const totalRevenueCents = allocations.reduce((s, a) => s + a.hourlySpendCents, 0);
  const platformRevenueCents = Math.floor(totalRevenueCents * M);
  const ownerRevenueCents = totalRevenueCents - platformRevenueCents;

  // 6. Upsert auction_hourly_results
  const [auctionResult] = await db
    .insert(auctionHourlyResults)
    .values({
      screenId,
      hourBucket,
      nCompetitors: n,
      markupPct: String(M),
      floorCpsCents,
      effCpsCents: String(effCpsCents),
      totalAirtimeAllocSec: Math.floor(Math.min(totalDemandedSec, TOTAL_AIRTIME)),
      totalRevenueCents,
      platformRevenueCents,
      ownerRevenueCents,
    })
    .onConflictDoUpdate({
      target: [auctionHourlyResults.screenId, auctionHourlyResults.hourBucket],
      set: {
        nCompetitors: n,
        markupPct: String(M),
        effCpsCents: String(effCpsCents),
        totalRevenueCents,
        platformRevenueCents,
        ownerRevenueCents,
      },
    })
    .returning({ id: auctionHourlyResults.id });

  // 7. Write allocations
  if (allocations.length > 0) {
    await db.insert(auctionAllocations).values(
      allocations.map((a) => ({
        auctionResultId: auctionResult.id,
        adGroupId: a.adGroupId,
        allocatedSec: String(a.allocatedSec),
        impressionPct: String(a.impressionPct),
        impressionsTarget: a.impressionsTarget,
        cpiCents: String(a.cpiCents),
        hourlySpendCents: a.hourlySpendCents,
      }))
    );
  }

  // 8. Debit spend from ad groups
  for (const a of allocations) {
    await db
      .update(adGroups)
      .set({
        totalSpendCents: sql`total_spend_cents + ${a.hourlySpendCents}`,
      })
      .where(eq(adGroups.id, a.adGroupId));

    // Pause groups that have now hit their daily budget
    const [updated] = await db
      .select({ total: adGroups.totalSpendCents, budget: adGroups.dailyBudgetCents })
      .from(adGroups)
      .where(eq(adGroups.id, a.adGroupId))
      .limit(1);

    if (updated && updated.total >= updated.budget) {
      await db
        .update(adGroups)
        .set({ status: "paused" })
        .where(eq(adGroups.id, a.adGroupId));
      console.log(`[auction] Paused ad group ${a.adGroupId} — daily budget exhausted`);
    }
  }

  // 9. Regenerate playlist for this screen
  await regeneratePlaylist(screenId);

  console.log(`[auction] Screen ${screenId}: ${n} competitors, M=${(M * 100).toFixed(1)}%, revenue=${totalRevenueCents}¢`);
}

// ─── Playlist regeneration ────────────────────────────────────────────────────

async function regeneratePlaylist(screenId: string) {
  // Fetch all ads for approved, active ad groups on this screen
  const adRows = await db
    .select({
      id: ads.id,
      adGroupId: ads.adGroupId,
      creativeId: ads.creativeId,
      name: ads.name,
      weight: ads.weight,
      storageUrl: creatives.storageUrl,
      thumbnailUrl: creatives.thumbnailUrl,
      type: creatives.type,
      status: creatives.status,
    })
    .from(adGroupScreens)
    .innerJoin(adGroups, eq(adGroups.id, adGroupScreens.adGroupId))
    .innerJoin(campaigns, eq(campaigns.id, adGroups.campaignId))
    .innerJoin(ads, eq(ads.adGroupId, adGroups.id))
    .innerJoin(creatives, eq(creatives.id, ads.creativeId))
    .where(
      and(
        eq(adGroupScreens.screenId, screenId),
        eq(adGroupScreens.approvalStatus, "approved"),
        eq(adGroups.status, "active"),
        eq(campaigns.status, "active"),
        eq(ads.status, "active"),
        eq(creatives.status, "ready")
      )
    );

  // Build duration map (adGroupId → impressionDurationSec)
  const groupIds = [...new Set(adRows.map((r) => r.adGroupId))];
  const durationRows =
    groupIds.length > 0
      ? await db
          .select({ id: adGroups.id, impressionDurationSec: adGroups.impressionDurationSec })
          .from(adGroups)
          .where(inArray(adGroups.id, groupIds))
      : [];

  const durationMap = new Map(durationRows.map((r) => [r.id, r.impressionDurationSec]));
  const items = generatePlaylist(adRows, durationMap);

  // Upsert playlist
  const existing = await db
    .select({ id: playlists.id, version: playlists.version })
    .from(playlists)
    .where(eq(playlists.screenId, screenId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(playlists)
      .set({
        jsonBlob: { items },
        generatedAt: new Date(),
        version: existing[0].version + 1,
      })
      .where(eq(playlists.screenId, screenId));
  } else {
    await db.insert(playlists).values({
      screenId,
      jsonBlob: { items },
      version: 1,
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function startOfCurrentHour(): Date {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return now;
}

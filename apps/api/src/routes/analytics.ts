import { Hono } from "hono";
import { eq, and, gte, lte, sum, count, desc } from "drizzle-orm";
import {
  impressions, campaigns, adGroups, screens,
  auctionHourlyResults, auctionAllocations, ads,
} from "@adscreen/db";
import { db } from "../db.js";
import { requireAuth, requireRole, type AuthEnv } from "../middleware/auth.js";

export const analyticsRouter = new Hono<AuthEnv>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function dateRange(query: Record<string, string | undefined>) {
  const since = query.since
    ? new Date(query.since)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // default 30d
  const until = query.until ? new Date(query.until) : new Date();
  return { since, until };
}

// ── Campaign analytics ────────────────────────────────────────────────────────
// GET /api/analytics/campaigns/:id
analyticsRouter.get(
  "/campaigns/:id",
  requireAuth,
  requireRole("advertiser", "admin"),
  async (c) => {
    const user = c.var.user;
    const campaignId = c.req.param("id");
    const { since, until } = dateRange(c.req.query() as Record<string, string>);

    // Verify ownership (advertisers can only see their own)
    if (user.role === "advertiser") {
      const [campaign] = await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(and(eq(campaigns.id, campaignId), eq(campaigns.advertiserId, user.sub)))
        .limit(1);
      if (!campaign) return c.json({ error: "Campaign not found" }, 404);
    }

    // Impression totals
    const [impStats] = await db
      .select({
        totalImpressions: count(impressions.id),
        totalSpendCents: sum(impressions.costCents),
      })
      .from(impressions)
      .where(
        and(
          eq(impressions.campaignId, campaignId),
          gte(impressions.playedAt, since),
          lte(impressions.playedAt, until)
        )
      )
      .limit(1);

    // Per ad group breakdown
    const groupStats = await db
      .select({
        adGroupId: impressions.adGroupId,
        adGroupName: adGroups.name,
        impressionCount: count(impressions.id),
        spendCents: sum(impressions.costCents),
      })
      .from(impressions)
      .innerJoin(adGroups, eq(adGroups.id, impressions.adGroupId))
      .where(
        and(
          eq(impressions.campaignId, campaignId),
          gte(impressions.playedAt, since),
          lte(impressions.playedAt, until)
        )
      )
      .groupBy(impressions.adGroupId, adGroups.name);

    // Daily impression trend (last 30 rows max)
    const daily = await db
      .select({
        impressionCount: count(impressions.id),
        spendCents: sum(impressions.costCents),
      })
      .from(impressions)
      .where(
        and(
          eq(impressions.campaignId, campaignId),
          gte(impressions.playedAt, since),
          lte(impressions.playedAt, until)
        )
      )
      .limit(30);

    return c.json({
      campaignId,
      period: { since: since.toISOString(), until: until.toISOString() },
      totals: {
        impressions: Number(impStats?.totalImpressions ?? 0),
        spendCents: Number(impStats?.totalSpendCents ?? 0),
      },
      adGroups: groupStats.map((g) => ({
        adGroupId: g.adGroupId,
        adGroupName: g.adGroupName,
        impressions: Number(g.impressionCount),
        spendCents: Number(g.spendCents ?? 0),
      })),
      daily,
    });
  }
);

// ── Ad group analytics ────────────────────────────────────────────────────────
// GET /api/analytics/ad-groups/:id
analyticsRouter.get(
  "/ad-groups/:id",
  requireAuth,
  requireRole("advertiser", "admin"),
  async (c) => {
    const user = c.var.user;
    const groupId = c.req.param("id");
    const { since, until } = dateRange(c.req.query() as Record<string, string>);

    // Verify ownership
    if (user.role === "advertiser") {
      const [group] = await db
        .select({ campaignId: adGroups.campaignId })
        .from(adGroups)
        .where(eq(adGroups.id, groupId))
        .limit(1);
      if (!group) return c.json({ error: "Ad group not found" }, 404);

      const [campaign] = await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(and(eq(campaigns.id, group.campaignId), eq(campaigns.advertiserId, user.sub)))
        .limit(1);
      if (!campaign) return c.json({ error: "Access denied" }, 403);
    }

    const [totals] = await db
      .select({
        totalImpressions: count(impressions.id),
        totalSpendCents: sum(impressions.costCents),
      })
      .from(impressions)
      .where(
        and(
          eq(impressions.adGroupId, groupId),
          gte(impressions.playedAt, since),
          lte(impressions.playedAt, until)
        )
      )
      .limit(1);

    // Per-ad breakdown
    const adStats = await db
      .select({
        adId: impressions.adId,
        impressionCount: count(impressions.id),
        spendCents: sum(impressions.costCents),
      })
      .from(impressions)
      .where(
        and(
          eq(impressions.adGroupId, groupId),
          gte(impressions.playedAt, since),
          lte(impressions.playedAt, until)
        )
      )
      .groupBy(impressions.adId);

    // Latest auction allocation for this group
    const latestAllocation = await db
      .select({
        allocatedSec: auctionAllocations.allocatedSec,
        impressionPct: auctionAllocations.impressionPct,
        impressionsTarget: auctionAllocations.impressionsTarget,
        cpiCents: auctionAllocations.cpiCents,
        hourBucket: auctionHourlyResults.hourBucket,
      })
      .from(auctionAllocations)
      .innerJoin(
        auctionHourlyResults,
        eq(auctionHourlyResults.id, auctionAllocations.auctionResultId)
      )
      .where(eq(auctionAllocations.adGroupId, groupId))
      .orderBy(desc(auctionHourlyResults.hourBucket))
      .limit(1);

    return c.json({
      adGroupId: groupId,
      period: { since: since.toISOString(), until: until.toISOString() },
      totals: {
        impressions: Number(totals?.totalImpressions ?? 0),
        spendCents: Number(totals?.totalSpendCents ?? 0),
      },
      ads: adStats.map((a) => ({
        adId: a.adId,
        impressions: Number(a.impressionCount),
        spendCents: Number(a.spendCents ?? 0),
      })),
      latestAuction: latestAllocation[0] ?? null,
    });
  }
);

// ── Screen analytics (owner) ──────────────────────────────────────────────────
// GET /api/analytics/screens/:id
analyticsRouter.get(
  "/screens/:id",
  requireAuth,
  requireRole("owner", "admin"),
  async (c) => {
    const user = c.var.user;
    const screenId = c.req.param("id");
    const { since, until } = dateRange(c.req.query() as Record<string, string>);

    // Verify ownership
    if (user.role === "owner") {
      const [screen] = await db
        .select({ id: screens.id })
        .from(screens)
        .where(and(eq(screens.id, screenId), eq(screens.ownerId, user.sub)))
        .limit(1);
      if (!screen) return c.json({ error: "Screen not found" }, 404);
    }

    // Total impressions served on this screen
    const [impStats] = await db
      .select({
        totalImpressions: count(impressions.id),
      })
      .from(impressions)
      .where(
        and(
          eq(impressions.screenId, screenId),
          gte(impressions.playedAt, since),
          lte(impressions.playedAt, until)
        )
      )
      .limit(1);

    // Revenue from auction results
    const [revenueStats] = await db
      .select({
        totalRevenueCents: sum(auctionHourlyResults.totalRevenueCents),
        ownerRevenueCents: sum(auctionHourlyResults.ownerRevenueCents),
        platformRevenueCents: sum(auctionHourlyResults.platformRevenueCents),
      })
      .from(auctionHourlyResults)
      .where(
        and(
          eq(auctionHourlyResults.screenId, screenId),
          gte(auctionHourlyResults.hourBucket, since),
          lte(auctionHourlyResults.hourBucket, until)
        )
      )
      .limit(1);

    // Competition trend (competitor count per hour, last 24 buckets)
    const competitionTrend = await db
      .select({
        hourBucket: auctionHourlyResults.hourBucket,
        nCompetitors: auctionHourlyResults.nCompetitors,
        markupPct: auctionHourlyResults.markupPct,
        effCpsCents: auctionHourlyResults.effCpsCents,
        ownerRevenueCents: auctionHourlyResults.ownerRevenueCents,
      })
      .from(auctionHourlyResults)
      .where(
        and(
          eq(auctionHourlyResults.screenId, screenId),
          gte(auctionHourlyResults.hourBucket, since),
          lte(auctionHourlyResults.hourBucket, until)
        )
      )
      .orderBy(desc(auctionHourlyResults.hourBucket))
      .limit(24);

    return c.json({
      screenId,
      period: { since: since.toISOString(), until: until.toISOString() },
      totals: {
        impressionsServed: Number(impStats?.totalImpressions ?? 0),
        grossRevenueCents: Number(revenueStats?.totalRevenueCents ?? 0),
        ownerRevenueCents: Number(revenueStats?.ownerRevenueCents ?? 0),
        platformRevenueCents: Number(revenueStats?.platformRevenueCents ?? 0),
      },
      competitionTrend: competitionTrend.map((r) => ({
        hourBucket: r.hourBucket,
        nCompetitors: r.nCompetitors,
        markupPct: Number(r.markupPct),
        effCpsCents: Number(r.effCpsCents),
        ownerRevenueCents: r.ownerRevenueCents,
      })),
    });
  }
);

// ── Platform analytics (admin) ────────────────────────────────────────────────
// GET /api/analytics/platform
analyticsRouter.get(
  "/platform",
  requireAuth,
  requireRole("admin"),
  async (c) => {
    const { since, until } = dateRange(c.req.query() as Record<string, string>);

    const [impStats] = await db
      .select({ totalImpressions: count(impressions.id) })
      .from(impressions)
      .where(
        and(
          gte(impressions.playedAt, since),
          lte(impressions.playedAt, until)
        )
      )
      .limit(1);

    const [revenueStats] = await db
      .select({
        totalRevenueCents: sum(auctionHourlyResults.totalRevenueCents),
        platformRevenueCents: sum(auctionHourlyResults.platformRevenueCents),
        ownerRevenueCents: sum(auctionHourlyResults.ownerRevenueCents),
      })
      .from(auctionHourlyResults)
      .where(
        and(
          gte(auctionHourlyResults.hourBucket, since),
          lte(auctionHourlyResults.hourBucket, until)
        )
      )
      .limit(1);

    // Top earning screens
    const topScreens = await db
      .select({
        screenId: auctionHourlyResults.screenId,
        screenName: screens.name,
        ownerRevenue: sum(auctionHourlyResults.ownerRevenueCents),
        platformRevenue: sum(auctionHourlyResults.platformRevenueCents),
      })
      .from(auctionHourlyResults)
      .innerJoin(screens, eq(screens.id, auctionHourlyResults.screenId))
      .where(
        and(
          gte(auctionHourlyResults.hourBucket, since),
          lte(auctionHourlyResults.hourBucket, until)
        )
      )
      .groupBy(auctionHourlyResults.screenId, screens.name)
      .orderBy(desc(sum(auctionHourlyResults.totalRevenueCents)))
      .limit(10);

    return c.json({
      period: { since: since.toISOString(), until: until.toISOString() },
      totals: {
        impressions: Number(impStats?.totalImpressions ?? 0),
        grossRevenueCents: Number(revenueStats?.totalRevenueCents ?? 0),
        platformRevenueCents: Number(revenueStats?.platformRevenueCents ?? 0),
        ownerRevenueCents: Number(revenueStats?.ownerRevenueCents ?? 0),
      },
      topScreens: topScreens.map((s) => ({
        screenId: s.screenId,
        screenName: s.screenName,
        ownerRevenueCents: Number(s.ownerRevenue ?? 0),
        platformRevenueCents: Number(s.platformRevenue ?? 0),
      })),
    });
  }
);

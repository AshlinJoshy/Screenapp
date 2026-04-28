import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, gte, lte } from "drizzle-orm";
import { screens, auctionHourlyResults, adGroupScreens, adGroups } from "@adscreen/db";
import { db } from "../db.js";
import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import { previewBid, computeMarkup, computeEffCps } from "../services/auction.js";

export const pricingRouter = new Hono<AuthEnv>();

// GET /api/screens/:id/pricing — live CPI estimate for a screen
pricingRouter.get(
  "/screens/:id/pricing",
  requireAuth,
  async (c) => {
    const screenId = c.req.param("id");

    const [screen] = await db
      .select({
        id: screens.id,
        floorCpsCents: screens.floorCpsCents,
        name: screens.name,
      })
      .from(screens)
      .where(and(eq(screens.id, screenId), eq(screens.isActive, true)))
      .limit(1);

    if (!screen) {
      return c.json({ error: "Screen not found" }, 404);
    }

    // Count current active competitors (approved ad groups targeting this screen)
    const competitors = await db
      .select({ id: adGroupScreens.adGroupId })
      .from(adGroupScreens)
      .innerJoin(adGroups, eq(adGroupScreens.adGroupId, adGroups.id))
      .where(
        and(
          eq(adGroupScreens.screenId, screenId),
          eq(adGroupScreens.approvalStatus, "approved"),
          eq(adGroups.status, "active")
        )
      )
      .limit(500);

    const n = competitors.length;
    const markupPct = computeMarkup(n);
    const effCpsCents = computeEffCps(screen.floorCpsCents, n);

    // Pre-compute CPI for common durations
    const commonDurations = [5, 10, 15, 30, 60, 90, 120];
    const estimatedCpiCents: Record<number, number> = {};
    for (const d of commonDurations) {
      estimatedCpiCents[d] = Math.round(d * effCpsCents * 100) / 100;
    }

    return c.json({
      screenId,
      floorCpsCents: screen.floorCpsCents,
      nCurrentCompetitors: n,
      markupPct,
      effCpsCents,
      estimatedCpiCents,
    });
  }
);

// POST /api/auction/preview — simulate impression% for a given budget
pricingRouter.post(
  "/auction/preview",
  requireAuth,
  zValidator(
    "json",
    z.object({
      screenId: z.string().uuid(),
      impressionDurationSec: z.number().int().min(5).max(300),
      dailyBudgetCents: z.number().int().positive(),
    })
  ),
  async (c) => {
    const body = c.req.valid("json");

    const [screen] = await db
      .select({ id: screens.id, floorCpsCents: screens.floorCpsCents })
      .from(screens)
      .where(and(eq(screens.id, body.screenId), eq(screens.isActive, true)))
      .limit(1);

    if (!screen) {
      return c.json({ error: "Screen not found" }, 404);
    }

    const competitors = await db
      .select({ id: adGroupScreens.adGroupId })
      .from(adGroupScreens)
      .innerJoin(adGroups, eq(adGroupScreens.adGroupId, adGroups.id))
      .where(
        and(
          eq(adGroupScreens.screenId, body.screenId),
          eq(adGroupScreens.approvalStatus, "approved"),
          eq(adGroups.status, "active")
        )
      )
      .limit(500);

    const preview = previewBid(
      screen.floorCpsCents,
      competitors.length,
      body.impressionDurationSec,
      body.dailyBudgetCents
    );

    return c.json(preview);
  }
);

// GET /api/screens/:id/pricing/history — price history
pricingRouter.get(
  "/screens/:id/pricing/history",
  requireAuth,
  async (c) => {
    const screenId = c.req.param("id");
    const days = Math.min(Number(c.req.query("days") ?? 30), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const history = await db
      .select({
        hourBucket: auctionHourlyResults.hourBucket,
        nCompetitors: auctionHourlyResults.nCompetitors,
        markupPct: auctionHourlyResults.markupPct,
        effCpsCents: auctionHourlyResults.effCpsCents,
        totalRevenueCents: auctionHourlyResults.totalRevenueCents,
      })
      .from(auctionHourlyResults)
      .where(
        and(
          eq(auctionHourlyResults.screenId, screenId),
          gte(auctionHourlyResults.hourBucket, since)
        )
      )
      .limit(days * 24);

    return c.json(history);
  }
);

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { screens, playlists, impressions, ads, adGroups } from "@adscreen/db";
import { db } from "../db.js";
import type { PlaylistResponse } from "@adscreen/types";

type PlayerEnv = {
  Variables: {
    screen: { id: string; ownerId: string };
  };
};

// ─── API Key middleware ───────────────────────────────────────────────────────

async function requireApiKey(c: any, next: any) {
  const apiKey = c.req.header("X-Api-Key");
  if (!apiKey) {
    return c.json({ error: "Missing X-Api-Key header" }, 401);
  }

  const [screen] = await db
    .select({ id: screens.id, ownerId: screens.ownerId, isActive: screens.isActive })
    .from(screens)
    .where(eq(screens.apiKey, apiKey))
    .limit(1);

  if (!screen || !screen.isActive) {
    return c.json({ error: "Invalid or inactive API key" }, 401);
  }

  c.set("screen", screen);
  await next();
}

export const playerRouter = new Hono<PlayerEnv>();

// ─── GET /api/player/playlist ─────────────────────────────────────────────────

playerRouter.get("/playlist", requireApiKey, async (c) => {
  const screen = c.var.screen;

  const [playlist] = await db
    .select({
      jsonBlob: playlists.jsonBlob,
      generatedAt: playlists.generatedAt,
      version: playlists.version,
    })
    .from(playlists)
    .where(eq(playlists.screenId, screen.id))
    .limit(1);

  const response: PlaylistResponse = {
    screenId: screen.id,
    generatedAt: playlist?.generatedAt?.toISOString() ?? new Date().toISOString(),
    version: playlist?.version ?? 0,
    items: (playlist?.jsonBlob as any)?.items ?? [],
  };

  return c.json(response);
});

// ─── POST /api/player/heartbeat ───────────────────────────────────────────────

const heartbeatSchema = z.object({
  playerVersion: z.string().default("unknown"),
  currentAdId: z.string().uuid().optional(),
  impressions: z
    .array(
      z.object({
        adId: z.string().uuid(),
        adGroupId: z.string().uuid(),
        campaignId: z.string().uuid(),
        playedAt: z.string().datetime(),
        durationSec: z.number().positive(),
        completed: z.boolean(),
      })
    )
    .default([]),
});

playerRouter.post(
  "/heartbeat",
  requireApiKey,
  zValidator("json", heartbeatSchema),
  async (c) => {
    const screen = c.var.screen;
    const body = c.req.valid("json");

    // Update screen heartbeat and set online
    await db
      .update(screens)
      .set({
        lastHeartbeat: new Date(),
        status: "online",
      })
      .where(eq(screens.id, screen.id));

    // Record impressions if any
    if (body.impressions.length > 0) {
      // Calculate cost per impression for each
      const impressionValues = await Promise.all(
        body.impressions.map(async (imp) => {
          // Look up CPI for this ad group (simplified: use floor price × duration)
          const [adGroup] = await db
            .select({
              impressionDurationSec: adGroups.impressionDurationSec,
            })
            .from(adGroups)
            .where(eq(adGroups.id, imp.adGroupId))
            .limit(1);

          return {
            screenId: screen.id,
            adId: imp.adId,
            adGroupId: imp.adGroupId,
            campaignId: imp.campaignId,
            playedAt: new Date(imp.playedAt),
            durationSec: imp.durationSec.toString(),
            completed: imp.completed,
            costCents: 0, // Set by auction worker; player reports, worker prices
          };
        })
      );

      await db.insert(impressions).values(impressionValues);

      // Update ad impression counts
      for (const imp of body.impressions) {
        if (imp.completed) {
          await db
            .update(ads)
            .set({ impressionsCount: (await db
              .select({ count: ads.impressionsCount })
              .from(ads)
              .where(eq(ads.id, imp.adId))
              .limit(1)
              .then(r => (r[0]?.count ?? 0) + 1)) })
            .where(eq(ads.id, imp.adId));
        }
      }
    }

    // Get current playlist version
    const [playlist] = await db
      .select({ version: playlists.version })
      .from(playlists)
      .where(eq(playlists.screenId, screen.id))
      .limit(1);

    return c.json({
      success: true,
      nextCheckInSec: 1800, // 30 min
      playlistVersion: playlist?.version ?? 0,
    });
  }
);

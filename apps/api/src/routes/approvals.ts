import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import {
  adGroupScreens,
  adGroups,
  screens,
  campaigns,
  ads,
  creatives,
  playlists,
} from "@adscreen/db";
import { db } from "../db.js";
import { requireAuth, requireRole, type AuthEnv } from "../middleware/auth.js";
import { generatePlaylist } from "../services/playlist.js";

const reviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  notes: z.string().max(1000).optional(),
});

export const approvalsRouter = new Hono<AuthEnv>();

// GET /api/approvals — list pending approvals for owner's screens
approvalsRouter.get(
  "/",
  requireAuth,
  requireRole("owner", "admin"),
  async (c) => {
    const user = c.var.user;
    const isAdmin = user.role === "admin";

    // Get screens this owner manages (or all screens for admin)
    const ownerScreens = isAdmin
      ? await db.select({ id: screens.id }).from(screens).limit(1000)
      : await db
          .select({ id: screens.id })
          .from(screens)
          .where(eq(screens.ownerId, user.sub))
          .limit(200);

    if (ownerScreens.length === 0) {
      return c.json([]);
    }

    const screenIds = ownerScreens.map((s) => s.id);

    // Get all pending approval requests for these screens
    const approvalRows = await db
      .select({
        id: adGroupScreens.id,
        adGroupId: adGroupScreens.adGroupId,
        screenId: adGroupScreens.screenId,
        approvalStatus: adGroupScreens.approvalStatus,
        approvalNotes: adGroupScreens.approvalNotes,
        reviewedAt: adGroupScreens.reviewedAt,
        createdAt: adGroupScreens.createdAt,
        screenName: screens.name,
        adGroupName: adGroups.name,
        impressionDurationSec: adGroups.impressionDurationSec,
        dailyBudgetCents: adGroups.dailyBudgetCents,
        campaignId: adGroups.campaignId,
      })
      .from(adGroupScreens)
      .innerJoin(screens, eq(adGroupScreens.screenId, screens.id))
      .innerJoin(adGroups, eq(adGroupScreens.adGroupId, adGroups.id))
      .where(
        and(
          inArray(adGroupScreens.screenId, screenIds),
          eq(adGroupScreens.approvalStatus, "pending")
        )
      )
      .limit(200);

    return c.json(approvalRows);
  }
);

// PATCH /api/approvals/:id — approve or reject
approvalsRouter.patch(
  "/:id",
  requireAuth,
  requireRole("owner", "admin"),
  zValidator("json", reviewSchema),
  async (c) => {
    const user = c.var.user;
    const approvalId = c.req.param("id");
    const body = c.req.valid("json");
    const isAdmin = user.role === "admin";

    // Get the approval record with screen info
    const [approval] = await db
      .select({
        id: adGroupScreens.id,
        adGroupId: adGroupScreens.adGroupId,
        screenId: adGroupScreens.screenId,
        approvalStatus: adGroupScreens.approvalStatus,
        ownerId: screens.ownerId,
      })
      .from(adGroupScreens)
      .innerJoin(screens, eq(adGroupScreens.screenId, screens.id))
      .where(eq(adGroupScreens.id, approvalId))
      .limit(1);

    if (!approval) {
      return c.json({ error: "Approval not found" }, 404);
    }

    if (!isAdmin && approval.ownerId !== user.sub) {
      return c.json({ error: "Access denied" }, 403);
    }

    // Update the approval record
    const [updated] = await db
      .update(adGroupScreens)
      .set({
        approvalStatus: body.status,
        approvalNotes: body.notes,
        reviewedBy: user.sub,
        reviewedAt: new Date(),
      })
      .where(eq(adGroupScreens.id, approvalId))
      .returning();

    // If approved, regenerate the playlist for this screen
    if (body.status === "approved") {
      await regeneratePlaylistForScreen(approval.screenId);
      // TODO: Send Pusher notification to player
    }

    return c.json(updated);
  }
);

// ─── Playlist Regeneration ────────────────────────────────────────────────────

async function regeneratePlaylistForScreen(screenId: string): Promise<void> {
  // Get all approved ad groups targeting this screen
  const approvedTargets = await db
    .select({
      adGroupId: adGroupScreens.adGroupId,
      impressionDurationSec: adGroups.impressionDurationSec,
    })
    .from(adGroupScreens)
    .innerJoin(adGroups, eq(adGroupScreens.adGroupId, adGroups.id))
    .where(
      and(
        eq(adGroupScreens.screenId, screenId),
        eq(adGroupScreens.approvalStatus, "approved"),
        eq(adGroups.status, "active")
      )
    )
    .limit(100);

  if (approvedTargets.length === 0) {
    // Clear playlist if nothing approved
    await db
      .update(playlists)
      .set({
        jsonBlob: { items: [] },
        generatedAt: new Date(),
      })
      .where(eq(playlists.screenId, screenId));
    return;
  }

  // Get all active ads for these ad groups
  const adGroupIds = approvedTargets.map((t) => t.adGroupId);

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
    .from(ads)
    .innerJoin(creatives, eq(ads.creativeId, creatives.id))
    .where(
      and(
        inArray(ads.adGroupId, adGroupIds),
        eq(ads.status, "active"),
        eq(creatives.status, "ready")
      )
    )
    .limit(500);

  // Build playlist items
  const durationMap = new Map(
    approvedTargets.map((t) => [t.adGroupId, t.impressionDurationSec])
  );

  const playlistItems = generatePlaylist(adRows, durationMap);

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
        jsonBlob: { items: playlistItems },
        generatedAt: new Date(),
        version: (existing[0]?.version ?? 0) + 1,
      })
      .where(eq(playlists.screenId, screenId));
  } else {
    await db.insert(playlists).values({
      screenId,
      jsonBlob: { items: playlistItems },
      version: 1,
    });
  }
}

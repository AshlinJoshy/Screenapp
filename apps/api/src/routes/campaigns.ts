import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { campaigns, adGroups, ads, adGroupScreens, screens } from "@adscreen/db";
import { db } from "../db.js";
import { requireAuth, requireRole, type AuthEnv } from "../middleware/auth.js";
import { previewBid } from "../services/auction.js";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  dailyBudgetCents: z.number().int().positive("Daily budget must be positive"),
});

const updateCampaignSchema = createCampaignSchema.partial();

const createAdGroupSchema = z.object({
  name: z.string().min(1).max(200),
  impressionDurationSec: z
    .number()
    .int()
    .min(5, "Minimum 5 seconds")
    .max(300, "Maximum 300 seconds"),
  dailyBudgetCents: z.number().int().positive(),
  targetScreenIds: z
    .array(z.string().uuid())
    .min(1, "Must target at least one screen"),
});

const updateAdGroupSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  impressionDurationSec: z.number().int().min(5).max(300).optional(),
  dailyBudgetCents: z.number().int().positive().optional(),
  status: z.enum(["active", "paused"]).optional(),
});

const addAdSchema = z.object({
  creativeId: z.string().uuid(),
  name: z.string().max(200).optional(),
  weight: z.number().int().min(1).max(1000).default(100),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const campaignsRouter = new Hono<AuthEnv>();

// ── Campaign CRUD ─────────────────────────────────────────────────────────────

// GET /api/campaigns
campaignsRouter.get("/", requireAuth, requireRole("advertiser"), async (c) => {
  const user = c.var.user;

  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.status,
      startDate: campaigns.startDate,
      endDate: campaigns.endDate,
      dailyBudgetCents: campaigns.dailyBudgetCents,
      totalSpendCents: campaigns.totalSpendCents,
      createdAt: campaigns.createdAt,
    })
    .from(campaigns)
    .where(eq(campaigns.advertiserId, user.sub))
    .limit(200);

  return c.json(rows);
});

// POST /api/campaigns
campaignsRouter.post(
  "/",
  requireAuth,
  requireRole("advertiser"),
  zValidator("json", createCampaignSchema),
  async (c) => {
    const user = c.var.user;
    const body = c.req.valid("json");

    if (body.endDate <= body.startDate) {
      return c.json({ error: "endDate must be after startDate" }, 422);
    }

    const [campaign] = await db
      .insert(campaigns)
      .values({
        advertiserId: user.sub,
        name: body.name,
        startDate: body.startDate,
        endDate: body.endDate,
        dailyBudgetCents: body.dailyBudgetCents,
      })
      .returning();

    return c.json(campaign, 201);
  }
);

// GET /api/campaigns/:id
campaignsRouter.get("/:id", requireAuth, requireRole("advertiser"), async (c) => {
  const user = c.var.user;
  const campaignId = c.req.param("id");

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, campaignId),
        eq(campaigns.advertiserId, user.sub)
      )
    )
    .limit(1);

  if (!campaign) {
    return c.json({ error: "Campaign not found" }, 404);
  }

  // Also fetch ad groups
  const groups = await db
    .select()
    .from(adGroups)
    .where(eq(adGroups.campaignId, campaignId))
    .limit(100);

  return c.json({ ...campaign, adGroups: groups });
});

// PATCH /api/campaigns/:id
campaignsRouter.patch(
  "/:id",
  requireAuth,
  requireRole("advertiser"),
  zValidator("json", updateCampaignSchema),
  async (c) => {
    const user = c.var.user;
    const campaignId = c.req.param("id");
    const body = c.req.valid("json");

    const [existing] = await db
      .select({ id: campaigns.id, status: campaigns.status })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.id, campaignId),
          eq(campaigns.advertiserId, user.sub)
        )
      )
      .limit(1);

    if (!existing) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    if (existing.status === "completed" || existing.status === "archived") {
      return c.json(
        { error: "Cannot update a completed or archived campaign" },
        422
      );
    }

    const [updated] = await db
      .update(campaigns)
      .set(body)
      .where(eq(campaigns.id, campaignId))
      .returning();

    return c.json(updated);
  }
);

// DELETE /api/campaigns/:id  (only draft campaigns)
campaignsRouter.delete(
  "/:id",
  requireAuth,
  requireRole("advertiser"),
  async (c) => {
    const user = c.var.user;
    const campaignId = c.req.param("id");

    const [existing] = await db
      .select({ id: campaigns.id, status: campaigns.status })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.id, campaignId),
          eq(campaigns.advertiserId, user.sub)
        )
      )
      .limit(1);

    if (!existing) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    if (existing.status !== "draft") {
      return c.json(
        { error: "Only draft campaigns can be deleted" },
        422
      );
    }

    await db.delete(campaigns).where(eq(campaigns.id, campaignId));
    return c.json({ success: true });
  }
);

// ── Ad Groups ─────────────────────────────────────────────────────────────────

// GET /api/campaigns/:id/ad-groups
campaignsRouter.get(
  "/:id/ad-groups",
  requireAuth,
  requireRole("advertiser"),
  async (c) => {
    const user = c.var.user;
    const campaignId = c.req.param("id");

    // Verify campaign ownership
    const [campaign] = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.id, campaignId),
          eq(campaigns.advertiserId, user.sub)
        )
      )
      .limit(1);

    if (!campaign) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const groups = await db
      .select()
      .from(adGroups)
      .where(eq(adGroups.campaignId, campaignId))
      .limit(100);

    return c.json(groups);
  }
);

// POST /api/campaigns/:id/ad-groups
campaignsRouter.post(
  "/:id/ad-groups",
  requireAuth,
  requireRole("advertiser"),
  zValidator("json", createAdGroupSchema),
  async (c) => {
    const user = c.var.user;
    const campaignId = c.req.param("id");
    const body = c.req.valid("json");

    // Verify campaign ownership
    const [campaign] = await db
      .select({ id: campaigns.id, dailyBudgetCents: campaigns.dailyBudgetCents })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.id, campaignId),
          eq(campaigns.advertiserId, user.sub)
        )
      )
      .limit(1);

    if (!campaign) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    // Validate all target screens exist and are active
    const targetScreens = await db
      .select({
        id: screens.id,
        floorCpsCents: screens.floorCpsCents,
        name: screens.name,
      })
      .from(screens)
      .where(eq(screens.isActive, true))
      .limit(500);

    const screenMap = new Map(targetScreens.map((s) => [s.id, s]));
    const missingScreens = body.targetScreenIds.filter(
      (id) => !screenMap.has(id)
    );

    if (missingScreens.length > 0) {
      return c.json(
        { error: `Screen(s) not found or inactive: ${missingScreens.join(", ")}` },
        422
      );
    }

    // Validate budget viability on each target screen (preview check)
    const viabilityIssues: string[] = [];
    for (const screenId of body.targetScreenIds) {
      const screen = screenMap.get(screenId)!;
      const preview = previewBid(
        screen.floorCpsCents,
        0, // assume solo advertiser for minimum check
        body.impressionDurationSec,
        body.dailyBudgetCents
      );

      if (!preview.isViable) {
        viabilityIssues.push(
          `Budget too low for screen "${screen.name}". ` +
            `Need at least $${(preview.minDailyBudgetCents / 100).toFixed(2)}/day ` +
            `to get 1 impression. Current budget: $${(body.dailyBudgetCents / 100).toFixed(2)}/day.`
        );
      }
    }

    if (viabilityIssues.length > 0) {
      return c.json({ error: "Budget too low", details: viabilityIssues }, 422);
    }

    // Create ad group
    const [group] = await db
      .insert(adGroups)
      .values({
        campaignId,
        name: body.name,
        impressionDurationSec: body.impressionDurationSec,
        dailyBudgetCents: body.dailyBudgetCents,
      })
      .returning();

    // Create screen targets (pending approval)
    if (body.targetScreenIds.length > 0) {
      await db.insert(adGroupScreens).values(
        body.targetScreenIds.map((screenId) => ({
          adGroupId: group.id,
          screenId,
          approvalStatus: "pending" as const,
        }))
      );
    }

    // Fetch the targets we just created
    const targets = await db
      .select()
      .from(adGroupScreens)
      .where(eq(adGroupScreens.adGroupId, group.id))
      .limit(100);

    return c.json({ ...group, targets }, 201);
  }
);

// PATCH /api/ad-groups/:id
campaignsRouter.patch(
  "/ad-groups/:id",
  requireAuth,
  requireRole("advertiser"),
  zValidator("json", updateAdGroupSchema),
  async (c) => {
    const user = c.var.user;
    const groupId = c.req.param("id");
    const body = c.req.valid("json");

    // Verify ownership via campaign
    const [group] = await db
      .select({ id: adGroups.id, campaignId: adGroups.campaignId })
      .from(adGroups)
      .where(eq(adGroups.id, groupId))
      .limit(1);

    if (!group) {
      return c.json({ error: "Ad group not found" }, 404);
    }

    const [campaign] = await db
      .select({ advertiserId: campaigns.advertiserId })
      .from(campaigns)
      .where(eq(campaigns.id, group.campaignId))
      .limit(1);

    if (!campaign || campaign.advertiserId !== user.sub) {
      return c.json({ error: "Access denied" }, 403);
    }

    const [updated] = await db
      .update(adGroups)
      .set(body)
      .where(eq(adGroups.id, groupId))
      .returning();

    return c.json(updated);
  }
);

// ── Ads (creatives in an ad group) ───────────────────────────────────────────

// POST /api/ad-groups/:id/ads
campaignsRouter.post(
  "/ad-groups/:id/ads",
  requireAuth,
  requireRole("advertiser"),
  zValidator("json", addAdSchema),
  async (c) => {
    const user = c.var.user;
    const groupId = c.req.param("id");
    const body = c.req.valid("json");

    // Verify ownership
    const [group] = await db
      .select({ id: adGroups.id, campaignId: adGroups.campaignId })
      .from(adGroups)
      .where(eq(adGroups.id, groupId))
      .limit(1);

    if (!group) {
      return c.json({ error: "Ad group not found" }, 404);
    }

    const [campaign] = await db
      .select({ advertiserId: campaigns.advertiserId })
      .from(campaigns)
      .where(eq(campaigns.id, group.campaignId))
      .limit(1);

    if (!campaign || campaign.advertiserId !== user.sub) {
      return c.json({ error: "Access denied" }, 403);
    }

    const [ad] = await db
      .insert(ads)
      .values({
        adGroupId: groupId,
        creativeId: body.creativeId,
        name: body.name,
        weight: body.weight,
      })
      .returning();

    return c.json(ad, 201);
  }
);

// GET /api/ad-groups/:id/ads
campaignsRouter.get(
  "/ad-groups/:id/ads",
  requireAuth,
  requireRole("advertiser"),
  async (c) => {
    const user = c.var.user;
    const groupId = c.req.param("id");

    const [group] = await db
      .select({ id: adGroups.id, campaignId: adGroups.campaignId })
      .from(adGroups)
      .where(eq(adGroups.id, groupId))
      .limit(1);

    if (!group) {
      return c.json({ error: "Ad group not found" }, 404);
    }

    const [campaign] = await db
      .select({ advertiserId: campaigns.advertiserId })
      .from(campaigns)
      .where(eq(campaigns.id, group.campaignId))
      .limit(1);

    if (!campaign || campaign.advertiserId !== user.sub) {
      return c.json({ error: "Access denied" }, 403);
    }

    const adList = await db
      .select()
      .from(ads)
      .where(eq(ads.adGroupId, groupId))
      .limit(50);

    return c.json(adList);
  }
);

// DELETE /api/ad-groups/:id/ads/:adId
campaignsRouter.delete(
  "/ad-groups/:id/ads/:adId",
  requireAuth,
  requireRole("advertiser"),
  async (c) => {
    const user = c.var.user;
    const groupId = c.req.param("id");
    const adId = c.req.param("adId");

    const [group] = await db
      .select({ campaignId: adGroups.campaignId })
      .from(adGroups)
      .where(eq(adGroups.id, groupId))
      .limit(1);

    if (!group) {
      return c.json({ error: "Ad group not found" }, 404);
    }

    const [campaign] = await db
      .select({ advertiserId: campaigns.advertiserId })
      .from(campaigns)
      .where(eq(campaigns.id, group.campaignId))
      .limit(1);

    if (!campaign || campaign.advertiserId !== user.sub) {
      return c.json({ error: "Access denied" }, 403);
    }

    await db
      .delete(ads)
      .where(and(eq(ads.id, adId), eq(ads.adGroupId, groupId)));

    return c.json({ success: true });
  }
);

// POST /api/ad-groups/:id/submit — submit for approval
campaignsRouter.post(
  "/ad-groups/:id/submit",
  requireAuth,
  requireRole("advertiser"),
  async (c) => {
    const user = c.var.user;
    const groupId = c.req.param("id");

    const [group] = await db
      .select()
      .from(adGroups)
      .where(eq(adGroups.id, groupId))
      .limit(1);

    if (!group) {
      return c.json({ error: "Ad group not found" }, 404);
    }

    const [campaign] = await db
      .select({ advertiserId: campaigns.advertiserId })
      .from(campaigns)
      .where(eq(campaigns.id, group.campaignId))
      .limit(1);

    if (!campaign || campaign.advertiserId !== user.sub) {
      return c.json({ error: "Access denied" }, 403);
    }

    // Must have at least one ad
    const adCount = await db
      .select({ id: ads.id })
      .from(ads)
      .where(and(eq(ads.adGroupId, groupId), eq(ads.status, "active")))
      .limit(1);

    if (adCount.length === 0) {
      return c.json(
        { error: "Ad group must have at least one active ad before submitting" },
        422
      );
    }

    // Must have at least one target screen
    const targets = await db
      .select({ id: adGroupScreens.id, screenId: adGroupScreens.screenId })
      .from(adGroupScreens)
      .where(eq(adGroupScreens.adGroupId, groupId))
      .limit(100);

    if (targets.length === 0) {
      return c.json(
        { error: "Ad group must target at least one screen before submitting" },
        422
      );
    }

    // Set all pending approvals (create if they don't exist yet)
    await db
      .update(adGroupScreens)
      .set({ approvalStatus: "pending" })
      .where(eq(adGroupScreens.adGroupId, groupId));

    // Activate campaign if still draft
    await db
      .update(campaigns)
      .set({ status: "active" })
      .where(
        and(
          eq(campaigns.id, group.campaignId),
          eq(campaigns.status, "draft")
        )
      );

    return c.json({
      adGroupId: group.id,
      targetsSubmitted: targets.length,
      status: "pending",
    });
  }
);

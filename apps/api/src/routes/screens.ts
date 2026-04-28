import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, ilike, sql } from "drizzle-orm";
import { screens, users } from "@adscreen/db";
import { db } from "../db.js";
import { requireAuth, requireRole, type AuthEnv } from "../middleware/auth.js";
import { generateApiKey } from "../utils/crypto.js";
import { computeAspectRatio } from "../utils/aspect-ratio.js";

const venueTypes = [
  "gym",
  "retail",
  "airport",
  "billboard",
  "restaurant",
  "hotel",
  "transport",
  "office",
  "education",
  "healthcare",
  "entertainment",
  "other",
] as const;

const createScreenSchema = z.object({
  name: z.string().min(1).max(200),
  // Location
  address: z.string().min(1, "Address is required"),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  country: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  // Physical specs (MANDATORY)
  physicalWidthCm: z.number().int().positive("Physical width is required"),
  physicalHeightCm: z.number().int().positive("Physical height is required"),
  screenDiagonalIn: z.number().positive("Screen diagonal size is required"),
  // Digital specs
  resolutionW: z.number().int().positive("Resolution width is required"),
  resolutionH: z.number().int().positive("Resolution height is required"),
  orientation: z.enum(["landscape", "portrait"]),
  // Content settings
  acceptsImages: z.boolean().default(true),
  acceptsVideos: z.boolean().default(true),
  // Venue info
  venueType: z.enum(venueTypes).optional(),
  venueName: z.string().max(200).optional(),
  estimatedDailyViews: z.number().int().nonnegative().optional(),
  operatingHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  operatingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  isOpen24h: z.boolean().default(false),
  // Pricing
  floorCpsCents: z
    .number()
    .int()
    .nonnegative("Floor price cannot be negative"),
});

const updateScreenSchema = createScreenSchema.partial();

const publicFiltersSchema = z.object({
  country: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  venueType: z.enum(venueTypes).optional(),
  orientation: z.enum(["landscape", "portrait"]).optional(),
  acceptsImages: z.coerce.boolean().optional(),
  acceptsVideos: z.coerce.boolean().optional(),
  minResolutionW: z.coerce.number().optional(),
  minDiagonalIn: z.coerce.number().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const screensRouter = new Hono<AuthEnv>();

// ─── Owner / Admin: List own screens ────────────────────────────────────────

screensRouter.get("/", requireAuth, requireRole("owner", "admin"), async (c) => {
  const user = c.var.user;
  const isAdmin = user.role === "admin";

  const rows = await db
    .select()
    .from(screens)
    .where(isAdmin ? undefined : eq(screens.ownerId, user.sub))
    .limit(500);

  // Never expose api_key in list view
  return c.json(
    rows.map(({ apiKey: _apiKey, ...screen }) => screen)
  );
});

// ─── Public: Browse screens with filters ────────────────────────────────────

screensRouter.get(
  "/public",
  requireAuth,
  zValidator("query", publicFiltersSchema),
  async (c) => {
    const filters = c.req.valid("query");
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = [eq(screens.isActive, true)];

    if (filters.country) {
      conditions.push(ilike(screens.country, filters.country));
    }
    if (filters.state) {
      conditions.push(ilike(screens.state, filters.state));
    }
    if (filters.city) {
      conditions.push(ilike(screens.city, filters.city));
    }
    if (filters.venueType) {
      conditions.push(eq(screens.venueType, filters.venueType));
    }
    if (filters.orientation) {
      conditions.push(eq(screens.orientation, filters.orientation));
    }
    if (filters.acceptsImages !== undefined) {
      conditions.push(eq(screens.acceptsImages, filters.acceptsImages));
    }
    if (filters.acceptsVideos !== undefined) {
      conditions.push(eq(screens.acceptsVideos, filters.acceptsVideos));
    }
    if (filters.minResolutionW) {
      conditions.push(
        sql`${screens.resolutionW} >= ${filters.minResolutionW}`
      );
    }
    if (filters.minDiagonalIn) {
      conditions.push(
        sql`CAST(${screens.screenDiagonalIn} AS DECIMAL) >= ${filters.minDiagonalIn}`
      );
    }

    const rows = await db
      .select({
        id: screens.id,
        name: screens.name,
        status: screens.status,
        address: screens.address,
        latitude: screens.latitude,
        longitude: screens.longitude,
        country: screens.country,
        state: screens.state,
        city: screens.city,
        physicalWidthCm: screens.physicalWidthCm,
        physicalHeightCm: screens.physicalHeightCm,
        screenDiagonalIn: screens.screenDiagonalIn,
        resolutionW: screens.resolutionW,
        resolutionH: screens.resolutionH,
        orientation: screens.orientation,
        aspectRatio: screens.aspectRatio,
        acceptsImages: screens.acceptsImages,
        acceptsVideos: screens.acceptsVideos,
        maxImageSizeMb: screens.maxImageSizeMb,
        maxVideoSizeMb: screens.maxVideoSizeMb,
        maxVideoDurationSec: screens.maxVideoDurationSec,
        supportedImageFormats: screens.supportedImageFormats,
        supportedVideoFormats: screens.supportedVideoFormats,
        venueType: screens.venueType,
        venueName: screens.venueName,
        estimatedDailyViews: screens.estimatedDailyViews,
        isOpen24h: screens.isOpen24h,
        operatingHoursStart: screens.operatingHoursStart,
        operatingHoursEnd: screens.operatingHoursEnd,
        floorCpsCents: screens.floorCpsCents,
        createdAt: screens.createdAt,
        ownerDisplayName: users.displayName,
      })
      .from(screens)
      .innerJoin(users, eq(screens.ownerId, users.id))
      .where(and(...conditions))
      .limit(limit)
      .offset(offset);

    return c.json({ data: rows, page, limit, total: rows.length });
  }
);

// ─── Owner: Register new screen ──────────────────────────────────────────────

screensRouter.post(
  "/",
  requireAuth,
  requireRole("owner"),
  zValidator("json", createScreenSchema),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.var.user;

    const apiKey = generateApiKey();
    const aspectRatio = computeAspectRatio(body.resolutionW, body.resolutionH);

    const [screen] = await db
      .insert(screens)
      .values({
        ownerId: user.sub,
        name: body.name,
        apiKey,
        aspectRatio,
        address: body.address,
        latitude: body.latitude?.toString(),
        longitude: body.longitude?.toString(),
        country: body.country,
        state: body.state,
        city: body.city,
        physicalWidthCm: body.physicalWidthCm,
        physicalHeightCm: body.physicalHeightCm,
        screenDiagonalIn: body.screenDiagonalIn.toString(),
        resolutionW: body.resolutionW,
        resolutionH: body.resolutionH,
        orientation: body.orientation,
        acceptsImages: body.acceptsImages,
        acceptsVideos: body.acceptsVideos,
        venueType: body.venueType,
        venueName: body.venueName,
        estimatedDailyViews: body.estimatedDailyViews,
        operatingHoursStart: body.operatingHoursStart,
        operatingHoursEnd: body.operatingHoursEnd,
        isOpen24h: body.isOpen24h,
        floorCpsCents: body.floorCpsCents,
      })
      .returning();

    return c.json(screen, 201);
  }
);

// ─── Owner / Admin: Get single screen ───────────────────────────────────────

screensRouter.get("/:id", requireAuth, requireRole("owner", "admin"), async (c) => {
  const user = c.var.user;
  const screenId = c.req.param("id");
  const isAdmin = user.role === "admin";

  const [screen] = await db
    .select()
    .from(screens)
    .where(eq(screens.id, screenId))
    .limit(1);

  if (!screen) {
    return c.json({ error: "Screen not found" }, 404);
  }

  if (!isAdmin && screen.ownerId !== user.sub) {
    return c.json({ error: "Access denied" }, 403);
  }

  return c.json(screen);
});

// ─── Owner / Admin: Update screen ───────────────────────────────────────────

screensRouter.patch(
  "/:id",
  requireAuth,
  requireRole("owner", "admin"),
  zValidator("json", updateScreenSchema),
  async (c) => {
    const user = c.var.user;
    const screenId = c.req.param("id");
    const body = c.req.valid("json");
    const isAdmin = user.role === "admin";

    const [existing] = await db
      .select({ id: screens.id, ownerId: screens.ownerId })
      .from(screens)
      .where(eq(screens.id, screenId))
      .limit(1);

    if (!existing) {
      return c.json({ error: "Screen not found" }, 404);
    }

    if (!isAdmin && existing.ownerId !== user.sub) {
      return c.json({ error: "Access denied" }, 403);
    }

    const updateData: Record<string, unknown> = { ...body };

    // Recompute aspect ratio if resolution changed
    if (body.resolutionW !== undefined || body.resolutionH !== undefined) {
      const [current] = await db
        .select({ resolutionW: screens.resolutionW, resolutionH: screens.resolutionH })
        .from(screens)
        .where(eq(screens.id, screenId));
      const w = body.resolutionW ?? current.resolutionW;
      const h = body.resolutionH ?? current.resolutionH;
      updateData.aspectRatio = computeAspectRatio(w, h);
    }

    if (body.latitude !== undefined) {
      updateData.latitude = body.latitude.toString();
    }
    if (body.longitude !== undefined) {
      updateData.longitude = body.longitude.toString();
    }
    if (body.screenDiagonalIn !== undefined) {
      updateData.screenDiagonalIn = body.screenDiagonalIn.toString();
    }

    const [updated] = await db
      .update(screens)
      .set(updateData)
      .where(eq(screens.id, screenId))
      .returning();

    return c.json(updated);
  }
);

// ─── Owner / Admin: Deactivate screen ───────────────────────────────────────

screensRouter.delete("/:id", requireAuth, requireRole("owner", "admin"), async (c) => {
  const user = c.var.user;
  const screenId = c.req.param("id");
  const isAdmin = user.role === "admin";

  const [existing] = await db
    .select({ id: screens.id, ownerId: screens.ownerId })
    .from(screens)
    .where(eq(screens.id, screenId))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Screen not found" }, 404);
  }

  if (!isAdmin && existing.ownerId !== user.sub) {
    return c.json({ error: "Access denied" }, 403);
  }

  await db
    .update(screens)
    .set({ isActive: false })
    .where(eq(screens.id, screenId));

  return c.json({ success: true });
});

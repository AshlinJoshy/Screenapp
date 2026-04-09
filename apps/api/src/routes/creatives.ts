import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { creatives } from "@adscreen/db";
import { db } from "../db.js";
import { requireAuth, requireRole, type AuthEnv } from "../middleware/auth.js";
import { generatePresignedUploadUrl } from "../services/storage.js";

const uploadUrlSchema = z.object({
  name: z.string().min(1).max(200),
  filename: z.string().min(1).max(500),
  contentType: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
});

const confirmUploadSchema = z.object({
  durationSec: z.number().positive().optional(),
  widthPx: z.number().int().positive().optional(),
  heightPx: z.number().int().positive().optional(),
  mimeType: z.string().optional(),
});

export const creativesRouter = new Hono<AuthEnv>();

// GET /api/creatives — list advertiser's creatives
creativesRouter.get("/", requireAuth, requireRole("advertiser"), async (c) => {
  const user = c.var.user;

  const rows = await db
    .select({
      id: creatives.id,
      name: creatives.name,
      filename: creatives.filename,
      type: creatives.type,
      status: creatives.status,
      storageUrl: creatives.storageUrl,
      thumbnailUrl: creatives.thumbnailUrl,
      fileSizeBytes: creatives.fileSizeBytes,
      durationSec: creatives.durationSec,
      widthPx: creatives.widthPx,
      heightPx: creatives.heightPx,
      aspectRatio: creatives.aspectRatio,
      mimeType: creatives.mimeType,
      createdAt: creatives.createdAt,
    })
    .from(creatives)
    .where(eq(creatives.advertiserId, user.sub))
    .limit(200);

  return c.json(rows);
});

// POST /api/creatives/upload-url — get presigned R2 URL
creativesRouter.post(
  "/upload-url",
  requireAuth,
  requireRole("advertiser"),
  zValidator("json", uploadUrlSchema),
  async (c) => {
    const user = c.var.user;
    const body = c.req.valid("json");

    // Determine type from content type
    const isVideo = body.contentType.startsWith("video/");
    const isImage = body.contentType.startsWith("image/");

    if (!isVideo && !isImage) {
      return c.json(
        { error: "Unsupported content type. Must be image/* or video/*" },
        422
      );
    }

    const type = isVideo ? "video" : "image";

    // Create the creative record first (status: processing)
    const [creative] = await db
      .insert(creatives)
      .values({
        advertiserId: user.sub,
        name: body.name,
        filename: body.filename,
        type,
        status: "processing",
        fileSizeBytes: body.fileSizeBytes,
        mimeType: body.contentType,
      })
      .returning({ id: creatives.id });

    // Generate presigned upload URL
    const { uploadUrl, fileUrl, expiresAt } = await generatePresignedUploadUrl({
      creativeId: creative.id,
      filename: body.filename,
      contentType: body.contentType,
    });

    return c.json(
      {
        creativeId: creative.id,
        uploadUrl,
        fileUrl,
        expiresAt,
      },
      201
    );
  }
);

// POST /api/creatives/:id/confirm — confirm upload complete
creativesRouter.post(
  "/:id/confirm",
  requireAuth,
  requireRole("advertiser"),
  zValidator("json", confirmUploadSchema),
  async (c) => {
    const user = c.var.user;
    const creativeId = c.req.param("id");
    const body = c.req.valid("json");

    const [existing] = await db
      .select({ id: creatives.id, advertiserId: creatives.advertiserId })
      .from(creatives)
      .where(eq(creatives.id, creativeId))
      .limit(1);

    if (!existing) {
      return c.json({ error: "Creative not found" }, 404);
    }

    if (existing.advertiserId !== user.sub) {
      return c.json({ error: "Access denied" }, 403);
    }

    // Compute aspect ratio if dimensions provided
    let aspectRatio: string | undefined;
    if (body.widthPx && body.heightPx) {
      const { computeAspectRatio } = await import("../utils/aspect-ratio.js");
      aspectRatio = computeAspectRatio(body.widthPx, body.heightPx);
    }

    const [updated] = await db
      .update(creatives)
      .set({
        status: "processing", // worker will set to 'ready' after processing
        durationSec: body.durationSec?.toString(),
        widthPx: body.widthPx,
        heightPx: body.heightPx,
        mimeType: body.mimeType,
        aspectRatio,
      })
      .where(eq(creatives.id, creativeId))
      .returning({
        id: creatives.id,
        status: creatives.status,
        type: creatives.type,
      });

    return c.json(updated);
  }
);

// DELETE /api/creatives/:id
creativesRouter.delete(
  "/:id",
  requireAuth,
  requireRole("advertiser"),
  async (c) => {
    const user = c.var.user;
    const creativeId = c.req.param("id");

    const [existing] = await db
      .select({ id: creatives.id, advertiserId: creatives.advertiserId })
      .from(creatives)
      .where(eq(creatives.id, creativeId))
      .limit(1);

    if (!existing) {
      return c.json({ error: "Creative not found" }, 404);
    }

    if (existing.advertiserId !== user.sub) {
      return c.json({ error: "Access denied" }, 403);
    }

    await db.delete(creatives).where(
      and(eq(creatives.id, creativeId), eq(creatives.advertiserId, user.sub))
    );

    return c.json({ success: true });
  }
);

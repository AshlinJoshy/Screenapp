/**
 * Creative Processor Job
 *
 * Triggered when an advertiser confirms a creative upload.
 * Extracts metadata (duration, dimensions) and generates a thumbnail.
 *
 * In production this would use ffprobe/ffmpeg or a third-party transcoding
 * service (e.g. Cloudflare Stream, AWS MediaConvert). For now we:
 *  - Mark video creatives as "ready" with the data supplied at confirm time
 *  - Mark image creatives as "ready" immediately
 *  - Set status to "failed" if required fields are missing
 */

import { eq } from "drizzle-orm";
import type { Job } from "bullmq";
import { db } from "../db.js";
import { creatives } from "@adscreen/db";

export interface CreativeJobData {
  creativeId: string;
  storageUrl: string;
  type: "video" | "image";
  durationSec?: number;
  widthPx?: number;
  heightPx?: number;
}

export async function processCreative(job: Job<CreativeJobData>) {
  const { creativeId, storageUrl, type, durationSec, widthPx, heightPx } = job.data;

  console.log(`[creative] Processing ${type} creative ${creativeId}`);

  try {
    // Validate minimum required metadata
    if (type === "video" && !durationSec) {
      throw new Error("Video creative missing durationSec");
    }
    if ((widthPx && !heightPx) || (!widthPx && heightPx)) {
      throw new Error("Dimensions must be provided together (widthPx + heightPx)");
    }

    // Compute aspect ratio if dimensions provided
    let aspectRatio: string | undefined;
    if (widthPx && heightPx) {
      const gcd = computeGcd(widthPx, heightPx);
      aspectRatio = `${widthPx / gcd}:${heightPx / gcd}`;
    }

    // Generate thumbnail URL (real implementation would call ffmpeg/Sharp)
    // For now, use the storageUrl with a `.thumb.jpg` suffix
    const thumbnailUrl = storageUrl.replace(/\.[^.]+$/, ".thumb.jpg");

    await db
      .update(creatives)
      .set({
        status: "ready",
        storageUrl,
        thumbnailUrl,
        durationSec: durationSec ?? null,
        widthPx: widthPx ?? null,
        heightPx: heightPx ?? null,
        aspectRatio: aspectRatio ?? null,
      })
      .where(eq(creatives.id, creativeId));

    console.log(`[creative] Creative ${creativeId} marked ready`);
    await job.updateProgress(100);
  } catch (err) {
    console.error(`[creative] Failed to process creative ${creativeId}:`, err);
    await db
      .update(creatives)
      .set({ status: "failed" })
      .where(eq(creatives.id, creativeId));
    throw err; // BullMQ will retry
  }
}

function computeGcd(a: number, b: number): number {
  return b === 0 ? a : computeGcd(b, a % b);
}
